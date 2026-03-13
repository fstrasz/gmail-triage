import express from "express";
import { loadStats, addToStats, resetStats } from "./lib/stats.js";
import { loadBlocklist, addToBlocklist, removeFromBlocklist, resetBlocklist, isBlocked } from "./lib/blocklist.js";
import { getGmailClient, fetchEmails, fetchSenderEmails, blockSender, labelSender, scanAndCleanBlocklist, scanAndLabelTier, snapshotInboxSize, ensureLabel, getLabelId, extractEmail, extractName, trashMessage, archiveMessage, getDelPendSummary, trashDelPend, getKeptDelPendConflicts, removeDelPendFromSender, removeOkLabelFromSender } from "./lib/gmail.js";
import { loadViplist, addToViplist, removeFromViplist, isViplisted, loadOklist, addToOklist, removeFromOklist, isOklisted } from "./lib/viplist.js";
import { tryUnsubscribe, unsubLabel } from "./lib/unsub.js";
import { shell, emailCard } from "./lib/html.js";
import { homePage, triagePage, statsPage, blocklistPage, viplistPage, oklistPage, senderPage, reviewPage, settingsPage } from "./lib/pages.js";
import { keepAndClean } from "./lib/keepClean.js";
import { analyzeEmail } from "./lib/claude.js";
import { getCalendarClient, createCalendarEvent } from "./lib/calendar.js";
import { loadReview, addToReview, updateReview, removeFromReview } from "./lib/review.js";
import { loadSettings, addLocation, removeLocation, setTimezone, setScheduler, setDailySummary } from "./lib/settings.js";
import { startScheduler, startDailySummaryScheduler, runScheduledScan, loadScanLog, clearScanLog, sendDailySummary } from "./lib/scheduler.js";

const app  = express();
const PORT = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Home ──────────────────────────────────────────────────────────────────────
app.get("/", async (req, res) => {
  let delPendSummary = null;
  let keptDelPendConflicts = [];
  try {
    const gmail = await getGmailClient();
    [delPendSummary, keptDelPendConflicts] = await Promise.all([
      getDelPendSummary(gmail),
      getKeptDelPendConflicts(gmail),
    ]);
  } catch(e) { /* show home page without Gmail sections if Gmail fails */ }
  res.send(shell("Gmail Triage", homePage(loadBlocklist(), loadViplist(), loadOklist(), delPendSummary, keptDelPendConflicts)));
});

// ─── Triage ────────────────────────────────────────────────────────────────────
app.get("/triage", async (req, res) => {
  try {
    const gmail      = await getGmailClient();
    const blocklist  = loadBlocklist();
    const savedStats = loadStats();
    const viplist  = loadViplist();
    const oklist   = loadOklist();

    const scheduledResults = loadScanLog();
    clearScanLog();
    const [scanClean, scanVip, scanOk] = await Promise.all([
      scanAndCleanBlocklist(gmail, blocklist),
      scanAndLabelTier(gmail, viplist, "..VIP"),
      scanAndLabelTier(gmail, oklist, "..OK"),
    ]);
    const scanResults = [...scheduledResults, ...scanClean, ...scanVip, ...scanOk];
    const emails = await fetchEmails(gmail, 25);
    snapshotInboxSize(gmail).then(size => { if (size !== null) addToStats({ inboxSize: size }); }).catch(() => {});
    const filtered = emails.filter(e => !isBlocked(extractEmail(e.from), extractName(e.from)));
    const { body, script } = triagePage(filtered, blocklist, savedStats, scanResults);
    res.send(shell("Triage", body, script));
  } catch(e) {
    res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}\n${e.stack}</pre></div>`));
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────────────
app.get("/stats", (req, res) => {
  try {
    const { body, script } = statsPage(loadStats(), loadBlocklist());
    res.send(shell("Stats", body, script));
  } catch(e) {
    res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}\n${e.stack}</pre></div>`));
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

// ─── API: Next ─────────────────────────────────────────────────────────────────
app.get("/api/next", async (req, res) => {
  const seenSenders = new Set((req.query.seen||"").split(",").filter(Boolean));
  const seenIds     = new Set((req.query.seenIds||"").split(",").filter(Boolean));
  try {
    const gmail   = await getGmailClient();
    const labelId = await ensureLabel(gmail, "DelPend");
    const vipId   = getLabelId("..VIP") || await ensureLabel(gmail, "..VIP");
    const okId    = getLabelId("..OK")  || await ensureLabel(gmail, "..OK");
    let autoCleaned=0; const autoCleanedEntries=[];
    let pageToken=null;
    do {
      const result=await gmail.users.messages.list({userId:"me",q:"in:inbox -label:DelPend",maxResults:50,...(pageToken?{pageToken}:{})});
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
          try{ await gmail.users.messages.batchModify({userId:"me",requestBody:{ids:[msg.id],addLabelIds:[labelId],removeLabelIds:["INBOX","UNREAD"]}}); autoCleanedEntries.push({email:fromEmail,reason:"blocklist",moved:1}); autoCleaned++; }catch(e){console.error("auto-clean failed:",e.message);}
          continue;
        }
        if(seenSenders.has(senderKey))continue;
        const lbls=d.data.labelIds||[];
        const tier=lbls.includes(vipId)?"..VIP":lbls.includes(okId)?"..OK":null;
        // VIP/OK emails that are already read need no action — skip them
        if(tier&&!lbls.includes("UNREAD"))continue;
        return res.json({html:emailCard({id:msg.id,subject:g("Subject"),from:fromRaw,date:g("Date"),snippet:d.data.snippet,listUnsubscribe:g("List-Unsubscribe"),listUnsubscribePost:g("List-Unsubscribe-Post"),tier}),autoCleaned,autoCleanedEntries,senderKey,msgId:msg.id});
      }
    } while(pageToken);
    return res.json({html:null,autoCleaned,autoCleanedEntries});
  } catch(e){ console.error("Next error:",e.message); res.json({html:null,autoCleaned:0,autoCleanedEntries:[]}); }
});

// ─── API: Tier ─────────────────────────────────────────────────────────────────
app.post("/api/tier", async (req, res) => {
  const {id,fromEmail,fromName,tier}=req.body;
  if(!["..VIP","..OK"].includes(tier))return res.status(400).json({ok:false,error:"Invalid tier"});
  try{
    const gmail=await getGmailClient();
    const isVip=tier==="..VIP";
    const alreadyListed=isVip?isViplisted(fromEmail,fromName||null):isOklisted(fromEmail,fromName||null);
    let labeled=0;
    if(!alreadyListed){
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
    res.json({ok:true,labeled,tier});
  }catch(e){res.status(500).json({ok:false,error:e.message,labeled:0});}
});

// ─── API: OK & Clean ───────────────────────────────────────────────────────────
app.post("/api/ok-clean", async (req, res) => {
  const {id,fromEmail,fromName}=req.body;
  try{
    const gmail=await getGmailClient();
    const { cleaned } = await keepAndClean(gmail, id, fromEmail, fromName || null);
    addToOklist(fromEmail, fromName || null);
    addToStats({cleaned});
    res.json({ok:true,cleaned});
  }catch(e){res.status(500).json({ok:false,error:e.message,cleaned:0});}
});

// ─── API: Junk ─────────────────────────────────────────────────────────────────
app.post("/api/junk", async (req, res) => {
  const {fromEmail,fromName}=req.body;
  try{
    const gmail=await getGmailClient();
    addToBlocklist(fromEmail,"junk",fromName||null);
    const moved=await blockSender(gmail,fromEmail,fromName||null);
    addToStats({junked:moved});
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
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── API: Archive (read + remove inbox, single message) ──────────────────────
app.post("/api/archive", async (req, res) => {
  const { id } = req.body;
  try {
    const gmail = await getGmailClient();
    await archiveMessage(gmail, id);
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
    res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}\n${e.stack}</pre></div>`));
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

// ─── API: OK/DelPend conflict resolution ─────────────────────────────────────
app.post("/api/conflict/remove-delpend", async (req, res) => {
  const { email } = req.body;
  try {
    const gmail = await getGmailClient();
    await removeDelPendFromSender(gmail, email);
    res.redirect("/");
  } catch(e) { res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`)); }
});
app.post("/api/conflict/remove-ok", async (req, res) => {
  const { email } = req.body;
  try {
    const gmail = await getGmailClient();
    await removeOkLabelFromSender(gmail, email);
    removeFromOklist(email);          // also remove from oklist.json
    res.redirect("/");
  } catch(e) { res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}</pre></div>`)); }
});

// ─── API: Preview ──────────────────────────────────────────────────────────────
app.get("/api/preview/:id", async (req, res) => {
  try{
    const gmail=await getGmailClient();
    const msg=await gmail.users.messages.get({userId:"me",id:req.params.id,format:"full"});
    const headers=msg.data.payload.headers;
    const g=n=>headers.find(x=>x.name===n)?.value||"";
    function findPart(part,mimeType){if(!part)return null;if(part.mimeType===mimeType&&part.body?.data)return part.body.data;if(part.parts){for(const p of part.parts){const f=findPart(p,mimeType);if(f)return f;}}return null;}
    const htmlData=findPart(msg.data.payload,"text/html");
    const plainData=findPart(msg.data.payload,"text/plain");
    const raw=htmlData||plainData;
    const decoded=raw?Buffer.from(raw,"base64url").toString("utf8"):"<p>No content</p>";
    const body=htmlData?decoded:"<pre style='white-space:pre-wrap;font-family:sans-serif;font-size:14px'>"+decoded.replace(/</g,"&lt;")+"</pre>";
    res.send("<!DOCTYPE html><html><head><meta charset='UTF-8'/><base target='_blank'/><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}.meta{border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px;color:#475569;font-size:.85rem}.meta strong{color:#1e293b}</style></head><body><div class='meta'><div><strong>From:</strong> "+g("From").replace(/</g,"&lt;")+"</div><div><strong>Subject:</strong> "+g("Subject").replace(/</g,"&lt;")+"</div><div><strong>Date:</strong> "+g("Date")+"</div></div>"+body+"</body></html>");
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
    function findPart(part, mime) {
      if (!part) return null;
      if (part.mimeType === mime && part.body?.data) return part.body.data;
      if (part.parts) { for (const p of part.parts) { const f = findPart(p, mime); if (f) return f; } }
      return null;
    }
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
    const { body, script } = settingsPage(loadSettings());
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
  const { enabled, startHour, intervalHours } = req.body;
  setScheduler(enabled === "on", startHour ?? 10, intervalHours ?? 2);
  res.redirect("/settings");
});
app.post("/settings/daily-summary", (req, res) => {
  const { enabled, email } = req.body;
  setDailySummary(enabled === "on", email);
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
    const { results, timeLabel } = await runScheduledScan(
      getGmailClient, loadBlocklist, loadViplist, loadOklist, scanAndCleanBlocklist, scanAndLabelTier
    );
    res.json({ ok: true, count: results.length, timeLabel });
  } catch(e) { res.json({ ok: false, error: e.message }); }
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
    for(const n of ["DelPend","..VIP","..OK"]){const l=labels.find(x=>x.name===n);out.push(l?"✅ "+n+": id="+l.id:"⚠️  "+n+" does not exist");}
    const bl=loadBlocklist();out.push("\n🚫 Blocklist ("+bl.length+"):");
    for(const e of bl)out.push("  "+(e.name?e.name+" <"+e.email+">":e.email)+"  ["+e.reason+"]");
  }catch(e){out.push("\n❌ "+e.message+"\n"+e.stack);}
  res.send("<pre style='font-family:monospace;padding:24px;line-height:1.6'>"+out.join("\n")+"</pre>");
});

app.get("/reset", (req, res) => { resetBlocklist(); resetStats(); res.redirect("/"); });

app.listen(PORT, () => {
  console.log("Gmail triage server on http://localhost:" + PORT);
  startScheduler(getGmailClient, loadBlocklist, loadViplist, loadOklist, scanAndCleanBlocklist, scanAndLabelTier);
  startDailySummaryScheduler(getGmailClient);
});
