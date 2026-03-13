import { emailCard } from "./html.js";
import { extractEmail, extractName } from "./gmail.js";

const APP_VERSION = "v0.9.2";

// ─── Shared: OK/DelPend conflict card ─────────────────────────────────────────
function buildConflictSection(conflicts) {
  if (!conflicts || !conflicts.length) return "";
  const rows = conflicts.map(s => {
    const lbl = s.name ? `${s.name} &lt;${s.email}&gt;` : s.email;
    return `<div class="bl-row">
      <div>
        <div class="bl-email">${lbl}</div>
        <div class="bl-meta">${s.count} message${s.count !== 1 ? "s" : ""} have both OK and .DelPend labels</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <form method="POST" action="/api/conflict/remove-delpend">
          <input type="hidden" name="email" value="${s.email}"/>
          <button class="btn btn-primary" type="submit" title="Keep this sender — remove .DelPend label">✅ Keep (remove .DelPend)</button>
        </form>
        <form method="POST" action="/api/conflict/remove-ok">
          <input type="hidden" name="email" value="${s.email}"/>
          <button class="btn btn-danger" type="submit" title="Remove OK label — leave in .DelPend queue">🗑 Remove OK</button>
        </form>
      </div>
    </div>`;
  }).join("");
  return `<div class="card" style="border-left:4px solid #f59e0b;margin-bottom:20px">
    <div class="card-header" style="background:#fef3c7;color:#92400e">
      <span>⚠️ OK / .DelPend Conflicts (${conflicts.length} sender${conflicts.length !== 1 ? "s" : ""})</span>
    </div>${rows}</div>`;
}

// ─── Shared: DelPend queue card ────────────────────────────────────────────────
function buildDelPendSection(delPendSummary) {
  if (!delPendSummary || delPendSummary.total === 0) return "";
  const senderRows = delPendSummary.senders.length
    ? delPendSummary.senders.map(s => {
        const lbl = s.name ? `${s.name} &lt;${s.email}&gt;` : s.email;
        return `<div class="bl-row">
          <div><div class="bl-email">${lbl}</div>
          <div class="bl-meta">${s.count.toLocaleString()} message${s.count !== 1 ? "s" : ""} in .DelPend</div></div>
          <form method="POST" action="/api/delpend/trash-sender">
            <input type="hidden" name="email" value="${s.email}"/>
            <button class="btn btn-danger" type="submit">🗑 Trash</button>
          </form></div>`;
      }).join("")
    : `<div class="empty">No per-sender data.</div>`;
  return `<div class="card">
    <div class="card-header">
      <span>🗑 .DelPend Queue (${delPendSummary.total.toLocaleString()} messages)</span>
      <form method="POST" action="/api/delpend/trash-all" style="margin:0">
        <button class="btn btn-danger" type="submit">🗑 Trash All</button>
      </form>
    </div>${senderRows}</div>`;
}

// ─── Home page ─────────────────────────────────────────────────────────────────
export function homePage(blocklist, viplist = [], oklist = [], delPendSummary = null, keptDelPendConflicts = []) {
  const conflictSection = buildConflictSection(keptDelPendConflicts);
  const delPendSection  = buildDelPendSection(delPendSummary);
  return `
    <div class="topbar">
      <h1>📧 Gmail Triage <span style="font-weight:normal;opacity:0.45;font-size:0.7em">${APP_VERSION}</span></h1>
      <div class="topbar-right">
        <a href="/stats" class="btn-nav">📊 Stats</a>
        <a href="/review" class="btn-nav">🤖 Review</a>
        <a href="/viplist" class="btn-nav">⭐ VIP (${viplist.length})</a>
        <a href="/oklist" class="btn-nav">✅ OK (${oklist.length})</a>
        <a href="/blocklist" class="btn-nav">🚫 Blocklist (${blocklist.length})</a>
        <a href="/settings" class="btn-nav">⚙️ Settings</a>
      </div>
    </div>
    <div style="max-width:600px;margin:0 auto;padding:40px 16px;overflow-y:auto;height:calc(100vh - 53px)">
      <div style="text-align:center;margin-bottom:${delPendSection ? "32px" : "0"}">
        <div style="font-size:3rem;margin-bottom:16px">📬</div>
        <h2 style="font-size:1.2rem;margin-bottom:8px">Ready to triage your inbox?</h2>
        <p style="color:#64748b;font-size:.9rem;margin-bottom:28px">
          ⭐ VIP · ✅ OK · ✅ OK &amp; Clean · 🗑 Junk · 🚫 Unsubscribe
        </p>
        <a href="/triage" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem">▶ Start Triaging</a>
        <br>
        <a href="/reset" onclick="return confirm('Reset all stats and clear the blocklist?')" style="display:inline-block;margin-top:12px;padding:12px 28px;background:#ef4444;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem">🗑 Reset All</a>
      </div>
      ${conflictSection}
      ${delPendSection}
    </div>
  `;
}

// ─── Triage page ───────────────────────────────────────────────────────────────
export function triagePage(emails, blocklist, savedStats, scanResults) {
  const rows = emails.map(emailCard).join("");
  const dataScript = `<script type="application/json" id="page-data">${JSON.stringify({
    total: emails.length, blCount: blocklist.length, savedStats, scanResults,
    seenSenders: emails.map(e => extractName(e.from) + "<" + extractEmail(e.from) + ">"),
    seenIds: emails.map(e => e.id),
  })}</script>`;

  const body = `
    ${dataScript}
    <div class="topbar">
      <h1>📧 Triage <span style="opacity:.5;font-weight:400;font-size:.85rem">${emails.length} emails</span></h1>
      <div class="topbar-right">
        <span id="progress">0 / ${emails.length} actioned</span>
        <a href="/blocklist" class="btn-nav" id="bl-link">🚫 Blocklist (${blocklist.length})</a>
        <span class="counter" id="junk-count">0 junked</span>
        <a href="/settings" class="btn-nav">⚙️ Settings</a>
        <a href="/" class="btn-nav">← Home</a>
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
          <div class="stat-item"><span class="stat-num stat-clean" id="stat-clean">${savedStats.cleaned}</span><span class="stat-label">✅ OK &amp; Cleaned</span></div>
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
        <iframe class="preview-iframe" id="preview-iframe" sandbox="allow-scripts allow-popups"></iframe>
      </div>
    </div>
  `;

  return { body, script: clientScript() };
}

function clientScript() { return `
  var _d=JSON.parse(document.getElementById('page-data').textContent);
  var total=_d.total,blCount=_d.blCount,savedStats=_d.savedStats,scanResults=_d.scanResults;
  var seenSenders=new Set(_d.seenSenders),seenIds=new Set(_d.seenIds);
  var actioned=0,junked=savedStats.junked,unsubbed=savedStats.unsubbed;
  var cleaned=savedStats.cleaned;
  var vipCount=savedStats.vip||0,okCount=savedStats.ok||0;
  var autoCleaned=0,loading=false,pendingLoads=0,scanOpen=true,activePreviewId=null;
  var emailPanel=document.getElementById('email-panel');
  var previewPanel=document.getElementById('preview-panel');
  var previewIframe=document.getElementById('preview-iframe');

  function applyWidths(){emailPanel.style.width=previewPanel.classList.contains('open')?Math.floor(window.innerWidth*.52)+'px':'100%';}
  window.addEventListener('resize',applyWidths);applyWidths();
  window.addEventListener('pageshow',function(){
    var ds=JSON.parse(sessionStorage.getItem('deletedSenders')||'[]');
    if(!ds.length)return;
    var nextId=null;
    if(activePreviewId){
      var activeRow=document.getElementById('row-'+activePreviewId);
      if(activeRow&&ds.includes(activeRow.dataset.fromEmail)){
        var all=Array.from(document.querySelectorAll('.email-row'));
        var idx=all.indexOf(activeRow);
        for(var i=idx+1;i<all.length;i++){if(!ds.includes(all[i].dataset.fromEmail)&&!all[i].classList.contains('done')){nextId=all[i].id.replace('row-','');break;}}
        if(!nextId)for(var i=idx-1;i>=0;i--){if(!ds.includes(all[i].dataset.fromEmail)&&!all[i].classList.contains('done')){nextId=all[i].id.replace('row-','');break;}}
      }
    }
    ds.forEach(function(email){
      document.querySelectorAll('.email-row[data-from-email="'+email+'"]').forEach(function(r){r.remove();});
    });
    sessionStorage.removeItem('deletedSenders');
    if(activePreviewId&&!document.getElementById('row-'+activePreviewId)){
      if(nextId)openPreview(nextId);else closePreview();
    }
  });

  function toggleScan(){scanOpen=!scanOpen;document.getElementById('scan-body').style.display=scanOpen?'':'none';document.getElementById('scan-chevron').textContent=scanOpen?'▲':'▼';}
  function addScanRow(email,reason,moved){
    document.getElementById('scan-card').style.display='';
    autoCleaned+=moved;document.getElementById('scan-total').textContent=autoCleaned;
    var row=document.createElement('div');row.className='scan-row';
    row.innerHTML='<span>'+email+' <span style="color:#94a3b8;font-size:.75rem">('+reason+')</span></span><span class="scan-badge">'+moved+' labeled</span>';
    document.getElementById('scan-rows').appendChild(row);updateStats();
  }
  function updateStats(){
    document.getElementById('stat-total').textContent=actioned+autoCleaned;
    document.getElementById('stat-vip').textContent=vipCount;
    document.getElementById('stat-ok').textContent=okCount;
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
    document.querySelectorAll('.email-row.preview-active').forEach(function(r){r.classList.remove('preview-active');});
    activePreviewId=id;
    previewIframe.src='/api/preview/'+id;
    previewPanel.classList.add('open');applyWidths();
    document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
    var btn=document.querySelector('#row-'+id+' .btn-expand');
    if(btn)btn.textContent='▲ Close';
    var row=document.getElementById('row-'+id);
    if(row)row.classList.add('preview-active');
  }
  function closePreview(){
    previewPanel.classList.remove('open');applyWidths();
    previewIframe.src='';
    document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
    document.querySelectorAll('.email-row.preview-active').forEach(function(r){r.classList.remove('preview-active');});
    activePreviewId=null;
  }
  function setStatus(id,cls,text){
    var tag=document.getElementById('tag-'+id);
    tag.className='status-tag '+cls;tag.textContent=text;tag.style.display='inline-block';
    document.getElementById('actions-'+id).style.display='none';
  }
  async function loadNext(){
    if(loading){pendingLoads++;return;}loading=true;
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
    if(pendingLoads>0){pendingLoads--;loadNext();}
  }
  function removeDuplicates(fromEmail,exceptId){
    var dupes=Array.from(document.querySelectorAll('.email-row:not(.done)'))
      .filter(function(r){return r.dataset.fromEmail===fromEmail&&r.id!=='row-'+exceptId;});
    if(!dupes.length)return;
    dupes.forEach(function(row){
      seenIds.add(row.id.replace('row-',''));
      row.style.transition='opacity .4s,max-height .4s,margin .4s,padding .4s';
      row.style.opacity='0';row.style.maxHeight='0';row.style.marginBottom='0';row.style.overflow='hidden';
      setTimeout(function(){if(row.parentNode)row.remove();},400);
    });
    pendingLoads+=dupes.length;
    loadNext();
  }
  function markDone(id,rowCls){
    var row=document.getElementById('row-'+id);
    row.classList.add('done',rowCls);actioned++;updateStats();
    // Auto-advance preview
    if(activePreviewId===id){
      var all=Array.from(document.querySelectorAll('.email-row'));
      var idx=all.findIndex(function(r){return r.id==='row-'+id;});
      var nextRow=null;
      for(var i=idx+1;i<all.length;i++){if(!all[i].classList.contains('done')){nextRow=all[i];break;}}
      if(!nextRow)for(var i=idx-1;i>=0;i--){if(!all[i].classList.contains('done')){nextRow=all[i];break;}}
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
    if(actioned===total)showDone();
  }
  function scheduleDismiss(id){
    setTimeout(function(){
      var row=document.getElementById('row-'+id);
      if(!row)return;
      row.style.transition='opacity 1s,max-height 1s,margin 1s,padding 1s';
      row.style.opacity='0';row.style.maxHeight='0';row.style.marginBottom='0';row.style.overflow='hidden';
      setTimeout(function(){if(row.parentNode){row.remove();loadNext();}},1000);
    },5000);
  }
  function showDone(){
    document.getElementById('done-section').style.display='block';
    document.getElementById('done-summary').textContent=vipCount+' VIP · '+okCount+' OK · '+cleaned+' OK & cleaned · '+junked+' junked · '+unsubbed+' unsubscribed';
    window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  }
  async function doTier(id,fromEmail,fromName,tier){
    var isVip=tier==='..VIP';
    setStatus(id,isVip?'tag-vip':'tag-ok',(isVip?'⭐':'✅')+' Working...');
    document.getElementById('row-'+id).style.borderLeft=isVip?'4px solid #f59e0b':'4px solid #14b8a6';
    markDone(id,isVip?'r-vip':'r-ok');removeDuplicates(fromEmail,id);
    try{
      var r=await fetch('/api/tier',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName,tier})});
      var data=await r.json();
      if(isVip)vipCount+=(data.labeled||0);else okCount+=(data.labeled||0);
      updateStats();
      document.getElementById('tag-'+id).textContent=(isVip?'⭐':'✅')+' '+tier+' ('+(data.labeled||0)+' labeled)';
      scheduleDismiss(id);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doOkClean(id,fromEmail,fromName){
    setStatus(id,'tag-working','⏳ OK & cleaning...');markDone(id,'r-ok');removeDuplicates(fromEmail,id);
    try{
      var r=await fetch('/api/ok-clean',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName})});
      var data=await r.json();cleaned+=data.cleaned||0;updateStats();
      document.getElementById('tag-'+id).textContent='✅ OK · 🗑 '+(data.cleaned||0)+' older cleaned';
      document.getElementById('tag-'+id).className='status-tag tag-ok';
      scheduleDismiss(id);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doJunk(id,fromEmail,fromName){
    setStatus(id,'tag-working','⏳ Blocking...');markDone(id,'junked');removeDuplicates(fromEmail,id);
    try{
      var r=await fetch('/api/junk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName})});
      var data=await r.json();junked+=data.moved||1;updateStats();
      document.getElementById('tag-'+id).textContent='🗑 Junked ('+(data.moved||0)+' labeled)';
      document.getElementById('tag-'+id).className='status-tag tag-junk';
      updateBlCount(1);
      scheduleDismiss(id);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doUnsub(id,fromEmail,fromName){
    unsubbed++;
    var row=document.getElementById('row-'+id);
    setStatus(id,'tag-working','⏳ Unsubscribing...');markDone(id,'unsubbed');removeDuplicates(fromEmail,id);
    try{
      var r=await fetch('/api/unsub',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id,fromEmail,fromName,unsubUrl:row.dataset.unsubUrl,unsubPost:row.dataset.unsubPost})});
      var data=await r.json();
      if(data.openTab&&data.openTabUrl)window.open(data.openTabUrl,'_blank');
      junked+=data.moved||1;updateStats();
      document.getElementById('tag-'+id).textContent='🚫 '+(data.unsubLabel||data.unsubResult)+' · '+(data.moved||0)+' moved';
      document.getElementById('tag-'+id).className='status-tag tag-unsub';
      updateBlCount(1);
      scheduleDismiss(id);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doArchive(id){
    setStatus(id,'tag-working','⏳ Archiving...');markDone(id,'r-archived');
    try{
      await fetch('/api/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      document.getElementById('tag-'+id).textContent='📥 Archived';
      document.getElementById('tag-'+id).className='status-tag tag-archive';
      scheduleDismiss(id);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doDelete(id){
    setStatus(id,'tag-working','⏳ Deleting...');markDone(id,'junked');
    try{
      await fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      document.getElementById('tag-'+id).textContent='🗑 Deleted';
      document.getElementById('tag-'+id).className='status-tag tag-junk';
      scheduleDismiss(id);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doReview(id,fromEmail,fromName,subject){
    setStatus(id,'tag-review','🤖 Analyzing...');
    document.getElementById('tag-'+id).style.display='inline-flex';
    try{
      var r=await fetch('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName,subject})});
      var data=await r.json();
      if(!data.ok)throw new Error(data.error||'Analysis failed');
      var summary=data.analysis.summary||'';
      document.getElementById('tag-'+id).textContent='🤖 '+(summary.length>55?summary.slice(0,55)+'…':summary);
      document.getElementById('tag-'+id).className='status-tag tag-review';
      document.getElementById('tag-'+id).style.display='inline-flex';
      var link=document.createElement('a');
      link.href='/review';link.textContent='→ Review Queue';
      link.style.cssText='font-size:.75rem;color:#6366f1;margin-left:8px;font-weight:600;text-decoration:none';
      var actDiv=document.getElementById('actions-'+id);
      if(actDiv)actDiv.appendChild(link);
    }catch(e){
      document.getElementById('tag-'+id).textContent='⚠ '+e.message;
      document.getElementById('tag-'+id).className='status-tag tag-junk';
    }
  }
`;}

// ─── Stats page ────────────────────────────────────────────────────────────────
export function statsPage(stats, blocklist) {
  const daily  = stats.daily || [];
  const totals = { vip: stats.vip||0, ok: stats.ok||0, kept: stats.kept||0, cleaned: stats.cleaned||0, junked: stats.junked||0, unsubbed: stats.unsubbed||0 };

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
    {k:"cleaned",label:"✅ OK & Cleaned",color:"#065f46"},
    {k:"junked",label:"🗑 Junked",color:"#b91c1c"},{k:"unsubbed",label:"🚫 Unsubscribed",color:"#92400e"},
  ];
  const totalCards = totalMeta.map(m => `<div class="stats-big"><div class="stats-big-num" style="color:${m.color}">${(totals[m.k]||0).toLocaleString()}</div><div class="stats-big-label">${m.label}</div></div>`).join("");
  const topRows = topBlocked.length
    ? topBlocked.map(e => { const cls=e.reason==="junk"?"bl-junk":e.reason==="unsub"?"bl-unsub":"bl-manual"; const lbl=e.name?e.name+" &lt;"+e.email+"&gt;":e.email; return `<div class="ts-row"><span class="ts-email" title="${lbl}">${lbl}</span><span class="ts-badge ${cls}">${e.reason}</span><span style="font-size:.7rem;color:#94a3b8;margin-left:8px;white-space:nowrap">${new Date(e.date).toLocaleDateString()}</span></div>`; }).join("")
    : `<div class="empty">No blocked senders yet.</div>`;

  const body = `
    <script type="application/json" id="stats-data">${JSON.stringify({last30,topBlocked,inboxSeries})}</script>
    <div class="topbar"><h1>📊 Stats Dashboard</h1><div class="topbar-right"><a href="/" style="color:#94a3b8;text-decoration:none">← Home</a></div></div>
    <div style="max-width:900px;margin:0 auto;padding:20px 16px;overflow-y:auto;height:calc(100vh - 53px)">
      <div class="stats-grid">${totalCards}</div>
      <div class="chart-wrap">
        <h3>Activity — last 30 days</h3>
        <div class="legend">
          <span><span class="legend-dot" style="background:#f59e0b"></span>VIP</span>
          <span><span class="legend-dot" style="background:#14b8a6"></span>OK</span>
          <span><span class="legend-dot" style="background:#10b981"></span>OK &amp; Cleaned</span>
          <span><span class="legend-dot" style="background:#ef4444"></span>Junked</span>
          <span><span class="legend-dot" style="background:#f97316"></span>Unsubscribed</span>
        </div>
        <div class="bar-chart" id="bar-chart"></div>
      </div>
      <div class="chart-wrap" id="inbox-wrap" style="display:none"><h3>Inbox size over time</h3><div class="inbox-line" id="inbox-chart"></div></div>
      <div class="card"><div class="card-header">Recently Blocked (${topBlocked.length})</div><div style="padding:4px 18px 12px" class="top-senders">${topRows}</div></div>
    </div>
  `;

  const script = `
    var _d=JSON.parse(document.getElementById('stats-data').textContent);
    var last30=_d.last30,inboxSeries=_d.inboxSeries;
    var segs=[{key:'vip',color:'#f59e0b'},{key:'ok',color:'#14b8a6'},{key:'cleaned',color:'#10b981'},{key:'junked',color:'#ef4444'},{key:'unsubbed',color:'#f97316'}];
    var maxVal=1;last30.forEach(function(e){var t=segs.reduce(function(a,s){return a+(e[s.key]||0);},0);if(t>maxVal)maxVal=t;});
    var chart=document.getElementById('bar-chart');
    last30.forEach(function(e){
      var total=segs.reduce(function(a,s){return a+(e[s.key]||0);},0);
      var col=document.createElement('div');col.className='bar-col';
      var tip=document.createElement('div');tip.className='bar-tip';
      tip.textContent=e.date+': '+total+' (vip='+(e.vip||0)+' ok='+(e.ok||0)+' cleaned='+(e.cleaned||0)+' junk='+(e.junked||0)+' unsub='+(e.unsubbed||0)+')';
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
  `;

  return { body, script };
}

// ─── Sender detail page ────────────────────────────────────────────────────────
function senderEmailCard(e) {
  const dateStr = e.date ? new Date(e.date).toLocaleDateString() : "";
  const subj = (e.subject || "(no subject)").replace(/</g, "&lt;");
  return `
    <div class="email-row" id="row-${e.id}">
      <div class="email-header" style="align-items:center">
        <input type="checkbox" class="sel-check" data-id="${e.id}" style="margin-right:10px;cursor:pointer;width:16px;height:16px;flex-shrink:0"/>
        <div class="email-meta">
          <div class="email-subject" style="${e.isRead ? "color:#64748b" : "font-weight:700;color:#1e293b"}">${subj}</div>
        </div>
        <div class="email-date">${dateStr}</div>
        <span class="status-tag" id="tag-${e.id}" style="display:none"></span>
      </div>
      <div class="email-actions" id="actions-${e.id}">
        <button class="btn btn-danger" onclick="doDelete('${e.id}')">🗑 Delete</button>
        <button class="btn btn-expand" onclick="openPreview('${e.id}')">▼ Preview</button>
      </div>
    </div>`;
}

export function senderPage(emails, fromEmail, fromName) {
  const displayName = fromName || fromEmail;
  const rows = emails.length
    ? emails.map(senderEmailCard).join("")
    : `<div class="empty">No emails found from this sender.</div>`;

  const body = `
    <div class="topbar">
      <h1>👤 ${displayName.replace(/</g,"&lt;")}</h1>
      <div class="topbar-right">
        <span style="color:#94a3b8;font-size:.8rem">&lt;${fromEmail}&gt;</span>
        <a href="javascript:history.back()" class="btn-nav">← Back</a>
      </div>
    </div>
    <div class="layout">
      <div class="email-panel" id="email-panel">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:4px 0">
          <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer;color:#475569">
            <input type="checkbox" id="select-all" style="width:16px;height:16px;cursor:pointer"/> Select all
          </label>
          <button class="btn btn-danger" id="trash-sel-btn" onclick="doDeleteSelected()" style="display:none">🗑 Trash Selected</button>
          <span style="font-size:.8rem;color:#94a3b8;margin-left:auto">${emails.length} email${emails.length !== 1 ? "s" : ""}</span>
        </div>
        <div id="email-list">${rows}</div>
      </div>
      <div class="preview-panel" id="preview-panel">
        <div class="preview-header">
          <span>Preview</span>
          <button class="preview-close" onclick="closePreview()">✕</button>
        </div>
        <iframe class="preview-iframe" id="preview-iframe" sandbox="allow-scripts allow-popups"></iframe>
      </div>
    </div>
  `;

  const safeEmail = fromEmail.replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  const script = `
    var pageFromEmail='${safeEmail}';
    var emailPanel=document.getElementById('email-panel');
    var previewPanel=document.getElementById('preview-panel');
    var previewIframe=document.getElementById('preview-iframe');
    var activePreviewId=null;
    function markSenderDeleted(){
      var ds=JSON.parse(sessionStorage.getItem('deletedSenders')||'[]');
      if(!ds.includes(pageFromEmail))ds.push(pageFromEmail);
      sessionStorage.setItem('deletedSenders',JSON.stringify(ds));
    }
    function applyWidths(){emailPanel.style.width=previewPanel.classList.contains('open')?Math.floor(window.innerWidth*.52)+'px':'100%';}
    window.addEventListener('resize',applyWidths);applyWidths();
    function openPreview(id){
      if(activePreviewId===id&&previewPanel.classList.contains('open')){closePreview();return;}
      activePreviewId=id;previewIframe.src='/api/preview/'+id;
      previewPanel.classList.add('open');applyWidths();
      document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
      var btn=document.querySelector('#row-'+id+' .btn-expand');if(btn)btn.textContent='▲ Close';
    }
    function closePreview(){
      previewPanel.classList.remove('open');applyWidths();previewIframe.src='';
      document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
      activePreviewId=null;
    }
    function setStatus(id,cls,text){
      var tag=document.getElementById('tag-'+id);
      tag.className='status-tag '+cls;tag.textContent=text;tag.style.display='inline-block';
      document.getElementById('actions-'+id).style.display='none';
    }
    function fadeRow(id){
      var r=document.getElementById('row-'+id);
      if(r){r.classList.add('faded');r.style.opacity='0.35';r.style.pointerEvents='none';}
    }
    function dismissRow(id){
      setTimeout(function(){
        var r=document.getElementById('row-'+id);
        if(!r)return;
        r.style.transition='opacity 1s,max-height 1s,margin 1s,padding 1s';
        r.style.opacity='0';r.style.maxHeight='0';r.style.marginBottom='0';r.style.overflow='hidden';
        setTimeout(function(){if(r.parentNode)r.remove();},1000);
      },5000);
    }
    function advancePreviewFrom(id){
      if(activePreviewId!==id)return;
      var all=Array.from(document.querySelectorAll('.email-row'));
      var idx=all.findIndex(function(r){return r.id==='row-'+id;});
      var next=null;
      for(var i=idx+1;i<all.length;i++){if(!all[i].classList.contains('faded')){next=all[i];break;}}
      if(!next)for(var i=idx-1;i>=0;i--){if(!all[i].classList.contains('faded')){next=all[i];break;}}
      if(next)openPreview(next.id.replace('row-',''));else closePreview();
    }
    async function doDelete(id){
      setStatus(id,'tag-working','⏳ Deleting...');
      try{
        await fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
        document.getElementById('tag-'+id).textContent='🗑 Deleted';
        document.getElementById('tag-'+id).className='status-tag tag-junk';
        advancePreviewFrom(id);
        markSenderDeleted();
        fadeRow(id);dismissRow(id);
      }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
    }
    document.getElementById('select-all').addEventListener('change',function(){
      var checked=this.checked;
      document.querySelectorAll('.sel-check').forEach(function(c){c.checked=checked;});
      updateTrashBtn();
    });
    document.addEventListener('change',function(e){if(e.target.classList.contains('sel-check'))updateTrashBtn();});
    function updateTrashBtn(){
      var n=document.querySelectorAll('.sel-check:checked').length;
      var btn=document.getElementById('trash-sel-btn');
      btn.style.display=n?'':'none';
      btn.textContent='🗑 Trash Selected ('+n+')';
    }
    async function doDeleteSelected(){
      var ids=Array.from(document.querySelectorAll('.sel-check:checked')).map(function(c){return c.dataset.id;});
      if(!ids.length)return;
      if(!confirm('Trash '+ids.length+' selected email'+(ids.length!==1?'s':'')+'?'))return;
      try{
        await fetch('/api/delete-many',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
        markSenderDeleted();
        var previewDeleted=ids.indexOf(activePreviewId)!==-1;
        ids.forEach(function(id){
          setStatus(id,'tag-junk','🗑 Deleted');fadeRow(id);dismissRow(id);
          var c=document.querySelector('.sel-check[data-id="'+id+'"]');if(c)c.checked=false;
        });
        if(previewDeleted){
          var remaining=Array.from(document.querySelectorAll('.email-row:not(.faded)'));
          if(remaining.length)openPreview(remaining[0].id.replace('row-',''));else closePreview();
        }
        document.getElementById('select-all').checked=false;
        updateTrashBtn();
      }catch(e){alert('Error: '+e.message);}
    }
  `;

  return { body, script };
}

// ─── Blocklist page ────────────────────────────────────────────────────────────
export function blocklistPage(list) {
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

  return `
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
  `;
}

// ─── VIP List page ─────────────────────────────────────────────────────────────
export function viplistPage(list) {
  const rows = list.length ? list.map(e => `
    <div class="bl-row">
      <div><div class="bl-email">${e.name?e.name+" &lt;"+e.email+"&gt;":e.email}</div><div class="bl-meta">Added ${new Date(e.date).toLocaleDateString()}</div></div>
      <div style="display:flex;align-items:center;gap:10px">
        <form method="POST" action="/viplist/remove">
          <input type="hidden" name="email" value="${e.email}"/>
          <input type="hidden" name="name" value="${e.name||""}"/>
          <button class="btn btn-danger" type="submit">✕ Remove</button>
        </form>
      </div>
    </div>`).join("") : `<div class="empty">No VIP senders yet.</div>`;

  return `
    <div class="topbar"><h1>⭐ VIP Senders</h1><div class="topbar-right"><a href="/" style="color:#94a3b8;text-decoration:none">← Home</a></div></div>
    <div style="max-width:800px;margin:0 auto;padding:20px 16px;overflow-y:auto;height:calc(100vh - 53px)">
      <div class="card">
        <div class="card-header">VIP Senders (${list.length})</div>
        ${rows}
        <form class="add-form" method="POST" action="/viplist/add">
          <input type="text" name="name" placeholder="Display name (optional)" style="max-width:200px"/>
          <input type="text" name="email" placeholder="email@domain.com" required/>
          <button class="btn btn-primary" type="submit">+ Add</button>
        </form>
      </div>
      <div class="card">
        <div class="card-header">Bulk Import</div>
        <form method="POST" action="/viplist/bulk" style="padding:14px 18px">
          <p style="font-size:.83rem;color:#64748b;margin-bottom:10px">One email per line.</p>
          <textarea name="emails" rows="8" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem;font-family:monospace" placeholder="boss@company.com&#10;client@example.com"></textarea>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary" type="submit">Import</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// ─── Review page ───────────────────────────────────────────────────────────────
export function reviewPage(items) {
  const pending   = items.filter(i => i.status === "pending");
  const executed  = items.filter(i => i.status !== "pending");

  const actionBadge = a =>
    a === "keep"    ? `<span class="bl-reason" style="background:#dcfce7;color:#15803d">📁 Keep</span>` :
    a === "archive" ? `<span class="bl-reason" style="background:#dbeafe;color:#1e40af">📥 Archive</span>` :
    a === "junk"    ? `<span class="bl-reason" style="background:#fee2e2;color:#b91c1c">🗑 Junk</span>` :
                      `<span class="bl-reason" style="background:#f1f5f9;color:#64748b">— None</span>`;

  const calendarForm = (item) => {
    // Support both new (events array) and old (event singular) data formats
    const events = Array.isArray(item.analysis.events)
      ? item.analysis.events
      : (item.analysis.isLocalEvent && item.analysis.event ? [item.analysis.event] : []);
    if (!events.length) return "";
    const calendarLinks = item.calendarLinks || {};
    const pendingCount = events.filter((_, i) => !calendarLinks[String(i)]).length;
    const createAllBtn = pendingCount > 1
      ? `<button type="button" class="btn btn-primary" id="cal-all-btn-${item.id}" onclick="doCreateAllCalEvents('${item.id}',${events.length})" style="width:100%;margin-bottom:4px">📅 Create All ${pendingCount} Events</button>`
      : "";
    return createAllBtn + events.map((ev, idx) => {
      const link = calendarLinks[String(idx)];
      const formOrLink = link
        ? `<div style="margin-top:10px;padding:10px;background:#dcfce7;border-radius:8px;font-size:.85rem">✅ Event created: <a href="${link}" target="_blank" style="color:#15803d">Open in Calendar</a></div>`
        : `<form id="cal-form-${item.id}-${idx}" onsubmit="doCreateCalEvent(event,'${item.id}',${idx});return false;" style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
            <input name="title"       value="${(ev.title||"").replace(/"/g,"&quot;")}"       placeholder="Title"       style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem"/>
            <input name="date"        value="${ev.date||""}"         type="date"               style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem"/>
            <input name="time"        value="${ev.time||""}"         type="time"               style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem"/>
            <input name="location"    value="${(ev.location||"").replace(/"/g,"&quot;")}"    placeholder="Location"    style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem"/>
            <input name="url"         value="${(ev.url||"").replace(/"/g,"&quot;")}"         placeholder="Event URL"   style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem"/>
            <textarea name="description" rows="3" placeholder="Description" style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem">${ev.description||""}</textarea>
            <button type="submit" class="btn btn-primary" id="cal-btn-${item.id}-${idx}">📅 Create Calendar Event</button>
          </form>`;
      const label = events.length > 1
        ? `📅 Event ${idx+1} of ${events.length}: ${ev.title||""}`
        : "📅 Local Event Detected";
      return `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-top:12px">
        <div style="font-weight:700;font-size:.85rem;color:#15803d;margin-bottom:4px">${label}</div>
        ${formOrLink}
      </div>`;
    }).join("");
  };

  const draftReplyBox = (item) => {
    if (!item.analysis.draftReply) return "";
    return `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin-top:12px">
      <div style="font-weight:700;font-size:.85rem;color:#0369a1;margin-bottom:6px">✉️ Suggested Reply</div>
      <textarea rows="6" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem;font-family:sans-serif" readonly>${item.analysis.draftReply.replace(/</g,"&lt;")}</textarea>
    </div>`;
  };

  const itemRow = (item, isPending) => {
    const a = item.analysis || {};
    const from = item.from || "";
    const dateStr = item.date ? (() => {
      const d = new Date(item.date);
      return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + " " + d.toLocaleDateString();
    })() : "";
    return `<div class="review-item ${isPending?"":"review-done"}" id="ritem-${item.id}" onclick="selectReview('${item.id}')" style="cursor:pointer">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:.88rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${from.replace(/</g,"&lt;")}</div>
          <div style="font-size:.82rem;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${(item.subject||"").replace(/</g,"&lt;")}</div>
          <div style="font-size:.72rem;color:#94a3b8;margin-top:2px">${dateStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          ${actionBadge(a.action)}
          ${(() => { const ec = Array.isArray(item.analysis.events) ? item.analysis.events.length : (item.analysis.isLocalEvent ? 1 : 0); return ec > 0 ? `<span style="font-size:.7rem;background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:999px">📅 ${ec > 1 ? ec+" Events" : "Event"}</span>` : ""; })()}
          ${isPending ? "" : `<span style="font-size:.7rem;color:#94a3b8">✓ done</span>`}
        </div>
      </div>
      <div style="font-size:.8rem;color:#64748b;margin-top:6px;line-height:1.4">${(a.summary||"").replace(/</g,"&lt;")}</div>
    </div>`;
  };

  const detailPanel = (item) => {
    const a = item.analysis || {};
    const isPending = item.status === "pending";
    const suggestedAction = a.action || "none";
    const btnStyle = (action) => action === suggestedAction
      ? `style="border:2px solid #6366f1"` : "";
    return `<div id="rdetail-${item.id}" class="review-detail" style="display:none;padding:16px;overflow-y:auto;height:100%">
      <div style="font-size:.82rem;color:#64748b;margin-bottom:10px">${(item.from||"").replace(/</g,"&lt;")} · ${item.date?new Date(item.date).toLocaleDateString():""}</div>
      <div style="font-weight:700;margin-bottom:6px">${(item.subject||"").replace(/</g,"&lt;")}</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:.85rem;color:#475569;line-height:1.5;margin-bottom:12px">${(a.summary||"").replace(/</g,"&lt;")}</div>
      <div style="font-size:.78rem;color:#94a3b8;margin-bottom:12px"><em>${(a.actionReason||"").replace(/</g,"&lt;")}</em></div>
      ${isPending ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-keep"    ${btnStyle("keep")}    onclick="executeAction('${item.id}','keep',event)">📁 Keep</button>
        <button class="btn btn-archive" ${btnStyle("archive")} onclick="executeAction('${item.id}','archive',event)">📥 Archive</button>
        <button class="btn btn-junk"    ${btnStyle("junk")}    onclick="executeAction('${item.id}','junk',event)">🗑 Junk</button>
        <button class="btn" style="background:#f1f5f9;color:#64748b" onclick="dismiss('${item.id}',event)">✕ Dismiss</button>
      </div>` : `<div style="font-size:.82rem;color:#15803d;margin-bottom:12px">✅ Action executed</div>`}
      <iframe src="/api/preview/${item.id}" style="width:100%;height:300px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:0"></iframe>
      ${calendarForm(item)}
      ${draftReplyBox(item)}
    </div>`;
  };

  const allItems = [...pending, ...executed];
  const listRows   = allItems.map(i => itemRow(i,  i.status === "pending")).join("");
  const detailDivs = allItems.map(i => detailPanel(i)).join("");

  const body = `
    <div class="topbar">
      <h1>🤖 Claude Review Queue <span style="opacity:.5;font-weight:400;font-size:.85rem">${pending.length} pending</span></h1>
      <div class="topbar-right"><a href="/" class="btn-nav">← Home</a></div>
    </div>
    <div class="layout">
      <div class="email-panel" style="width:380px;flex:none">
        ${allItems.length === 0
          ? `<div class="empty" style="margin-top:60px">No emails in the review queue yet.<br><br><a href="/triage" style="color:#6366f1">Start Triaging →</a></div>`
          : listRows}
      </div>
      <div class="preview-panel open" style="display:flex;flex-direction:column">
        <div id="rdetail-placeholder" style="display:flex;align-items:center;justify-content:center;flex:1;color:#94a3b8;font-size:.9rem">
          Select an email to see Claude's analysis
        </div>
        ${detailDivs}
      </div>
    </div>
  `;

  const script = `
    var activeId = null;
    function selectReview(id) {
      if(activeId) {
        document.getElementById('rdetail-'+activeId).style.display='none';
        var prev = document.getElementById('ritem-'+activeId);
        if(prev) prev.style.background='';
      }
      document.getElementById('rdetail-placeholder').style.display='none';
      document.getElementById('rdetail-'+id).style.display='block';
      var row = document.getElementById('ritem-'+id);
      if(row) row.style.background='#f0f9ff';
      activeId = id;
    }
    async function executeAction(id, action, e) {
      if(e) e.stopPropagation();
      var btn = e && e.target;
      if(btn) btn.textContent = '⏳ Working...';
      try {
        var r = await fetch('/api/review/execute', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, action})});
        var data = await r.json();
        if(!data.ok) throw new Error(data.error);
        location.reload();
      } catch(err) { if(btn) btn.textContent = '⚠ '+err.message; }
    }
    async function dismiss(id, e) {
      if(e) e.stopPropagation();
      try {
        await fetch('/api/review/dismiss', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})});
        location.reload();
      } catch(err) { alert('Error: '+err.message); }
    }
    async function doCreateCalEvent(e, id, idx) {
      e.preventDefault();
      var form = e.target;
      var btn = document.getElementById('cal-btn-'+id+'-'+idx);
      if(btn) btn.textContent = '⏳ Creating...';
      var calEvent = {
        title:       form.title.value,
        date:        form.date.value,
        time:        form.time.value,
        location:    form.location.value,
        description: form.description.value,
        url:         form.url.value,
      };
      try {
        var r = await fetch('/api/review/calendar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, eventIndex: idx, event: calEvent})});
        var data = await r.json();
        if(!data.ok) throw new Error(data.error);
        location.reload();
      } catch(err) { if(btn) btn.textContent = '⚠ '+err.message; else alert('Error: '+err.message); }
    }
    async function doCreateAllCalEvents(id, count) {
      var btn = document.getElementById('cal-all-btn-'+id);
      if(btn) btn.disabled = true;
      var errors = [];
      for(var i = 0; i < count; i++) {
        var form = document.getElementById('cal-form-'+id+'-'+i);
        if(!form) continue; // already created
        if(btn) btn.textContent = '⏳ Creating event '+(i+1)+' of '+count+'...';
        var calEvent = {
          title: form.title.value, date: form.date.value, time: form.time.value,
          location: form.location.value, description: form.description.value, url: form.url.value,
        };
        try {
          var r = await fetch('/api/review/calendar', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, eventIndex: i, event: calEvent})});
          var data = await r.json();
          if(!data.ok) throw new Error(data.error);
        } catch(err) { errors.push('Event '+(i+1)+': '+err.message); }
      }
      if(errors.length) {
        if(btn) { btn.disabled=false; btn.textContent='⚠ '+errors.length+' failed — retry?'; }
        alert('Some events failed:\n'+errors.join('\n'));
      } else { location.reload(); }
    }
    // Auto-select first pending item
    var firstPending = document.querySelector('.review-item:not(.review-done)');
    if(firstPending) selectReview(firstPending.id.replace('ritem-',''));
  `;

  return { body, script };
}

// ─── OK List page ──────────────────────────────────────────────────────────────
export function oklistPage(list) {
  const rows = list.length ? list.map(e => `
    <div class="bl-row">
      <div><div class="bl-email">${e.name?e.name+" &lt;"+e.email+"&gt;":e.email}</div><div class="bl-meta">Added ${new Date(e.date).toLocaleDateString()}</div></div>
      <div style="display:flex;align-items:center;gap:10px">
        <form method="POST" action="/oklist/remove">
          <input type="hidden" name="email" value="${e.email}"/>
          <input type="hidden" name="name" value="${e.name||""}"/>
          <button class="btn btn-danger" type="submit">✕ Remove</button>
        </form>
      </div>
    </div>`).join("") : `<div class="empty">No OK senders yet.</div>`;

  return `
    <div class="topbar"><h1>✅ OK Senders</h1><div class="topbar-right"><a href="/" style="color:#94a3b8;text-decoration:none">← Home</a></div></div>
    <div style="max-width:800px;margin:0 auto;padding:20px 16px;overflow-y:auto;height:calc(100vh - 53px)">
      <div class="card">
        <div class="card-header">OK Senders (${list.length})</div>
        ${rows}
        <form class="add-form" method="POST" action="/oklist/add">
          <input type="text" name="name" placeholder="Display name (optional)" style="max-width:200px"/>
          <input type="text" name="email" placeholder="email@domain.com" required/>
          <button class="btn btn-primary" type="submit">+ Add</button>
        </form>
      </div>
      <div class="card">
        <div class="card-header">Bulk Import</div>
        <form method="POST" action="/oklist/bulk" style="padding:14px 18px">
          <p style="font-size:.83rem;color:#64748b;margin-bottom:10px">One email per line.</p>
          <textarea name="emails" rows="8" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem;font-family:monospace" placeholder="newsletter@service.com&#10;updates@app.com"></textarea>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary" type="submit">Import</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

const TIMEZONES = [
  ["America/Los_Angeles", "Pacific (LA)"],
  ["America/Denver",      "Mountain (Denver)"],
  ["America/Phoenix",     "Mountain no-DST (Phoenix)"],
  ["America/Chicago",     "Central (Chicago)"],
  ["America/New_York",    "Eastern (New York)"],
  ["America/Anchorage",   "Alaska"],
  ["Pacific/Honolulu",    "Hawaii"],
  ["Europe/London",       "London"],
  ["Europe/Paris",        "Paris / Berlin"],
  ["Asia/Tokyo",          "Tokyo"],
  ["Asia/Shanghai",       "Shanghai / Beijing"],
  ["Australia/Sydney",    "Sydney"],
];

export function settingsPage(settings) {
  const locations = settings.locations || [];
  const timezone  = settings.timezone  || "America/Los_Angeles";
  const locationRows = locations.length
    ? locations.map(loc => `
      <div class="bl-row">
        <div>
          <div class="bl-email">${loc.replace(/</g,"&lt;")}</div>
        </div>
        <form method="POST" action="/settings/locations/remove" style="margin:0">
          <input type="hidden" name="location" value="${loc.replace(/"/g,'&quot;')}">
          <button class="btn btn-danger" type="submit">Remove</button>
        </form>
      </div>`).join("")
    : `<div class="empty">No locations set — Claude will surface events from any location.</div>`;

  const body = `
    <div class="topbar">
      <h1>⚙️ Settings</h1>
      <div class="topbar-right"><a href="/" class="btn-nav">← Home</a></div>
    </div>
    <div style="max-width:800px;margin:0 auto;padding:20px 16px;overflow-y:auto;height:calc(100vh - 53px)">
      <div class="card">
        <div class="card-header">
          Locations of Interest
          <span style="font-size:.75rem;font-weight:400;color:#94a3b8">Used by Claude AI to filter real-world events in email analysis</span>
        </div>
        ${locationRows}
        <div style="padding:12px 18px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:.82rem;color:#64748b">
          ${locations.length ? `Claude will flag events in: <strong>${locations.join(", ")}</strong>` : `<strong>All mode</strong> — Claude will flag any real-world events regardless of location`}
        </div>
        <div class="add-form">
          <input type="text" id="loc-input" placeholder="e.g. Austin, TX" style="flex:1;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem">
          <button class="btn btn-primary" id="geo-btn" type="button">📍 Use My Location</button>
          <button class="btn btn-primary" id="add-btn" type="button">Add</button>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          Timezone
          <span style="font-size:.75rem;font-weight:400;color:#94a3b8">Used when creating Google Calendar events</span>
        </div>
        <form method="POST" action="/settings/timezone" style="padding:14px 18px;display:flex;gap:10px;align-items:center">
          <select name="timezone" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff;flex:1">
            ${TIMEZONES.map(([val, lbl]) => `<option value="${val}"${val === timezone ? " selected" : ""}>${lbl} — ${val}</option>`).join("")}
          </select>
          <button class="btn btn-primary" type="submit">Save</button>
        </form>
      </div>
    </div>`;

  const script = `
    var input = document.getElementById('loc-input');
    document.getElementById('add-btn').onclick = function() {
      var val = input.value.trim();
      if (!val) return;
      var f = document.createElement('form');
      f.method = 'POST'; f.action = '/settings/locations/add';
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = 'location'; i.value = val;
      f.appendChild(i); document.body.appendChild(f); f.submit();
    };
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('add-btn').click(); });
    document.getElementById('geo-btn').onclick = function() {
      var btn = this;
      if (!navigator.geolocation) { alert('Geolocation is not supported by this browser.'); return; }
      btn.textContent = '📍 Detecting...'; btn.disabled = true;
      navigator.geolocation.getCurrentPosition(function(pos) {
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon, {
          headers: { 'Accept-Language': 'en' }
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          var addr = d.address || {};
          var city = addr.city || addr.town || addr.village || addr.county || '';
          var state = addr.state || '';
          var loc = city && state ? city + ', ' + state : city || state || '';
          input.value = loc;
          input.focus();
          btn.textContent = '📍 Use My Location'; btn.disabled = false;
        })
        .catch(function() {
          input.value = lat.toFixed(4) + ', ' + lon.toFixed(4);
          btn.textContent = '📍 Use My Location'; btn.disabled = false;
        });
      }, function() {
        alert('Unable to retrieve your location. Please check browser permissions.');
        btn.textContent = '📍 Use My Location'; btn.disabled = false;
      });
    };`;

  return { body, script };
}
