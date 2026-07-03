import express from "express";
import { fileURLToPath } from "url";
import pathmod from "path";
import { loadStats, addToStats, resetStats } from "./lib/stats.js";
import { loadBlocklist, addToBlocklist, removeFromBlocklist, resetBlocklist, isBlocked, backupBlocklist, loadBlocklistBackup, restoreBlocklistBackup, loadNamedBackups, createNamedBackup, restoreNamedBackup, deleteNamedBackup } from "./lib/blocklist.js";
import { getGmailClient, fetchEmails, fetchSenderEmails, fetchLabeledEmails, blockSender, labelSender, scanAndCleanBlocklist, scanAndLabelTier, scanAndApplyRules, snapshotInboxSize, ensureLabel, getLabelId, extractEmail, extractName, trashMessage, untrashMessage, archiveMessage, archiveThread, getDelPendSummary, trashDelPend, countMatchingEmails, BULK_GUARD_THRESHOLD, reapplyTier, reapplyBlocklist, reapplyRules, undoReapply, buildReapplyQuery, buildQueueQuery } from "./lib/gmail.js";
import { loadViplist, addToViplist, removeFromViplist, isViplisted } from "./lib/viplist.js";
import { loadOklist, addToOklist, removeFromOklist, isOklisted } from "./lib/oklist.js";
import { isListedSender } from "./lib/listedSender.js";
import { tryUnsubscribe, unsubLabel } from "./lib/unsub.js";
import { shell, triageEmailRow, esc } from "./lib/html.js";
import { homePage, triagePage, statsPage, blocklistPage, viplistPage, oklistPage, listsPage, senderPage, labeledPage, reviewPage, settingsPage, rulesPage, eventsPage, APP_VERSION } from "./lib/pages.js";
import { getHealthReport, readHealthInputs, readWebAsset, resolveWebDist, probeGmailAuth } from "./lib/health.js";
import { shapeTriageEmail, filterHidden, normalizeGuard, ACTION_DISPATCH } from "./lib/triageApi.js";
import { keepAndClean } from "./lib/keepClean.js";
import { analyzeEmail } from "./lib/claude.js";
import { getCalendarClient, createCalendarEvent } from "./lib/calendar.js";
import { loadReview, addToReview, updateReview, removeFromReview } from "./lib/review.js";
import { loadSettings, addLocation, removeLocation, setTimezone, setScheduler, setDailySummary, setDailySummaryDebug, setDailySummarySchedule, setLastTriageAt, setListsViewMode, addEventInterest, removeEventInterest, updateEventInterest, setEventsSearchSettings, clearScannedEmailIds, clearWebSearchLastRunAt, setLastReapply, clearLastReapply, getBulkGuardThreshold } from "./lib/settings.js";
import { loadRules, addRule, updateRule, deleteRule, toggleRule } from "./lib/rules.js";
import { startScheduler, startDailySummaryScheduler, restartDailySummaryScheduler, runScheduledScan, scanAll, loadScanLog, sendDailySummary, startEventsSearchScheduler, runEventsSearchNow } from "./lib/scheduler.js";
import { sendEventsEmail } from "./lib/eventSearch.js";
import { appendLog, loadLog } from "./lib/activityLog.js";
import { loadFoundEvents, ignoreFoundEvent, setEventCalendarLink, pruneInvalidEmailEvents, saveFoundEvents } from "./lib/foundEvents.js";

const app  = express();
const PORT = 3000;

function findPart(part, mimeType) {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part.body.data;
  if (part.parts) { for (const p of part.parts) { const f = findPart(p, mimeType); if (f) return f; } }
  return null;
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── List-overlap conflict detection (pure JS, no Gmail API needed) ───────────
function getListConflicts(viplist, oklist, blocklist) {
  const byEmail = {};
  for (const e of viplist)   { const k = e.email.toLowerCase(); (byEmail[k] = byEmail[k] || { email: k, name: e.name, lists: new Set() }).lists.add("VIP"); }
  for (const e of oklist)    { const k = e.email.toLowerCase(); (byEmail[k] = byEmail[k] || { email: k, name: e.name, lists: new Set() }).lists.add("OK"); }
  for (const e of blocklist) { const k = e.email.toLowerCase(); (byEmail[k] = byEmail[k] || { email: k, name: e.name||null, lists: new Set() }).lists.add("Block"); }
  return Object.values(byEmail).filter(e => e.lists.size > 1).map(e => ({ ...e, lists: [...e.lists] }));
}

// ─── Home ──────────────────────────────────────────────────────────────────────
app.get("/", async (req, res) => {
  let delPendSummary = null;
  try {
    const gmail = await getGmailClient();
    delPendSummary = await getDelPendSummary(gmail);
  } catch(e) { /* show home page without Gmail sections if Gmail fails */ }
  const bl = loadBlocklist(), vip = loadViplist(), ok = loadOklist();
  const listConflicts = getListConflicts(vip, ok, bl);
  res.send(shell("Gmail Triage", homePage(bl, vip, ok, delPendSummary, listConflicts)));
});

// ─── Triage ────────────────────────────────────────────────────────────────────
app.get("/triage", async (req, res) => {
  try {
    const gmail      = await getGmailClient();
    const blocklist  = loadBlocklist();
    const savedStats = loadStats();

    const { lastTriageAt } = loadSettings();
    const scheduledResults = loadScanLog()
      .filter(e => e.runAt && (!lastTriageAt || new Date(e.runAt) > new Date(lastTriageAt)));
    const { scanClean, scanVip, scanOk, scanRules } = await scanAll(gmail);
    const scanResults = [...scheduledResults, ...scanClean, ...scanVip, ...scanOk, ...scanRules];
    for (const r of scanRules) { if (r.moved > 0) appendLog({ type:"rule", ruleName:r.email, label:r.labelName, count:r.moved }); }
    const hideListed = req.query.hideListed === "1";
    const skipSender = hideListed ? isListedSender : null;
    const emails = await fetchEmails(gmail, 25, { skipSender });
    snapshotInboxSize(gmail).then(size => { if (size !== null) addToStats({ inboxSize: size }); }).catch(() => {});
    const filtered = emails.filter(e => !isBlocked(extractEmail(e.from), extractName(e.from)));
    const { body, script } = triagePage(filtered, blocklist, savedStats, scanResults, hideListed);
    res.send(shell("Triage", body, script));
    setLastTriageAt(); // stamp after response is sent
  } catch(e) {
    // If the failure happened AFTER the response was sent (e.g. setLastTriageAt),
    // a second send would throw ERR_HTTP_HEADERS_SENT and crash the process — log instead.
    if (res.headersSent) { console.error("[/triage] post-response error:", e.stack || e.message); return; }
    res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${esc(e.message)}\n${esc(e.stack)}</pre></div>`));
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────────────
app.get("/stats", (req, res) => {
  try {
    const { body, script } = statsPage(loadStats(), loadBlocklist());
    res.send(shell("Stats", body, script));
  } catch(e) {
    res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${esc(e.message)}\n${esc(e.stack)}</pre></div>`));
  }
});

// ─── Blocklist Manager ─────────────────────────────────────────────────────────
app.get("/blocklist", (req, res) => {
  const list = loadBlocklist().sort((a,b) => a.email.localeCompare(b.email));
  res.send(shell("Blocklist", blocklistPage(list)));
});
app.post("/blocklist/add",    (req, res) => { const {email,name,reason}=req.body; if(email)addToBlocklist(email.trim().toLowerCase(),reason||"manual",name?.trim()||null); res.redirect("/blocklist"); });
app.post("/blocklist/bulk",   (req, res) => { (req.body.emails||"").split("\n").map(l=>l.trim()).filter(Boolean).forEach(l=>addToBlocklist(l.toLowerCase(),req.body.reason||"manual")); res.redirect("/blocklist"); });
app.post("/blocklist/remove", (req, res) => { removeFromBlocklist(req.body.email, req.body.name); res.redirect("/blocklist"); });

// ─── VIP List Manager ──────────────────────────────────────────────────────────
app.get("/viplist",  (req, res) => { res.send(shell("VIP List", viplistPage(loadViplist().sort((a,b)=>a.email.localeCompare(b.email))))); });
app.post("/viplist/add",    (req, res) => { const {email,name}=req.body; if(email)addToViplist(email.trim().toLowerCase(),name?.trim()||null); res.redirect("/viplist"); });
app.post("/viplist/bulk",   (req, res) => { (req.body.emails||"").split("\n").map(l=>l.trim()).filter(Boolean).forEach(l=>addToViplist(l.toLowerCase())); res.redirect("/viplist"); });
app.post("/viplist/remove", (req, res) => { removeFromViplist(req.body.email, req.body.name||null); res.redirect("/viplist"); });

// ─── OK List Manager ───────────────────────────────────────────────────────────
app.get("/oklist",  (req, res) => { res.send(shell("OK List", oklistPage(loadOklist().sort((a,b)=>a.email.localeCompare(b.email))))); });
app.post("/oklist/add",    (req, res) => { const {email,name}=req.body; if(email)addToOklist(email.trim().toLowerCase(),name?.trim()||null); res.redirect("/oklist"); });
app.post("/oklist/bulk",   (req, res) => { (req.body.emails||"").split("\n").map(l=>l.trim()).filter(Boolean).forEach(l=>addToOklist(l.toLowerCase())); res.redirect("/oklist"); });
app.post("/oklist/remove", (req, res) => { removeFromOklist(req.body.email, req.body.name||null); res.redirect("/oklist"); });

// ─── Unified Lists page ────────────────────────────────────────────────────────
app.get("/lists", (req, res) => {
  try {
    const { body, script } = listsPage(loadBlocklist(), loadViplist(), loadOklist(), loadBlocklistBackup(), loadNamedBackups(), loadSettings().listsViewMode);
    res.send(shell("Label Lists", body, script));
  } catch(e) { res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`)); }
});
app.post("/lists/remove", (req, res) => {
  const { email, name, listType } = req.body;
  if (listType === 'block') removeFromBlocklist(email, name);
  else if (listType === 'vip') removeFromViplist(email, name || null);
  else if (listType === 'ok') removeFromOklist(email, name || null);
  res.redirect("/lists");
});
app.post("/lists/reset-blocklist", (req, res) => {
  backupBlocklist();
  resetBlocklist();
  res.redirect("/lists");
});
app.post("/lists/backup", (req, res) => {
  try { const n = createNamedBackup(); res.json({ ok: true, n }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

// ─── API: Reapply list labels across all mail ─────────────────────────────────
app.post("/api/reapply", async (req, res) => {
  const { list, confirmed } = req.body;
  if (!["vip", "ok", "blocklist", "rules"].includes(list)) {
    return res.status(400).json({ ok: false, error: "Invalid list" });
  }
  try {
    const gmail = await getGmailClient();

    // Load the appropriate list
    let entries;
    if (list === "vip") entries = loadViplist();
    else if (list === "ok") entries = loadOklist();
    else if (list === "blocklist") entries = loadBlocklist();
    else entries = loadRules().filter(r => r.enabled !== false);

    if (!entries.length) return res.json({ ok: true, list, totalLabeled: 0, results: [] });

    // Bulk guard: count per-entry emails
    if (!confirmed) {
      let totalCount = 0;
      const breakdown = [];
      for (const entry of entries) {
        const email = entry.email || '';
        const label = list === "rules" ? entry.name : email;
        const q = buildReapplyQuery(list, entry);
        if (!q) continue;
        const count = await countMatchingEmails(gmail, q);
        totalCount += count;
        if (count > 0) breakdown.push({ entry: label, count, query: q });
      }
      if (totalCount > getBulkGuardThreshold(BULK_GUARD_THRESHOLD)) {
        const top10 = breakdown.sort((a, b) => b.count - a.count).slice(0, 10);
        const lines = top10.map(b => `  ${b.entry}: ~${b.count}`).join('\n');
        return res.json({
          ok: false, guard: true, count: totalCount, list, breakdown,
          message: `This will reapply labels to ~${totalCount} emails across ${entries.length} entries.\n\nTop contributors:\n${lines}\n\nConfirm?`
        });
      }
    }

    // Execute reapply with SSE progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendProgress = (p) => res.write(`data: ${JSON.stringify({ type: 'progress', ...p })}\n\n`);

    let results;
    if (list === "vip") {
      results = await reapplyTier(gmail, entries, "..VIP", sendProgress);
    } else if (list === "ok") {
      results = await reapplyTier(gmail, entries, "..OK", sendProgress);
    } else if (list === "blocklist") {
      results = await reapplyBlocklist(gmail, entries, sendProgress);
    } else {
      results = await reapplyRules(gmail, entries, sendProgress);
    }

    const totalLabeled = results.reduce((sum, r) => sum + r.labeled, 0);

    // Capture an undo record (#6): per-entry batches of the exact message IDs
    // modified + the label add/remove sets reapply applied, so /api/reapply/undo
    // can invert them. Last-run-per-list; cap total IDs to bound settings.json.
    const REAPPLY_UNDO_CAP = 5000;
    const batches = results.filter(r => r.ids?.length).map(r => {
      if (list === "blocklist") return { addLabelIds: [".DelPend"], removeLabelIds: ["INBOX", "UNREAD"], ids: r.ids };
      if (list === "rules")     return { addLabelIds: [r.label], removeLabelIds: r.skipInbox ? ["INBOX", "UNREAD"] : [], ids: r.ids };
      return { addLabelIds: [list === "vip" ? "..VIP" : "..OK"], removeLabelIds: [], ids: r.ids }; // tier (vip/ok)
    });
    const undoTotal = batches.reduce((n, b) => n + b.ids.length, 0);
    let undoable = null;
    if (undoTotal > 0 && undoTotal <= REAPPLY_UNDO_CAP) {
      setLastReapply(list, { list, ts: new Date().toISOString(), batches });
      undoable = { list, count: undoTotal };
    } else if (undoTotal > REAPPLY_UNDO_CAP) {
      clearLastReapply(list); // too large to retain a record; don't offer a stale undo
    }
    res.write(`data: ${JSON.stringify({ type: 'done', ok: true, list, totalLabeled, results, undoable })}\n\n`);
    res.end();
  } catch (e) {
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
});

// ─── API: Undo the last reapply for a list (#6) ───────────────────────────────
// Backend capability for the future React Lists port (the old /lists UI is retiring).
// Inverts the captured batches via undoReapply; the record is cleared on success so a
// second undo is a no-op 404. UNREAD is re-added wholesale (read state is not restored)
// — surfaced honestly in the response caveat.
app.post("/api/reapply/undo", async (req, res) => {
  const { list } = req.body || {};
  try {
    const record = loadSettings().lastReapply?.[list];
    if (!record?.batches?.length) return res.status(404).json({ ok: false, error: "no_undo_record" });
    const gmail = await getGmailClient();
    const { reversed, markedUnread } = await undoReapply(gmail, record);
    clearLastReapply(list);
    res.json({ ok: true, list, reversed, caveat: markedUnread ? "Some previously-read mail was marked unread (read state is not restored)." : null });
  } catch (e) {
    if (isAuthError(e)) return res.status(503).json({ ok: false, error: "gmail_auth" });
    triageServerError(res, e, "/api/reapply/undo", true);
  }
});

// ─── API: Reapply preview (dry run — counts only, no labeling) ────────────────
app.post("/api/reapply/preview", async (req, res) => {
  const { list } = req.body;
  if (!["vip", "ok", "blocklist", "rules"].includes(list)) {
    return res.status(400).json({ ok: false, error: "Invalid list" });
  }
  try {
    const gmail = await getGmailClient();
    let entries;
    if (list === "vip") entries = loadViplist();
    else if (list === "ok") entries = loadOklist();
    else if (list === "blocklist") entries = loadBlocklist();
    else entries = loadRules().filter(r => r.enabled !== false);

    let totalCount = 0;
    const breakdown = [];
    for (const entry of entries) {
      const email = entry.email || '';
      const label = list === "rules" ? entry.name : email;
      const q = buildReapplyQuery(list, entry);
      if (!q) continue;
      const count = await countMatchingEmails(gmail, q);
      totalCount += count;
      breakdown.push({ entry: label, count, query: q });
    }
    breakdown.sort((a, b) => b.count - a.count);
    res.json({ ok: true, list, totalCount, entries: entries.length, breakdown });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Shared: select next triage message (throws on error; returns null if exhausted)
// Returns { id, threadId, from, subject, date, snippet, listUnsubscribe, listUnsubscribePost,
//           tier, senderKey, autoCleanedEntries } or null when the queue is exhausted.
async function selectNextTriageMessage(gmail, { seenSenders, seenIds, hideListed }) {
  const labelId = await ensureLabel(gmail, ".DelPend");
  const vipId   = getLabelId("..VIP") || await ensureLabel(gmail, "..VIP");
  const okId    = getLabelId("..OK")  || await ensureLabel(gmail, "..OK");
  const autoCleanedEntries=[];
  let pageToken=null;
  do {
    const result=await gmail.users.messages.list({userId:"me",q:buildQueueQuery(),maxResults:50,...(pageToken?{pageToken}:{})});
    const messages=result.data.messages||[];
    pageToken=result.data.nextPageToken||null;
    for(const msg of messages){
      if(seenIds.has(msg.id))continue;
      const d=await gmail.users.messages.get({userId:"me",id:msg.id,format:"metadata",metadataHeaders:["Subject","From","Date","List-Unsubscribe","List-Unsubscribe-Post"]});
      const h=d.data.payload.headers;
      const g=n=>h.find(x=>x.name===n)?.value||"";
      const fromRaw=g("From"),fromEmail=extractEmail(fromRaw),fromName=extractName(fromRaw);
      const senderKey=fromName+"<"+fromEmail+">";
      if(isBlocked(fromEmail,fromName)){
        try{ await gmail.users.messages.batchModify({userId:"me",requestBody:{ids:[msg.id],addLabelIds:[labelId],removeLabelIds:["INBOX","UNREAD"]}}); autoCleanedEntries.push({email:fromEmail,reason:"blocklist",moved:1,latestEmailDate:new Date(g("Date")).getTime()||Date.now(),subjects:[g("Subject")||"(no subject)"],ts:Date.now()}); }catch(e){console.error("auto-clean failed:",e.message);}
        continue;
      }
      if(seenSenders.has(senderKey))continue;
      const lbls=d.data.labelIds||[];
      const tier=lbls.includes(vipId)?"..VIP":lbls.includes(okId)?"..OK":null;
      if(tier&&!lbls.includes("UNREAD"))continue;
      if(hideListed&&isListedSender(fromEmail,fromName))continue;
      return {id:msg.id,threadId:msg.threadId,from:fromRaw,subject:g("Subject"),date:g("Date"),snippet:d.data.snippet,listUnsubscribe:g("List-Unsubscribe"),listUnsubscribePost:g("List-Unsubscribe-Post"),tier,senderKey,autoCleanedEntries};
    }
  } while(pageToken);
  return null; // exhausted
}

// ─── API: Next ─────────────────────────────────────────────────────────────────
app.get("/api/next", async (req, res) => {
  const seenSenders = new Set((req.query.seen||"").split(",").filter(Boolean));
  const seenIds     = new Set((req.query.seenIds||"").split(",").filter(Boolean));
  const hideListed  = req.query.hideListed === "1";
  try {
    const gmail = await getGmailClient();
    const result = await selectNextTriageMessage(gmail, { seenSenders, seenIds, hideListed });
    if(!result) return res.json({html:null,autoCleaned:0,autoCleanedEntries:[]});
    const {id,from,subject,date,snippet,listUnsubscribe,listUnsubscribePost,tier,senderKey,autoCleanedEntries}=result;
    const autoCleaned=autoCleanedEntries.length;
    return res.json({html:triageEmailRow({id,subject,from,date,snippet,listUnsubscribe,listUnsubscribePost,tier}),autoCleaned,autoCleanedEntries,senderKey,msgId:id});
  } catch(e){ console.error("Next error:",e.message); res.json({html:null,autoCleaned:0,autoCleanedEntries:[]}); }
});

// ─── API: Tier ─────────────────────────────────────────────────────────────────
app.post("/api/tier", async (req, res) => {
  const {id,fromEmail,fromName,tier,confirmed}=req.body;
  if(!["..VIP","..OK"].includes(tier))return res.status(400).json({ok:false,error:"Invalid tier"});
  try{
    const gmail=await getGmailClient();
    const isVip=tier==="..VIP";
    const alreadyListed=isVip?isViplisted(fromEmail,fromName||null):isOklisted(fromEmail,fromName||null);
    let labeled=0;
    if(!alreadyListed){
      if(!confirmed){
        const q=`from:"${fromEmail}" in:inbox -in:sent -in:trash`;
        const count=await countMatchingEmails(gmail,q);
        if(count>getBulkGuardThreshold(BULK_GUARD_THRESHOLD)){
          return res.json({ok:false,guard:true,count,email:fromEmail,message:`This will label ${count} emails from ${fromEmail}. Confirm?`});
        }
      }
      if(isVip) addToViplist(fromEmail,fromName||null);
      else      addToOklist(fromEmail,fromName||null);
      labeled=await labelSender(gmail,tier,fromEmail,fromName||null,[]);
      addToStats({[isVip?"vip":"ok"]:labeled});
    } else {
      // Already listed — count inbox emails that were auto-labeled by the scan
      const q=`from:${fromEmail} in:inbox -in:sent -in:trash`;
      const r=await gmail.users.messages.list({userId:"me",q,maxResults:500});
      labeled=(r.data.messages||[]).length;
    }
    if(id) await gmail.users.messages.modify({userId:"me",id,requestBody:{removeLabelIds:["UNREAD"]}});
    appendLog({ type:"triage", action:isVip?"vip":"ok", sender:fromEmail, senderName:fromName||null, count:labeled });
    res.json({ok:true,labeled,tier});
  }catch(e){res.status(500).json({ok:false,error:e.message,labeled:0});}
});

// ─── API: OK & Clean ───────────────────────────────────────────────────────────
app.post("/api/ok-clean", async (req, res) => {
  const {id,fromEmail,fromName,confirmed}=req.body;
  try{
    const gmail=await getGmailClient();
    // Guard checks the bulk .DelPend operation on other emails from sender
    if(!confirmed){
      const q=`from:"${fromEmail}" in:inbox -label:..VIP -in:sent -in:trash`;
      const count=await countMatchingEmails(gmail,q);
      if(count>getBulkGuardThreshold(BULK_GUARD_THRESHOLD)){
        return res.json({ok:false,guard:true,count,email:fromEmail,message:`This will clean ${count} emails from ${fromEmail}. Confirm?`});
      }
    }
    const { cleaned } = await keepAndClean(gmail, id, fromEmail, fromName || null);
    addToOklist(fromEmail, fromName || null);
    addToStats({cleaned});
    appendLog({ type:"triage", action:"ok-clean", sender:fromEmail, senderName:fromName||null, count:cleaned });
    res.json({ok:true,cleaned});
  }catch(e){res.status(500).json({ok:false,error:e.message,cleaned:0});}
});

// ─── API: VIP & Clean ──────────────────────────────────────────────────────────
// Adds sender to VIP list (future mail gets ..VIP), then DelPends ALL current
// inbox mail from sender (including the clicked one) — same as OK & Clean but
// the future-state list is VIP.
app.post("/api/vip-clean", async (req, res) => {
  const {id,fromEmail,fromName,confirmed}=req.body;
  try{
    const gmail=await getGmailClient();
    if(!confirmed){
      const q=`from:"${fromEmail}" in:inbox -label:..VIP -in:sent -in:trash`;
      const count=await countMatchingEmails(gmail,q);
      if(count>getBulkGuardThreshold(BULK_GUARD_THRESHOLD)){
        return res.json({ok:false,guard:true,count,email:fromEmail,message:`This will clean ${count} emails from ${fromEmail}. Confirm?`});
      }
    }
    const { cleaned } = await keepAndClean(gmail, id, fromEmail, fromName || null);
    addToViplist(fromEmail, fromName || null);
    addToStats({cleaned});
    appendLog({ type:"triage", action:"vip-clean", sender:fromEmail, senderName:fromName||null, count:cleaned });
    res.json({ok:true,cleaned});
  }catch(e){res.status(500).json({ok:false,error:e.message,cleaned:0});}
});

// ─── API: Junk ─────────────────────────────────────────────────────────────────
app.post("/api/junk", async (req, res) => {
  const {fromEmail,fromName,confirmed}=req.body;
  try{
    const gmail=await getGmailClient();
    if(!confirmed){
      const q=`from:"${fromEmail}" -in:sent -in:trash`;
      const count=await countMatchingEmails(gmail,q);
      if(count>getBulkGuardThreshold(BULK_GUARD_THRESHOLD)){
        return res.json({ok:false,guard:true,count,email:fromEmail,message:`This will label ${count} emails from ${fromEmail} as junk. Confirm?`});
      }
    }
    addToBlocklist(fromEmail,"junk",fromName||null);
    const moved=await blockSender(gmail,fromEmail,fromName||null);
    addToStats({junked:moved});
    appendLog({ type:"triage", action:"junk", sender:fromEmail, senderName:fromName||null, count:moved });
    res.json({ok:true,moved});
  }catch(e){res.status(500).json({ok:false,error:e.message,moved:0});}
});

// ─── API: Unsub ────────────────────────────────────────────────────────────────
app.post("/api/unsub", async (req, res) => {
  const {fromEmail, fromName, unsubUrl, unsubPost} = req.body;
  try {
    const gmail = await getGmailClient();
    const {result, openTab, openTabUrl} = await tryUnsubscribe(gmail, unsubUrl, unsubPost, fromEmail);
    addToBlocklist(fromEmail, "unsub", fromName || null);
    const moved = await blockSender(gmail, fromEmail, fromName || null);
    addToStats({junked: moved, unsubbed: 1});
    appendLog({ type:"triage", action:"unsub", sender:fromEmail, senderName:fromName||null, count:moved, unsubResult:result });
    res.json({ok: true, moved, unsubResult: result, unsubLabel: unsubLabel(result), openTab, openTabUrl});
  } catch(e) {
    res.status(500).json({ok: false, error: e.message, moved: 0});
  }
});

// ─── API: Delete (single message to Trash) ────────────────────────────────────
app.post("/api/delete", async (req, res) => {
  const { id } = req.body;
  try {
    const gmail = await getGmailClient();
    await trashMessage(gmail, id);
    appendLog({ type:"triage", action:"delete", msgId:id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API: Archive (read + remove inbox; archives full thread if threadId given) ─
app.post("/api/archive", async (req, res) => {
  const { id, threadId } = req.body;
  try {
    const gmail = await getGmailClient();
    if (threadId) {
      await archiveThread(gmail, threadId);
    } else {
      await archiveMessage(gmail, id);
    }
    appendLog({ type:"triage", action:"archive", msgId:id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Sender detail page ────────────────────────────────────────────────────────
app.get("/sender", async (req, res) => {
  const { email, name } = req.query;
  if (!email) return res.redirect("/");
  try {
    const gmail = await getGmailClient();
    const emails = await fetchSenderEmails(gmail, email);
    const { body, script } = senderPage(emails, email, name || null);
    res.send(shell(name || email, body, script));
  } catch(e) {
    res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${esc(e.message)}\n${esc(e.stack)}</pre></div>`));
  }
});

// ─── Labeled emails browse ─────────────────────────────────────────────────────
app.get("/labeled", async (req, res) => {
  const { label } = req.query;
  const allowed = ["..VIP", "..OK", ".DelPend"];
  if (!allowed.includes(label)) return res.redirect("/");
  try {
    const gmail = await getGmailClient();
    const emails = await fetchLabeledEmails(gmail, label);
    const { body, script } = labeledPage(label, emails);
    const titles = { "..VIP": "VIP Emails", "..OK": "OK Emails", ".DelPend": "Del. Pending" };
    res.send(shell(titles[label], body, script));
  } catch(e) {
    res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`));
  }
});

// ─── API: Delete many (bulk trash by ID array) ────────────────────────────────
app.post("/api/delete-many", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, trashed: 0 });
  try {
    const gmail = await getGmailClient();
    for (let i = 0; i < ids.length; i += 1000) {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: ["TRASH"], removeLabelIds: ["INBOX", "UNREAD"] },
      });
    }
    res.json({ ok: true, trashed: ids.length });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API: DelPend bulk trash ───────────────────────────────────────────────────
app.post("/api/delpend/trash-all", async (req, res) => {
  try {
    const gmail = await getGmailClient();
    await trashDelPend(gmail, null);
    res.redirect("/");
  } catch(e) { res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`)); }
});
app.post("/api/delpend/trash-sender", async (req, res) => {
  const { email } = req.body;
  try {
    const gmail = await getGmailClient();
    await trashDelPend(gmail, email);
    res.redirect("/");
  } catch(e) { res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`)); }
});

// ─── API: List-overlap conflict resolution ────────────────────────────────────
app.post("/api/conflict/remove-from-list", (req, res) => {
  const { email, list } = req.body;
  if (list === "VIP")   removeFromViplist(email);
  else if (list === "OK")    removeFromOklist(email);
  else if (list === "Block") removeFromBlocklist(email);
  res.redirect("/");
});

// ─── Shared: build the full preview HTML document for a message ───────────────
// noMeta=true omits the From/Subject/Date header — used by the React deck which
// shows that info in the card header and would otherwise repeat it in the iframe.
async function buildPreviewDocument(gmail, id, { noMeta = false } = {}) {
  const msg=await gmail.users.messages.get({userId:"me",id,format:"full"});
  const headers=msg.data.payload.headers;
  const g=n=>headers.find(x=>x.name===n)?.value||"";
  const htmlData=findPart(msg.data.payload,"text/html");
  const plainData=findPart(msg.data.payload,"text/plain");
  const raw=htmlData||plainData;
  const decoded=raw?Buffer.from(raw,"base64url").toString("utf8"):"<p>No content</p>";
  const body=htmlData?decoded:"<pre style='white-space:pre-wrap;font-family:sans-serif;font-size:14px'>"+decoded.replace(/</g,"&lt;")+"</pre>";
  const meta=noMeta?"":"<div class='meta'><div><strong>From:</strong> "+g("From").replace(/</g,"&lt;")+"</div><div><strong>Subject:</strong> "+g("Subject").replace(/</g,"&lt;")+"</div><div><strong>Date:</strong> "+g("Date")+"</div></div>";
  return "<!DOCTYPE html><html><head><meta charset='UTF-8'/><base target='_blank'/><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}.meta{border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px;color:#475569;font-size:.85rem}.meta strong{color:#1e293b}</style></head><body>"+meta+body+"</body></html>";
}

// ─── API: Preview ──────────────────────────────────────────────────────────────
app.get("/api/preview/:id", async (req, res) => {
  try{
    const gmail=await getGmailClient();
    res.send(await buildPreviewDocument(gmail, req.params.id));
  }catch(e){res.send("<pre style='color:red'>Error: "+e.message+"</pre>");}
});

// ─── Claude Review ─────────────────────────────────────────────────────────────
app.post("/api/review", async (req, res) => {
  const { id, fromEmail, fromName, subject } = req.body;
  try {
    const gmail = await getGmailClient();
    // Fetch full email body (plain text preferred for Claude)
    const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const headers = msg.data.payload.headers;
    const g = n => headers.find(x => x.name === n)?.value || "";
    const plainRaw = findPart(msg.data.payload, "text/plain") || findPart(msg.data.payload, "text/html");
    const body = plainRaw ? Buffer.from(plainRaw, "base64url").toString("utf8").replace(/<[^>]+>/g, " ") : "";
    const from = g("From");
    const date = g("Date");

    const analysis = await analyzeEmail(subject || g("Subject"), from, body);

    const item = { id, subject: subject || g("Subject"), from, date, analysis, status: "pending", analyzedAt: new Date().toISOString() };
    addToReview(item);

    // Add For_Review Gmail label
    const labelId = await ensureLabel(gmail, "For_Review");
    await gmail.users.messages.batchModify({ userId: "me", requestBody: { ids: [id], addLabelIds: [labelId] } });

    res.json({ ok: true, analysis });
  } catch(e) { console.error("Review error:", e.message); res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/review", (req, res) => {
  try {
    const items = loadReview();
    const { body, script } = reviewPage(items);
    res.send(shell("Claude Review", body, script));
  } catch(e) { res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`)); }
});

app.post("/api/review/execute", async (req, res) => {
  const { id, action } = req.body;
  try {
    const gmail = await getGmailClient();
    const items = loadReview();
    const item = items.find(i => i.id === id);
    if (!item) return res.status(404).json({ ok: false, error: "Item not found" });
    const fromEmail = extractEmail(item.from);
    const fromName  = extractName(item.from);

    if (action === "keep") {
      await labelSender(gmail, "..OK", fromEmail, fromName, []);
      addToOklist(fromEmail, fromName || null);
    } else if (action === "archive") {
      await archiveMessage(gmail, id);
    } else if (action === "junk") {
      addToBlocklist(fromEmail, "junk", fromName || null);
      await blockSender(gmail, fromEmail, fromName || null);
    }

    // Remove For_Review label
    try {
      const labelId = await ensureLabel(gmail, "For_Review");
      await gmail.users.messages.batchModify({ userId: "me", requestBody: { ids: [id], removeLabelIds: [labelId] } });
    } catch(e) { /* label removal is best-effort */ }

    updateReview(id, { status: "executed", executedAction: action, executedAt: new Date().toISOString() });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/review/calendar", async (req, res) => {
  const { id, eventIndex, event } = req.body;
  try {
    const cal = getCalendarClient();
    const url = await createCalendarEvent(cal, event);
    // Store link in a calendarLinks map keyed by event index
    const items = loadReview();
    const item = items.find(i => i.id === id);
    const calendarLinks = { ...(item?.calendarLinks || {}) };
    calendarLinks[String(eventIndex ?? 0)] = url;
    updateReview(id, { calendarLinks });
    res.json({ ok: true, url });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/review/dismiss", async (req, res) => {
  const { id } = req.body;
  try {
    const gmail = await getGmailClient();
    // Remove For_Review label
    try {
      const labelId = await ensureLabel(gmail, "For_Review");
      await gmail.users.messages.batchModify({ userId: "me", requestBody: { ids: [id], removeLabelIds: [labelId] } });
    } catch(e) { /* best-effort */ }
    removeFromReview(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Settings ──────────────────────────────────────────────────────────────────
app.get("/settings", (req, res) => {
  try {
    const { body, script } = settingsPage(loadSettings(), loadBlocklistBackup(), loadNamedBackups(), loadLog());
    res.send(shell("Settings", body, script));
  } catch(e) { res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`)); }
});

app.post("/settings/locations/add", (req, res) => {
  const { location } = req.body;
  if (location?.trim()) addLocation(location.trim());
  res.redirect("/settings");
});

app.post("/settings/locations/remove", (req, res) => {
  const { location } = req.body;
  if (location) removeLocation(location);
  res.redirect("/settings");
});
app.post("/settings/timezone", (req, res) => {
  const { timezone } = req.body;
  if (timezone?.trim()) setTimezone(timezone.trim());
  res.redirect("/settings");
});
app.post("/settings/scheduler", (req, res) => {
  const { enabled, startHour, startMinute, intervalHours } = req.body;
  setScheduler(enabled === "on", startHour ?? 10, startMinute ?? 0, intervalHours ?? 2);
  res.redirect("/settings");
});
app.post("/settings/daily-summary", (req, res) => {
  const { enabled, email } = req.body;
  setDailySummary(enabled === "on", email);
  res.redirect("/settings");
});
app.post("/settings/daily-summary-schedule", (req, res) => {
  const { hour, minute, intervalValue, intervalUnit } = req.body;
  setDailySummarySchedule(hour, minute, intervalUnit, intervalValue);
  restartDailySummaryScheduler();
  res.redirect("/settings");
});
app.post("/settings/daily-summary/debug", (req, res) => {
  const { enabled } = req.body;
  setDailySummaryDebug(!!enabled);
  const s = loadSettings();
  res.json({ ok: true, enabledAt: s.dailySummaryDebugEnabledAt || null });
});
app.post("/settings/lists-view-mode", (req, res) => {
  setListsViewMode(req.body.mode);
  res.redirect("/settings");
});
app.post("/settings/daily-summary/test", async (req, res) => {
  try {
    const gmail = await getGmailClient();
    const sent = await sendDailySummary(gmail, { force: true });
    res.json({ ok: true, sent });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
app.post("/settings/run-scan", async (req, res) => {
  try {
    const { timeLabel, totalMoved, blocklistMoved, vipMoved, okMoved, rulesMoved } = await runScheduledScan(getGmailClient);
    res.json({ ok: true, totalMoved, blocklistMoved, vipMoved, okMoved, rulesMoved: rulesMoved || 0, timeLabel });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ─── Rules ─────────────────────────────────────────────────────────────────────
app.get("/rules", (req, res) => {
  try {
    const { body, script } = rulesPage(loadRules());
    res.send(shell("Rules", body, script));
  } catch(e) { res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`)); }
});
app.post("/rules/add", (req, res) => {
  const { name, senders, subjects, label, skipInbox } = req.body;
  if (!label?.trim()) return res.redirect("/rules");
  addRule({
    name: name?.trim() || '',
    senders: (senders || '').split('\n').map(s => s.trim()).filter(Boolean),
    subjects: (subjects || '').split('\n').map(s => s.trim()).filter(Boolean),
    label: label.trim(),
    skipInbox: skipInbox === 'on',
  });
  res.redirect("/rules");
});
app.post("/rules/delete", (req, res) => {
  deleteRule(req.body.id);
  res.redirect("/rules");
});
app.post("/rules/toggle", (req, res) => {
  toggleRule(req.body.id);
  res.redirect("/rules");
});
app.post("/rules/edit", (req, res) => {
  const { id, name, senders, subjects, label, skipInbox } = req.body;
  if (!id || !label?.trim()) return res.redirect("/rules");
  updateRule(id, {
    name: name?.trim() || '',
    senders: (senders || '').split('\n').map(s => s.trim()).filter(Boolean),
    subjects: (subjects || '').split('\n').map(s => s.trim()).filter(Boolean),
    label: label.trim(),
    skipInbox: skipInbox === 'on',
  });
  res.redirect("/rules");
});

// ─── Debug / Reset ─────────────────────────────────────────────────────────────
app.get("/debug", async (req, res) => {
  const out=[];
  try{
    const gmail=await getGmailClient();out.push("✅ Gmail auth OK");
    const labelList=await gmail.users.labels.list({userId:"me"});
    const labels=labelList.data.labels||[];
    out.push("\n📋 Labels ("+labels.length+"):");
    for(const l of labels)out.push("  "+l.id+"  "+l.name);
    for(const n of [".DelPend","..VIP","..OK"]){const l=labels.find(x=>x.name===n);out.push(l?"✅ "+n+": id="+l.id:"⚠️  "+n+" does not exist");}
    const bl=loadBlocklist();out.push("\n🚫 Blocklist ("+bl.length+"):");
    for(const e of bl)out.push("  "+(e.name?e.name+" <"+e.email+">":e.email)+"  ["+e.reason+"]");
  }catch(e){out.push("\n❌ "+e.message+"\n"+e.stack);}
  res.send("<pre style='font-family:monospace;padding:24px;line-height:1.6'>"+out.join("\n")+"</pre>");
});

app.post("/settings/restore-blocklist-backup", (req, res) => {
  try { restoreBlocklistBackup(req.body.merge === 'true'); res.redirect("/settings"); }
  catch(e) { res.redirect("/settings"); }
});
app.post("/settings/restore-named-backup", (req, res) => {
  try { restoreNamedBackup(parseInt(req.body.n), req.body.merge === 'true'); res.redirect("/settings"); }
  catch(e) { res.redirect("/settings"); }
});
app.post("/settings/delete-named-backup", (req, res) => {
  try { deleteNamedBackup(parseInt(req.body.n)); } catch(e) {}
  res.redirect("/settings");
});
app.get("/reset", (req, res) => { resetStats(); res.redirect("/"); });

// ─── Events ────────────────────────────────────────────────────────────────────
app.get("/events", (req, res) => {
  const { body, script } = eventsPage(loadFoundEvents(), loadSettings());
  res.send(shell("Events", body, script));
});
app.post("/events/search", async (req, res) => {
  try {
    await runEventsSearchNow(getGmailClient);
  } catch(e) { console.error("events search error:", e.message); }
  const ref = req.headers.referer || '/events';
  res.redirect(ref.includes('/settings') ? '/settings' : '/events');
});
app.post("/events/send-email", async (req, res) => {
  try {
    const gmail = await getGmailClient();
    await pruneInvalidEmailEvents(gmail);
    const today = new Date().toISOString().slice(0, 10);
    const active = loadFoundEvents().filter(e => !e.ignored && (!e.date || e.date >= today));
    await sendEventsEmail(gmail, active, loadSettings());
  } catch(e) { console.error("events send-email error:", e.message); }
  res.redirect("/events");
});

app.post("/events/reset-rebuild", async (req, res) => {
  try {
    saveFoundEvents([]);
    clearScannedEmailIds();
    clearWebSearchLastRunAt();
    await runEventsSearchNow(getGmailClient);
  } catch(e) { console.error("events reset-rebuild error:", e.message); }
  res.redirect("/events");
});
app.post("/events/ignore", (req, res) => {
  ignoreFoundEvent(req.body.id);
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return res.json({ ok: true, id: req.body.id });
  }
  res.redirect("/events");
});
app.post("/events/calendar", async (req, res) => {
  const { id, title, date, time, location, description, url } = req.body;
  try {
    const calendar = await getCalendarClient();
    const link = await createCalendarEvent(calendar, { title, date, time, location, description, url });
    if (id) setEventCalendarLink(id, link);
  } catch(e) { console.error("events calendar error:", e.message); }
  res.redirect("/events");
});

// ─── Event interests settings ──────────────────────────────────────────────────
app.post("/settings/event-interests/add", (req, res) => {
  addEventInterest(req.body.topic || '');
  res.redirect("/settings");
});
app.post("/settings/event-interests/remove", (req, res) => {
  removeEventInterest(req.body.topic || '');
  res.redirect("/settings");
});
app.post("/settings/event-interests/edit", (req, res) => {
  if (req.body.old && req.body.new) updateEventInterest(req.body.old, req.body.new);
  res.redirect("/settings");
});
app.post("/settings/events-search", (req, res) => {
  setEventsSearchSettings(req.body.enabled === '1', req.body.intervalDays, req.body.email);
  res.redirect("/settings");
});

// ─── Health (unauthenticated; cheap signals, no Gmail API call) ──────────────────
app.get("/health", async (req, res) => {
  const webAsset = readWebAsset(WEB_DIST, process.env.WEB_APP_ENABLED !== "0");
  // Opt-in deep probe (#33): actually exercise the OAuth refresh via getProfile, which
  // catches a present-but-REJECTED refresh token (the F25 class the cheap token-file
  // check misses). Off by default — set HEALTH_DEEP_PROBE=1 to enable (one Gmail call
  // per poll; transient errors are reported, not failed).
  let liveAuth;
  if (process.env.HEALTH_DEEP_PROBE === "1") {
    try { liveAuth = await probeGmailAuth(await getGmailClient()); }
    catch (e) { liveAuth = isAuthError(e) ? "invalid" : "error"; }
  }
  const { ok, body } = getHealthReport({
    version: APP_VERSION,
    uptimeSec: process.uptime(),
    now: Date.now(),
    ...readHealthInputs(),
    webAsset,
    liveAuth,
  });
  res.status(ok ? 200 : 503).json(body);
});

// ─── Auth error classifier ──────────────────────────────────────────────────────
function isAuthError(e) { return e?.response?.status===401||/invalid_grant/i.test(e?.message||""); }

// Log the real error server-side, return a generic message to the client. Keeps internal
// detail (paths, library internals, stack hints) out of the JSON API responses while
// preserving debuggability in the container logs.
function triageServerError(res, e, label, withOk = false) {
  console.error(`[${label}] error:`, e?.stack || e?.message || e);
  res.status(500).json(withOk ? { ok: false, error: "Internal server error" } : { error: "Internal server error" });
}

// ─── API: Triage queue (React) ─────────────────────────────────────────────────
app.get("/api/triage/queue", async (req, res) => {
  const hideListed = req.query.hideListed === "1";
  const limit = parseInt(req.query.limit, 10) || 25;
  try {
    const gmail = await getGmailClient();
    // Skip listed senders DURING fetch (draw from the larger pool until `limit`
    // unlisted are found), exactly like the live /triage. A post-fetch filter alone
    // returned an EMPTY queue whenever the newest `limit` messages were all VIP/OK-
    // listed — leaving no card to advance to. filterHidden still drops blocked mail.
    const skipSender = hideListed ? isListedSender : null;
    // FIX a — exclude already-labeled ..VIP/..OK at the query level in hidden mode.
    // FIX b — walk up to 10 inbox pages so the queue reaches unprocessed mail
    // buried past the newest 100 (the deck refills, so it surfaces deeper batches
    // as you triage). 10 pages ≈ 1000 messages bounds worst-case API cost.
    const raw = await fetchEmails(gmail, limit, { skipSender, maxPages: 10, excludeListedLabels: hideListed });
    const emails = filterHidden(raw, { hideListed }).map(shapeTriageEmail);
    res.json({ emails, counts: { left: emails.length } });
  } catch(e) {
    if (isAuthError(e)) return res.status(503).json({ error: "gmail_auth" });
    triageServerError(res, e, "/api/triage/queue");
  }
});

// ─── API: Triage next (React) ──────────────────────────────────────────────────
app.get("/api/triage/next", async (req, res) => {
  const seenSenders = new Set((req.query.seen||"").split(",").filter(Boolean));
  const seenIds     = new Set((req.query.seenIds||"").split(",").filter(Boolean));
  const hideListed  = req.query.hideListed === "1";
  try {
    const gmail = await getGmailClient();
    const result = await selectNextTriageMessage(gmail, { seenSenders, seenIds, hideListed });
    if (!result) return res.json({ email: null, autoCleaned: [] });
    res.json({ email: shapeTriageEmail(result), autoCleaned: result.autoCleanedEntries });
  } catch(e) {
    if (isAuthError(e)) return res.status(503).json({ error: "gmail_auth" });
    triageServerError(res, e, "/api/triage/next");
  }
});

// ─── API: Triage body (React) ──────────────────────────────────────────────────
app.get("/api/triage/body", async (req, res) => {
  const { id } = req.query;
  // Defense-in-depth (item 40): sandbox the response so a direct top-level open of the
  // body URL is isolated (unique origin, no scripts), mirroring the allow-popups iframe.
  res.set("Content-Security-Policy", "sandbox allow-popups");
  if (!id) return res.status(400).send("<pre>Missing id</pre>");
  try {
    const gmail = await getGmailClient();
    res.type("html").send(await buildPreviewDocument(gmail, id, { noMeta: true }));
  } catch(e) {
    if (isAuthError(e)) return res.status(503).json({ error: "gmail_auth" });
    console.error("[/api/triage/body] error:", e?.stack || e?.message || e);
    res.status(500).send("<pre style='color:red'>Error loading message.</pre>");
  }
});

// ─── API: Unified triage action (React) ───────────────────────────────────────
// Additive parallel surface to the old per-action routes (which stay byte-for-byte).
// Dispatches on `action`, mirrors each old route's lib calls + guard query EXACTLY,
// normalizes the guard shape, classifies auth → 503, and returns an UndoDescriptor.
app.post("/api/triage/action", async (req, res) => {
  const { action, id, threadId, fromEmail, fromName, subject, unsubUrl, unsubPost, confirmed } = req.body;
  if (!ACTION_DISPATCH[action]) return res.status(400).json({ ok: false, error: "Invalid action" });
  const name = fromName || null;
  const undoBase = { action, id, threadId: threadId || null, fromEmail, fromName: name };
  try {
    const gmail = await getGmailClient();

    if (action === "ok" || action === "vip") {
      const isVip = action === "vip";
      const alreadyListed = isVip ? isViplisted(fromEmail, name) : isOklisted(fromEmail, name);
      let labeled = 0;
      if (!alreadyListed) {
        if (!confirmed) {
          const q = `from:"${fromEmail}" in:inbox -in:sent -in:trash`;
          const count = await countMatchingEmails(gmail, q);
          if (count > getBulkGuardThreshold(BULK_GUARD_THRESHOLD))
            return res.json(normalizeGuard({ ok: false, guard: true, count, email: fromEmail, message: `This will label ${count} emails from ${fromEmail}. Confirm?` }));
        }
        if (isVip) addToViplist(fromEmail, name); else addToOklist(fromEmail, name);
        labeled = await labelSender(gmail, isVip ? "..VIP" : "..OK", fromEmail, name, []);
        addToStats({ [isVip ? "vip" : "ok"]: labeled });
      } else {
        const r = await gmail.users.messages.list({ userId: "me", q: `from:${fromEmail} in:inbox -in:sent -in:trash`, maxResults: 500 });
        labeled = (r.data.messages || []).length;
      }
      if (id) await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["UNREAD"] } });
      appendLog({ type: "triage", action, sender: fromEmail, senderName: name, count: labeled });
      return res.json({ ok: true, labeled, undo: { ...undoBase, addedToList: !alreadyListed, listName: isVip ? "vip" : "ok" } });
    }

    if (action === "ok-clean" || action === "vip-clean") {
      const isVip = action === "vip-clean";
      if (!confirmed) {
        const q = `from:"${fromEmail}" in:inbox -label:..VIP -in:sent -in:trash`;
        const count = await countMatchingEmails(gmail, q);
        if (count > getBulkGuardThreshold(BULK_GUARD_THRESHOLD))
          return res.json(normalizeGuard({ ok: false, guard: true, count, email: fromEmail, message: `This will clean ${count} emails from ${fromEmail}. Confirm?` }));
      }
      const alreadyListed = isVip ? isViplisted(fromEmail, name) : isOklisted(fromEmail, name);
      const { cleaned } = await keepAndClean(gmail, id, fromEmail, name);
      if (isVip) addToViplist(fromEmail, name); else addToOklist(fromEmail, name);
      addToStats({ cleaned });
      appendLog({ type: "triage", action, sender: fromEmail, senderName: name, count: cleaned });
      return res.json({ ok: true, labeled: cleaned, undo: { ...undoBase, addedToList: !alreadyListed, listName: isVip ? "vip" : "ok" } });
    }

    if (action === "junk") {
      if (!confirmed) {
        const q = `from:"${fromEmail}" -in:sent -in:trash`;
        const count = await countMatchingEmails(gmail, q);
        if (count > getBulkGuardThreshold(BULK_GUARD_THRESHOLD))
          return res.json(normalizeGuard({ ok: false, guard: true, count, email: fromEmail, message: `This will label ${count} emails from ${fromEmail} as junk. Confirm?` }));
      }
      const alreadyListed = !!isBlocked(fromEmail, name);
      addToBlocklist(fromEmail, "junk", name);
      const moved = await blockSender(gmail, fromEmail, name);
      addToStats({ junked: moved });
      appendLog({ type: "triage", action, sender: fromEmail, senderName: name, count: moved });
      return res.json({ ok: true, labeled: moved, undo: { ...undoBase, addedToList: !alreadyListed, listName: "blocklist" } });
    }

    if (action === "unsub") {
      const alreadyListed = !!isBlocked(fromEmail, name);
      const { result, openTab, openTabUrl } = await tryUnsubscribe(gmail, unsubUrl, unsubPost, fromEmail);
      addToBlocklist(fromEmail, "unsub", name);
      const moved = await blockSender(gmail, fromEmail, name);
      addToStats({ junked: moved, unsubbed: 1 });
      appendLog({ type: "triage", action, sender: fromEmail, senderName: name, count: moved, unsubResult: result });
      return res.json({ ok: true, labeled: moved, unsubResult: result, openTab, openTabUrl, undo: { ...undoBase, addedToList: !alreadyListed, listName: "blocklist" } });
    }

    if (action === "archive") {
      if (threadId) await archiveThread(gmail, threadId); else await archiveMessage(gmail, id);
      appendLog({ type: "triage", action, msgId: id });
      return res.json({ ok: true, undo: { ...undoBase, addedToList: false } });
    }

    if (action === "delete") {
      await trashMessage(gmail, id);
      appendLog({ type: "triage", action, msgId: id });
      return res.json({ ok: true, undo: { ...undoBase, addedToList: false } });
    }

    if (action === "review") {
      const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const headers = msg.data.payload.headers;
      const g = n => headers.find(x => x.name === n)?.value || "";
      const plainRaw = findPart(msg.data.payload, "text/plain") || findPart(msg.data.payload, "text/html");
      const body = plainRaw ? Buffer.from(plainRaw, "base64url").toString("utf8").replace(/<[^>]+>/g, " ") : "";
      const from = g("From");
      const analysis = await analyzeEmail(subject || g("Subject"), from, body);
      const item = { id, subject: subject || g("Subject"), from, date: g("Date"), analysis, status: "pending", analyzedAt: new Date().toISOString() };
      addToReview(item);
      const labelId = await ensureLabel(gmail, "For_Review");
      await gmail.users.messages.batchModify({ userId: "me", requestBody: { ids: [id], addLabelIds: [labelId] } });
      return res.json({ ok: true, analysis, undo: { ...undoBase, addedToList: false } });
    }
  } catch(e) {
    if (isAuthError(e)) return res.status(503).json({ ok: false, error: "gmail_auth" });
    triageServerError(res, e, "/api/triage/action", true);
  }
});

// ─── API: Stateless triage undo (React) ────────────────────────────────────────
// Consumes the UndoDescriptor from the body and applies the compensating call
// per ACTION_DISPATCH[action].undo. The bulk .DelPend from clean/junk is NOT
// reversed (slice scope); undo only reverses list membership + single-message moves.
app.post("/api/triage/undo", async (req, res) => {
  const d = req.body || {};
  const spec = ACTION_DISPATCH[d.action];
  if (!spec) return res.status(400).json({ ok: false, error: "Invalid action" });
  try {
    const gmail = await getGmailClient();
    if (spec.undo === "untrash") {
      await untrashMessage(gmail, d.id);
    } else if (spec.undo === "addInbox") {
      await gmail.users.messages.batchModify({ userId: "me", requestBody: { ids: [d.id], addLabelIds: ["INBOX"] } });
    } else if (spec.undo === "removeListEntry" || spec.undo === "listOnly") {
      // Idempotent-add guard (H2): only undo the list entry if THIS action added it.
      if (d.addedToList) {
        const ln = d.listName;
        if (ln === "vip")      removeFromViplist(d.fromEmail, d.fromName || null);
        else if (ln === "ok")  removeFromOklist(d.fromEmail, d.fromName || null);
        else if (ln === "blocklist") removeFromBlocklist(d.fromEmail, d.fromName || null);
      }
    }
    // spec.undo === "none" → no compensating action (unsub/review).
    res.json({ ok: true });
  } catch(e) {
    if (isAuthError(e)) return res.status(503).json({ ok: false, error: "gmail_auth" });
    triageServerError(res, e, "/api/triage/undo", true);
  }
});

// ─── React app (/app) — served from web/dist, resolved relative to THIS module
// (not process.cwd(), since the server runs from app/). resolveWebDist probes both
// the local (../web/dist) and container (/app/web/dist) layouts so /app works in
// both. Registered last, after all /api/* routes. Set WEB_APP_ENABLED=0 to disable.
const WEB_DIST = resolveWebDist(pathmod.dirname(fileURLToPath(import.meta.url)));
if (process.env.WEB_APP_ENABLED !== "0") {
  app.use("/app", express.static(WEB_DIST));
  app.get(/^\/app(\/.*)?$/, (req, res) => res.sendFile(pathmod.join(WEB_DIST, "index.html")));
}

app.listen(PORT, () => {
  console.log("Gmail triage server on http://localhost:" + PORT);
  startScheduler(getGmailClient);
  startDailySummaryScheduler(getGmailClient);
  startEventsSearchScheduler(getGmailClient);
});
