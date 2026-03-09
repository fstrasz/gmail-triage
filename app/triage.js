import express from "express";
import { loadStats, addToStats, resetStats } from "./lib/stats.js";
import { loadBlocklist, addToBlocklist, removeFromBlocklist, resetBlocklist } from "./lib/blocklist.js";
import { getGmailClient, fetchEmails, blockSender, labelSender, scanAndCleanBlocklist, snapshotInboxSize, ensureLabel, getLabelId, extractEmail, extractName } from "./lib/gmail.js";
import { tryUnsubscribe, unsubLabel } from "./lib/unsub.js";
import { shell, emailCard } from "./lib/html.js";

const app  = express();
const PORT = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Home ──────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  const blocklist = loadBlocklist();
  res.send(shell("Gmail Triage", `
    <div class="topbar">
      <h1>📧 Gmail Triage</h1>
      <div class="topbar-right">
        <a href="/stats" class="btn-nav">📊 Stats</a>
        <a href="/blocklist" class="btn-nav">🚫 Blocklist (${blocklist.length})</a>
      </div>
    </div>
    <div style="max-width:500px;margin:0 auto;text-align:center;padding-top:60px">
      <div style="font-size:3rem;margin-bottom:16px">📬</div>
      <h2 style="font-size:1.2rem;margin-bottom:8px">Ready to triage your inbox?</h2>
      <p style="color:#64748b;font-size:.9rem;margin-bottom:28px">
        ⭐ VIP · ✅ OK · 📁 Keep · 📁 Keep &amp; Clean · 🗑 Junk · 🚫 Unsubscribe
      </p>
      <a href="/triage" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem">▶ Start Triaging</a>
      <br>
      <a href="/reset" onclick="return confirm('Reset all stats and clear the blocklist?')" style="display:inline-block;margin-top:12px;padding:12px 28px;background:#ef4444;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem">🗑 Reset All</a>
    </div>
  `));
});

// ─── Triage ────────────────────────────────────────────────────────────────────
app.get("/triage", async (req, res) => {
  try {
    const gmail      = await getGmailClient();
    const blocklist  = loadBlocklist();
    const savedStats = loadStats();

    const [scanResults, emails] = await Promise.all([
      scanAndCleanBlocklist(gmail, blocklist),
      fetchEmails(gmail, 25),
    ]);
    snapshotInboxSize(gmail).then(size => { if (size !== null) addToStats({ inboxSize: size }); }).catch(() => {});

    const rows = emails.map(emailCard).join("");
    const dataScript = `<script type="application/json" id="page-data">${JSON.stringify({
      total: emails.length, blCount: blocklist.length, savedStats, scanResults,
      seenSenders: emails.map(e => extractName(e.from) + "<" + extractEmail(e.from) + ">"),
      seenIds: emails.map(e => e.id),
    })}</script>`;

    res.send(shell("Triage", `
      ${dataScript}
      <div class="topbar">
        <h1>📧 Triage <span style="opacity:.5;font-weight:400;font-size:.85rem">${emails.length} emails</span></h1>
        <div class="topbar-right">
          <span id="progress">0 / ${emails.length} actioned</span>
          <a href="/blocklist" class="btn-nav" id="bl-link">🚫 Blocklist (${blocklist.length})</a>
          <span class="counter" id="junk-count">0 junked</span>
        </div>
      </div>
      <div class="layout">
        <div class="email-panel" id="email-panel">
          <div class="scan-summary" id="scan-card" style="${scanResults.length === 0 ? "display:none" : ""}">
            <div class="scan-header" onclick="toggleScan()" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center">
              <span>🧹 Auto-cleaned: <span id="scan-total">0</span> emails</span>
              <span id="scan-chevron">▲</span>
            </div>
            <div id="scan-body"><div id="scan-rows"></div></div>
          </div>
          <div class="session-stats">
            <div class="stat-item"><span class="stat-num" id="stat-total">0</span><span class="stat-label">Processed</span></div>
            <div class="stat-item"><span class="stat-num stat-vip" id="stat-vip">${savedStats.vip||0}</span><span class="stat-label">⭐ VIP</span></div>
            <div class="stat-item"><span class="stat-num stat-ok" id="stat-ok">${savedStats.ok||0}</span><span class="stat-label">✅ OK</span></div>
            <div class="stat-item"><span class="stat-num stat-kept" id="stat-kept">${savedStats.kept}</span><span class="stat-label">📁 Kept</span></div>
            <div class="stat-item"><span class="stat-num stat-clean" id="stat-clean">${savedStats.cleaned}</span><span class="stat-label">📁 Cleaned</span></div>
            <div class="stat-item"><span class="stat-num stat-junk" id="stat-junk">${savedStats.junked}</span><span class="stat-label">🗑 Junked</span></div>
            <div class="stat-item"><span class="stat-num stat-unsub" id="stat-unsub">${savedStats.unsubbed}</span><span class="stat-label">🚫 Unsub</span></div>
          </div>
          <div id="email-list">${rows}</div>
          <div id="done-section" style="display:none">
            <div class="done-banner">
              <h2>✅ Triage complete!</h2>
              <p id="done-summary"></p>
              <a href="/" class="home-btn">← Back to Home</a>
            </div>
          </div>
        </div>
        <div class="preview-panel" id="preview-panel">
          <div class="preview-header">
            <span>Preview</span>
            <button class="preview-close" onclick="closePreview()">✕</button>
          </div>
          <iframe class="preview-iframe" id="preview-iframe" sandbox="allow-scripts"></iframe>
        </div>
      </div>
    `, clientScript(emails.length, savedStats)));
  } catch(e) {
    res.status(500).send(shell("Error", `<div style="padding:24px"><pre style="color:red">${e.message}\n${e.stack}</pre></div>`));
  }
});

function clientScript(total, savedStats) { return `
  var _d=JSON.parse(document.getElementById('page-data').textContent);
  var total=_d.total,blCount=_d.blCount,savedStats=_d.savedStats,scanResults=_d.scanResults;
  var seenSenders=new Set(_d.seenSenders),seenIds=new Set(_d.seenIds);
  var actioned=0,junked=savedStats.junked,unsubbed=savedStats.unsubbed;
  var kept=savedStats.kept,cleaned=savedStats.cleaned;
  var vipCount=savedStats.vip||0,okCount=savedStats.ok||0;
  var autoCleaned=0,loading=false,scanOpen=true,activePreviewId=null;
  var emailPanel=document.getElementById('email-panel');
  var previewPanel=document.getElementById('preview-panel');
  var previewIframe=document.getElementById('preview-iframe');

  function applyWidths(){emailPanel.style.width=previewPanel.classList.contains('open')?Math.floor(window.innerWidth*.52)+'px':'100%';}
  window.addEventListener('resize',applyWidths);applyWidths();

  function toggleScan(){scanOpen=!scanOpen;document.getElementById('scan-body').style.display=scanOpen?'':'none';document.getElementById('scan-chevron').textContent=scanOpen?'▲':'▼';}
  function addScanRow(email,reason,moved){
    document.getElementById('scan-card').style.display='';
    autoCleaned+=moved;document.getElementById('scan-total').textContent=autoCleaned;
    var row=document.createElement('div');row.className='scan-row';
    row.innerHTML='<span>'+email+' <span style="color:#94a3b8;font-size:.75rem">('+reason+')</span></span><span class="scan-badge">'+moved+' moved</span>';
    document.getElementById('scan-rows').appendChild(row);updateStats();
  }
  function updateStats(){
    document.getElementById('stat-total').textContent=actioned+autoCleaned;
    document.getElementById('stat-vip').textContent=vipCount;
    document.getElementById('stat-ok').textContent=okCount;
    document.getElementById('stat-kept').textContent=kept;
    document.getElementById('stat-clean').textContent=cleaned;
    document.getElementById('stat-junk').textContent=junked;
    document.getElementById('stat-unsub').textContent=unsubbed;
    document.getElementById('progress').textContent=actioned+' / '+total+' actioned';
    document.getElementById('junk-count').textContent=junked+' junked';
  }
  function updateBlCount(d){blCount+=d;document.getElementById('bl-link').textContent='🚫 Blocklist ('+blCount+')';}
  scanResults.forEach(function(r){addScanRow(r.email,r.reason,r.moved);});

  function toggleSnippet(id){openPreview(id);}
  function openPreview(id){
    if(activePreviewId===id&&previewPanel.classList.contains('open')){closePreview();return;}
    activePreviewId=id;
    previewIframe.src='/api/preview/'+id;
    previewPanel.classList.add('open');applyWidths();
    document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
    var btn=document.querySelector('#row-'+id+' .btn-expand');
    if(btn)btn.textContent='▲ Close';
  }
  function closePreview(){
    previewPanel.classList.remove('open');applyWidths();
    previewIframe.src='';
    document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
    activePreviewId=null;
  }
  function setStatus(id,cls,text){
    var tag=document.getElementById('tag-'+id);
    tag.className='status-tag '+cls;tag.textContent=text;tag.style.display='inline-block';
    document.getElementById('actions-'+id).style.display='none';
  }
  async function loadNext(){
    if(loading)return;loading=true;
    try{
      var seen=[],ids=[];
      seenSenders.forEach(function(s){seen.push(s);});seenIds.forEach(function(i){ids.push(i);});
      var r=await fetch('/api/next?seen='+encodeURIComponent(seen.join(','))+'&seenIds='+encodeURIComponent(ids.join(',')));
      var data=await r.json();
      if(data.autoCleanedEntries)data.autoCleanedEntries.forEach(function(e){addScanRow(e.email,e.reason,e.moved);});
      if(data.html){
        if(data.senderKey)seenSenders.add(data.senderKey);
        if(data.msgId)seenIds.add(data.msgId);
        var div=document.createElement('div');div.innerHTML=data.html;
        document.getElementById('email-list').appendChild(div.firstElementChild);
      }
    }catch(e){console.error('loadNext:',e);}
    loading=false;
  }
  function markDone(id,rowCls){
    var row=document.getElementById('row-'+id);
    row.classList.add('done',rowCls);actioned++;updateStats();
    // Auto-advance preview
    if(activePreviewId===id){
      var allRows=document.querySelectorAll('.email-row:not(.done)');
      var nextRow=null;
      for(var i=0;i<allRows.length;i++){if(allRows[i].id!=='row-'+id){nextRow=allRows[i];break;}}
      if(nextRow){
        openPreview(nextRow.id.replace('row-',''));
      } else {
        closePreview();
        loadNext().then(function(){
          setTimeout(function(){
            var fresh=document.querySelectorAll('.email-row:not(.done)');
            if(fresh.length)openPreview(fresh[fresh.length-1].id.replace('row-',''));
          },200);
        });
      }
    }
    setTimeout(function(){
      row.style.transition='opacity 1s,max-height 1s,margin 1s,padding 1s';
      row.style.opacity='0';row.style.maxHeight='0';row.style.marginBottom='0';row.style.overflow='hidden';
      setTimeout(function(){row.remove();loadNext();},1000);
    },15000);
    if(actioned===total)showDone();
  }
  function showDone(){
    document.getElementById('done-section').style.display='block';
    document.getElementById('done-summary').textContent=vipCount+' VIP · '+okCount+' OK · '+kept+' kept · '+cleaned+' keep & cleaned · '+junked+' junked · '+unsubbed+' unsubscribed';
    window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  }
  async function doTier(id,fromEmail,fromName,tier){
    var isVip=tier==='..VIP';
    setStatus(id,isVip?'tag-vip':'tag-ok',(isVip?'⭐':'✅')+' Working...');
    document.getElementById('row-'+id).style.borderLeft=isVip?'4px solid #f59e0b':'4px solid #14b8a6';
    markDone(id,isVip?'r-vip':'r-ok');
    try{
      var r=await fetch('/api/tier',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName,tier})});
      var data=await r.json();
      if(isVip)vipCount+=(data.labeled||0);else okCount+=(data.labeled||0);
      updateStats();
      document.getElementById('tag-'+id).textContent=(isVip?'⭐':'✅')+' '+tier+' ('+(data.labeled||0)+' labeled)';
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doKeep(id,fromEmail,fromName){
    setStatus(id,'tag-working','⏳ Keeping...');markDone(id,'r-kept');
    try{
      var r=await fetch('/api/keep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName})});
      var data=await r.json();kept+=data.kept||0;updateStats();
      document.getElementById('tag-'+id).textContent='📁 Kept ('+(data.kept||0)+' labeled)';
      document.getElementById('tag-'+id).className='status-tag tag-kept';
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doKeepClean(id,fromEmail,fromName){
    setStatus(id,'tag-working','⏳ Keeping & cleaning...');markDone(id,'r-kept');
    try{
      var r=await fetch('/api/keep-clean',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName})});
      var data=await r.json();cleaned+=data.cleaned||0;updateStats();
      document.getElementById('tag-'+id).textContent='📁 Kept · 🗑 '+(data.cleaned||0)+' older cleaned';
      document.getElementById('tag-'+id).className='status-tag tag-kept';
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doJunk(id,fromEmail,fromName){
    setStatus(id,'tag-working','⏳ Blocking...');markDone(id,'junked');
    try{
      var r=await fetch('/api/junk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName})});
      var data=await r.json();junked+=data.moved||1;updateStats();
      document.getElementById('tag-'+id).textContent='🗑 Junked ('+(data.moved||0)+' moved)';
      document.getElementById('tag-'+id).className='status-tag tag-junk';
      updateBlCount(1);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doUnsub(id,fromEmail,fromName){
    unsubbed++;
    var row=document.getElementById('row-'+id);
    setStatus(id,'tag-working','⏳ Unsubscribing...');markDone(id,'unsubbed');
    try{
      var r=await fetch('/api/unsub',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id,fromEmail,fromName,unsubUrl:row.dataset.unsubUrl,unsubPost:row.dataset.unsubPost})});
      var data=await r.json();
      if(data.openTab&&data.openTabUrl)window.open(data.openTabUrl,'_blank');
      junked+=data.moved||1;updateStats();
      document.getElementById('tag-'+id).textContent='🚫 '+(data.unsubLabel||data.unsubResult)+' · '+(data.moved||0)+' moved';
      document.getElementById('tag-'+id).className='status-tag tag-unsub';
      updateBlCount(1);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
`;}

// ─── Stats ─────────────────────────────────────────────────────────────────────
app.get("/stats", async (req, res) => {
  const stats     = loadStats();
  const blocklist = loadBlocklist();
  const daily     = stats.daily || [];
  const totals    = { vip: stats.vip||0, ok: stats.ok||0, kept: stats.kept||0, cleaned: stats.cleaned||0, junked: stats.junked||0, unsubbed: stats.unsubbed||0 };

  const last30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last30.push(daily.find(e => e.date === key) || { date: key, vip:0, ok:0, kept:0, cleaned:0, junked:0, unsubbed:0, inboxSize:null });
  }
  const topBlocked  = [...blocklist].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,15);
  const inboxSeries = daily.filter(e => e.inboxSize !== null).map(e => ({ date: e.date, size: e.inboxSize }));

  const totalMeta = [
    {k:"vip",label:"⭐ VIP",color:"#92400e"},{k:"ok",label:"✅ OK",color:"#0f766e"},
    {k:"kept",label:"📁 Kept",color:"#15803d"},{k:"cleaned",label:"📁 Keep & Cleaned",color:"#065f46"},
    {k:"junked",label:"🗑 Junked",color:"#b91c1c"},{k:"unsubbed",label:"🚫 Unsubscribed",color:"#92400e"},
  ];
  const totalCards = totalMeta.map(m => `<div class="stats-big"><div class="stats-big-num" style="color:${m.color}">${(totals[m.k]||0).toLocaleString()}</div><div class="stats-big-label">${m.label}</div></div>`).join("");
  const topRows = topBlocked.length
    ? topBlocked.map(e => { const cls=e.reason==="junk"?"bl-junk":e.reason==="unsub"?"bl-unsub":"bl-manual"; const lbl=e.name?e.name+" &lt;"+e.email+"&gt;":e.email; return `<div class="ts-row"><span class="ts-email" title="${lbl}">${lbl}</span><span class="ts-badge ${cls}">${e.reason}</span><span style="font-size:.7rem;color:#94a3b8;margin-left:8px;white-space:nowrap">${new Date(e.date).toLocaleDateString()}</span></div>`; }).join("")
    : `<div class="empty">No blocked senders yet.</div>`;

  res.send(shell("Stats", `
    <script type="application/json" id="stats-data">${JSON.stringify({last30,topBlocked,inboxSeries})}</script>
    <div class="topbar"><h1>📊 Stats Dashboard</h1><div class="topbar-right"><a href="/" style="color:#94a3b8;text-decoration:none">← Home</a></div></div>
    <div style="max-width:900px;margin:0 auto;padding:20px 16px;overflow-y:auto;height:calc(100vh - 53px)">
      <div class="stats-grid">${totalCards}</div>
      <div class="chart-wrap">
        <h3>Activity — last 30 days</h3>
        <div class="legend">
          <span><span class="legend-dot" style="background:#f59e0b"></span>VIP</span>
          <span><span class="legend-dot" style="background:#14b8a6"></span>OK</span>
          <span><span class="legend-dot" style="background:#22c55e"></span>Kept</span>
          <span><span class="legend-dot" style="background:#10b981"></span>Keep &amp; Cleaned</span>
          <span><span class="legend-dot" style="background:#ef4444"></span>Junked</span>
          <span><span class="legend-dot" style="background:#f97316"></span>Unsubscribed</span>
        </div>
        <div class="bar-chart" id="bar-chart"></div>
      </div>
      <div class="chart-wrap" id="inbox-wrap" style="display:none"><h3>Inbox size over time</h3><div class="inbox-line" id="inbox-chart"></div></div>
      <div class="card"><div class="card-header">Recently Blocked (${topBlocked.length})</div><div style="padding:4px 18px 12px" class="top-senders">${topRows}</div></div>
    </div>
  `, `
    var _d=JSON.parse(document.getElementById('stats-data').textContent);
    var last30=_d.last30,inboxSeries=_d.inboxSeries;
    var segs=[{key:'vip',color:'#f59e0b'},{key:'ok',color:'#14b8a6'},{key:'kept',color:'#22c55e'},{key:'cleaned',color:'#10b981'},{key:'junked',color:'#ef4444'},{key:'unsubbed',color:'#f97316'}];
    var maxVal=1;last30.forEach(function(e){var t=segs.reduce(function(a,s){return a+(e[s.key]||0);},0);if(t>maxVal)maxVal=t;});
    var chart=document.getElementById('bar-chart');
    last30.forEach(function(e){
      var total=segs.reduce(function(a,s){return a+(e[s.key]||0);},0);
      var col=document.createElement('div');col.className='bar-col';
      var tip=document.createElement('div');tip.className='bar-tip';
      tip.textContent=e.date+': '+total+' (vip='+(e.vip||0)+' ok='+(e.ok||0)+' kept='+(e.kept||0)+' cleaned='+(e.cleaned||0)+' junk='+(e.junked||0)+' unsub='+(e.unsubbed||0)+')';
      var stack=document.createElement('div');stack.className='bar-stack';stack.style.height=Math.max(2,Math.round(total/maxVal*100))+'px';
      segs.forEach(function(s){var v=e[s.key]||0;if(!v)return;var div=document.createElement('div');div.className='bar-seg';div.style.background=s.color;div.style.height=Math.max(1,Math.round(v/maxVal*100))+'px';stack.appendChild(div);});
      var lbl=document.createElement('div');lbl.className='bar-label';lbl.textContent=e.date.slice(5);
      col.appendChild(tip);col.appendChild(stack);col.appendChild(lbl);chart.appendChild(col);
    });
    if(inboxSeries.length>=2){
      document.getElementById('inbox-wrap').style.display='';
      var container=document.getElementById('inbox-chart');
      var W=container.offsetWidth||600,H=96,minS=Infinity,maxS=0;
      inboxSeries.forEach(function(e){if(e.size<minS)minS=e.size;if(e.size>maxS)maxS=e.size;});
      if(maxS===minS)maxS=minS+1;
      var pts=inboxSeries.map(function(e,i){return((i/(inboxSeries.length-1))*W).toFixed(1)+','+(H-((e.size-minS)/(maxS-minS))*H).toFixed(1);}).join(' ');
      container.innerHTML='<svg class="line-chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linejoin="round"/><text x="4" y="10" font-size="9" fill="#94a3b8">'+maxS.toLocaleString()+'</text><text x="4" y="'+H+'" font-size="9" fill="#94a3b8">'+minS.toLocaleString()+'</text></svg>';
    }
  `));
});

// ─── Blocklist Manager ─────────────────────────────────────────────────────────
app.get("/blocklist", (req, res) => {
  const list = loadBlocklist().sort((a,b) => a.email.localeCompare(b.email));
  const rows = list.length ? list.map(e => `
    <div class="bl-row">
      <div><div class="bl-email">${e.name?e.name+" &lt;"+e.email+"&gt;":e.email}</div><div class="bl-meta">Added ${new Date(e.date).toLocaleDateString()}</div></div>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="bl-reason bl-${e.reason}">${e.reason}</span>
        <form method="POST" action="/blocklist/remove">
          <input type="hidden" name="email" value="${e.email}"/>
          <input type="hidden" name="name" value="${e.name||""}"/>
          <button class="btn btn-danger" type="submit">✕ Remove</button>
        </form>
      </div>
    </div>`).join("") : `<div class="empty">No blocked senders yet.</div>`;

  res.send(shell("Blocklist", `
    <div class="topbar"><h1>🚫 Blocklist Manager</h1><div class="topbar-right"><a href="/" style="color:#94a3b8;text-decoration:none">← Home</a></div></div>
    <div style="max-width:800px;margin:0 auto;padding:20px 16px;overflow-y:auto;height:calc(100vh - 53px)">
      <div class="card">
        <div class="card-header">Blocked Senders (${list.length})</div>
        ${rows}
        <form class="add-form" method="POST" action="/blocklist/add">
          <input type="text" name="name" placeholder="Display name (optional)" style="max-width:200px"/>
          <input type="text" name="email" placeholder="email@domain.com or @domain.com" required/>
          <select name="reason"><option value="manual">manual</option><option value="junk">junk</option><option value="unsub">unsub</option></select>
          <button class="btn btn-primary" type="submit">+ Add</button>
        </form>
      </div>
      <div class="card">
        <div class="card-header">Bulk Import</div>
        <form method="POST" action="/blocklist/bulk" style="padding:14px 18px">
          <p style="font-size:.83rem;color:#64748b;margin-bottom:10px">One email or @domain.com per line.</p>
          <textarea name="emails" rows="8" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem;font-family:monospace" placeholder="spam@example.com&#10;@newsletters.com"></textarea>
          <div style="display:flex;gap:8px;margin-top:10px">
            <select name="reason" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff"><option value="manual">manual</option><option value="junk">junk</option><option value="unsub">unsub</option></select>
            <button class="btn btn-primary" type="submit">Import</button>
          </div>
        </form>
      </div>
    </div>
  `));
});
app.post("/blocklist/add", (req, res) => { const {email,name,reason}=req.body; if(email)addToBlocklist(email.trim().toLowerCase(),reason||"manual",name?.trim()||null); res.redirect("/blocklist"); });
app.post("/blocklist/bulk", (req, res) => { (req.body.emails||"").split("\n").map(l=>l.trim()).filter(Boolean).forEach(l=>addToBlocklist(l.toLowerCase(),req.body.reason||"manual")); res.redirect("/blocklist"); });
app.post("/blocklist/remove", (req, res) => { removeFromBlocklist(req.body.email, req.body.name); res.redirect("/blocklist"); });

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
      const result=await gmail.users.messages.list({userId:"me",q:"in:inbox -label:DelPend -label:Kept",maxResults:50,...(pageToken?{pageToken}:{})});
      const messages=result.data.messages||[];
      pageToken=result.data.nextPageToken||null;
      for(const msg of messages){
        if(seenIds.has(msg.id))continue;
        const d=await gmail.users.messages.get({userId:"me",id:msg.id,format:"metadata",metadataHeaders:["Subject","From","Date","List-Unsubscribe","List-Unsubscribe-Post"]});
        const h=d.data.payload.headers;
        const g=n=>h.find(x=>x.name===n)?.value||"";
        const fromRaw=g("From"),fromEmail=extractEmail(fromRaw),fromName=extractName(fromRaw);
        const senderKey=fromName+"<"+fromEmail+">";
        const { isBlocked } = await import("./lib/blocklist.js");
        if(isBlocked(fromEmail,fromName)){
          try{ await gmail.users.messages.batchModify({userId:"me",requestBody:{ids:[msg.id],addLabelIds:[labelId],removeLabelIds:["INBOX","UNREAD"]}}); autoCleanedEntries.push({email:fromEmail,reason:"blocklist",moved:1}); autoCleaned++; }catch(e){console.error("auto-clean failed:",e.message);}
          continue;
        }
        if(seenSenders.has(senderKey))continue;
        const lbls=d.data.labelIds||[];
        const tier=lbls.includes(vipId)?"..VIP":lbls.includes(okId)?"..OK":null;
        return res.json({html:emailCard({id:msg.id,subject:g("Subject"),from:fromRaw,date:g("Date"),snippet:d.data.snippet,listUnsubscribe:g("List-Unsubscribe"),listUnsubscribePost:g("List-Unsubscribe-Post"),tier}),autoCleaned,autoCleanedEntries,senderKey,msgId:msg.id});
      }
    } while(pageToken);
    return res.json({html:null,autoCleaned,autoCleanedEntries});
  } catch(e){ console.error("Next error:",e.message); res.json({html:null,autoCleaned:0,autoCleanedEntries:[]}); }
});

// ─── API: Tier ─────────────────────────────────────────────────────────────────
app.post("/api/tier", async (req, res) => {
  const {fromEmail,fromName,tier}=req.body;
  if(!["..VIP","..OK"].includes(tier))return res.status(400).json({ok:false,error:"Invalid tier"});
  try{
    const gmail=await getGmailClient();
    const labeled=await labelSender(gmail,tier,fromEmail,fromName||null,[]);
    addToStats({[tier==="..VIP"?"vip":"ok"]:labeled});
    res.json({ok:true,labeled,tier});
  }catch(e){res.status(500).json({ok:false,error:e.message,labeled:0});}
});

// ─── API: Keep ─────────────────────────────────────────────────────────────────
app.post("/api/keep", async (req, res) => {
  const {fromEmail,fromName}=req.body;
  try{
    const gmail=await getGmailClient();
    const kept=await labelSender(gmail,"Kept",fromEmail,fromName||null,["INBOX"]);
    addToStats({kept});
    res.json({ok:true,kept});
  }catch(e){res.status(500).json({ok:false,error:e.message,kept:0});}
});

// ─── API: Keep & Clean ─────────────────────────────────────────────────────────
app.post("/api/keep-clean", async (req, res) => {
  const {id,fromEmail,fromName}=req.body;
  try{
    const gmail=await getGmailClient();
    const keptId=await ensureLabel(gmail,"Kept");
    const delPendId=await ensureLabel(gmail,"DelPend");
    await gmail.users.messages.modify({userId:"me",id,requestBody:{addLabelIds:[keptId],removeLabelIds:["INBOX","UNREAD"]}});
    const ids=[];let pageToken=null;
    do{
      const params={userId:"me",q:"from:"+fromEmail+" -in:sent -in:trash",maxResults:500};
      if(pageToken)params.pageToken=pageToken;
      const result=await gmail.users.messages.list(params);
      for(const m of result.data.messages||[]){
        if(m.id===id)continue;
        if(fromName){const dh=await gmail.users.messages.get({userId:"me",id:m.id,format:"metadata",metadataHeaders:["From"]});const fh=dh.data.payload.headers.find(h=>h.name==="From")?.value||"";if(extractName(fh)!==fromName)continue;}
        ids.push(m.id);
      }
      pageToken=result.data.nextPageToken||null;
    }while(pageToken);
    addToStats({cleaned:ids.length});
    for(let i=0;i<ids.length;i+=1000){try{await gmail.users.messages.batchModify({userId:"me",requestBody:{ids:ids.slice(i,i+1000),addLabelIds:[delPendId],removeLabelIds:["INBOX","UNREAD"]}});}catch(e){console.error("keep-clean batchModify FAILED:",e.message);}}
    res.json({ok:true,cleaned:ids.length});
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
    res.send("<!DOCTYPE html><html><head><meta charset='UTF-8'/><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}.meta{border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px;color:#475569;font-size:.85rem}.meta strong{color:#1e293b}</style></head><body><div class='meta'><div><strong>From:</strong> "+g("From").replace(/</g,"&lt;")+"</div><div><strong>Subject:</strong> "+g("Subject").replace(/</g,"&lt;")+"</div><div><strong>Date:</strong> "+g("Date")+"</div></div>"+body+"</body></html>");
  }catch(e){res.send("<pre style='color:red'>Error: "+e.message+"</pre>");}
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
    for(const n of ["DelPend","Kept","..VIP","..OK"]){const l=labels.find(x=>x.name===n);out.push(l?"✅ "+n+": id="+l.id:"⚠️  "+n+" does not exist");}
    const bl=loadBlocklist();out.push("\n🚫 Blocklist ("+bl.length+"):");
    for(const e of bl)out.push("  "+(e.name?e.name+" <"+e.email+">":e.email)+"  ["+e.reason+"]");
  }catch(e){out.push("\n❌ "+e.message+"\n"+e.stack);}
  res.send("<pre style='font-family:monospace;padding:24px;line-height:1.6'>"+out.join("\n")+"</pre>");
});

app.get("/reset", (req, res) => { resetBlocklist(); resetStats(); res.redirect("/"); });

app.listen(PORT, () => console.log("Gmail triage server on http://localhost:" + PORT));