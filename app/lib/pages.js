import { triageEmailRow } from "./html.js";
import { extractEmail, extractName } from "./gmail.js";
import { loadStats } from "./stats.js";
import { loadBlocklist } from "./blocklist.js";
import { loadViplist, loadOklist } from "./viplist.js";
import { loadRules } from "./rules.js";

const APP_VERSION = "v1.0.08";

// ─── Shared: List-overlap conflict card ────────────────────────────────────────
function buildConflictSection(conflicts) {
  if (!conflicts || !conflicts.length) return "";
  const listLabel = { VIP: "VIP", OK: "OK", Block: "Block" };
  const listBtnClass = { VIP: "btn-warning", OK: "btn-primary", Block: "btn-danger" };
  const rows = conflicts.map(s => {
    const lbl = s.name ? `${s.name} &lt;${s.email}&gt;` : s.email;
    const buttons = s.lists.map(list => `
        <form method="POST" action="/api/conflict/remove-from-list">
          <input type="hidden" name="email" value="${s.email}"/>
          <input type="hidden" name="list" value="${list}"/>
          <button class="btn ${listBtnClass[list]}" type="submit">Remove from ${listLabel[list]}</button>
        </form>`).join("");
    return `<div class="bl-row">
      <div>
        <div class="bl-email">${lbl}</div>
        <div class="bl-meta">In lists: ${s.lists.join(", ")}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${buttons}</div>
    </div>`;
  }).join("");
  return `<div class="card" style="border-left:4px solid #f59e0b;margin-bottom:20px">
    <div class="card-header" style="background:#fef3c7;color:#92400e">
      <span>⚠️ List Conflicts (${conflicts.length} sender${conflicts.length !== 1 ? "s" : ""})</span>
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
          <div class="bl-meta">${s.count.toLocaleString()} message${s.count !== 1 ? "s" : ""} in DelPend</div></div>
          <form method="POST" action="/api/delpend/trash-sender">
            <input type="hidden" name="email" value="${s.email}"/>
            <button class="btn btn-danger" type="submit">🗑 Trash</button>
          </form></div>`;
      }).join("")
    : `<div class="empty">No per-sender data.</div>`;
  return `<div class="card">
    <div class="card-header">
      <span>🗑 DelPend Queue (${delPendSummary.total.toLocaleString()} messages)</span>
      <form method="POST" action="/api/delpend/trash-all" style="margin:0">
        <button class="btn btn-danger" type="submit">🗑 Trash All</button>
      </form>
    </div>${senderRows}</div>`;
}

// ─── Shared: sidebar navigation ─────────────────────────────────────────────
function sidebar({ active = '' } = {}) {
  const blCount = loadBlocklist().length;
  const vipCount = loadViplist().length;
  const okCount = loadOklist().length;
  const total = blCount + vipCount + okCount;
  const item = (href, icon, label, badge, isActive) => {
    const badgeHtml = badge !== null && badge !== undefined && badge !== ''
      ? `<span class="sb-badge"${isActive ? ' style="background:#c7d2fe;color:#4f46e5"' : ''}>${badge}</span>` : '';
    return `<a href="${href}" class="sb-item${isActive ? ' sb-active' : ''}">${icon} ${label}${badgeHtml}</a>`;
  };
  return `<div class="sidebar">
    <a href="/" class="sb-logo" style="text-decoration:none;color:inherit;display:block">
      <div style="font-size:.9rem;font-weight:700;color:#1e293b">📧 Gmail Triage</div>
      <div style="font-size:.68rem;color:#94a3b8;margin-top:1px">${APP_VERSION}</div>
    </a>
    <div class="sb-nav">
      ${item('/','🏠','Home','',active==='home')}
      ${item('/triage','▶','Start Triage','',active==='triage')}
      ${item('/stats','📊','Stats',null,active==='stats')}
      ${item('/review','🤖','Review',null,active==='review')}
      <div class="sb-section">Label Lists</div>
      ${item('/lists','🏷','All Lists',total||'',active==='lists')}
      ${item('/rules','⚡','Rules',loadRules().length||'',active==='rules')}
      ${item('/labeled?label=..VIP','⭐','VIP Emails',null,active==='labeled-..VIP')}
      ${item('/labeled?label=..OK','✅','OK Emails',null,active==='labeled-..OK')}
      ${item('/labeled?label=.DelPend','🗑','Del. Pending',null,active==='labeled-.DelPend')}
      <div class="sb-divider"></div>
      ${item('/events','📅','Events',null,active==='events')}
      <div class="sb-divider"></div>
      ${item('/settings','⚙️','Settings',null,active==='settings')}
    </div>
    <div class="sb-stat-block">
      ${(() => { const s = loadStats(); return `
      <div class="sb-stat-row"><span>🚫 Blocked</span><span class="sb-stat-val">${(s.cleaned||0).toLocaleString()}</span></div>
      <div class="sb-stat-row"><span>⭐ VIP</span><span class="sb-stat-val">${(s.vip||0).toLocaleString()}</span></div>
      <div class="sb-stat-row"><span>✅ OK</span><span class="sb-stat-val">${(s.ok||0).toLocaleString()}</span></div>`; })()}
    </div>
  </div>`;
}

// ─── Home page ─────────────────────────────────────────────────────────────────
export function homePage(blocklist, viplist = [], oklist = [], delPendSummary = null, keptDelPendConflicts = []) {
  const conflictSection = buildConflictSection(keptDelPendConflicts);
  const delPendSection  = buildDelPendSection(delPendSummary);
  const nav = sidebar({ active: 'home' });
  return `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-scroll" style="display:flex;flex-direction:column;align-items:center;justify-content:${conflictSection || delPendSection ? 'flex-start' : 'center'}">
          <div style="max-width:520px;width:100%;padding:${conflictSection || delPendSection ? '32px 16px 16px' : '0 16px'}">
            <div style="text-align:center;margin-bottom:${conflictSection || delPendSection ? '32px' : '0'}">
              <div style="font-size:2.5rem;margin-bottom:14px">📬</div>
              <h2 style="font-size:1.15rem;margin-bottom:8px">Ready to triage your inbox?</h2>
              <p style="color:#64748b;font-size:.88rem;margin-bottom:24px">⭐ VIP · ✅ OK · ✅ OK &amp; Clean · 🗑 Junk · 🚫 Unsubscribe</p>
              <a href="/triage" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem">▶ Start Triaging</a>
            </div>
            ${conflictSection}
            ${delPendSection}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── Triage page ───────────────────────────────────────────────────────────────
export function triagePage(emails, blocklist, savedStats, scanResults) {
  const rows = emails.map(triageEmailRow).join("");
  const dataScript = `<script type="application/json" id="page-data">${JSON.stringify({
    total: emails.length, blCount: blocklist.length, savedStats, scanResults,
    seenSenders: emails.map(e => extractName(e.from) + "<" + extractEmail(e.from) + ">"),
    seenIds: emails.map(e => e.id),
  })}</script>`;

  const nav = sidebar({ active: 'triage' });

  const body = `
    ${dataScript}
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">Inbox Triage <span style="font-weight:400;color:#94a3b8;font-size:.82rem">${emails.length} emails</span></span>
          <div style="display:flex;align-items:center;gap:10px;font-size:.82rem">
            <span id="progress">0 / ${emails.length} actioned</span>
            <span class="counter" id="junk-count">0 junked</span>
          </div>
        </div>
        <div class="main-scroll" id="email-panel">
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

  function applyWidths(){/* flex layout handles sizing */}
  window.addEventListener('pageshow',function(){
    var ds=JSON.parse(sessionStorage.getItem('deletedSenders')||'[]');
    if(!ds.length)return;
    var nextId=null;
    if(activePreviewId){
      var activeRow=document.getElementById('row-'+activePreviewId);
      if(activeRow&&ds.includes(activeRow.dataset.fromEmail)){
        var all=Array.from(document.querySelectorAll('.triage-row'));
        var idx=all.indexOf(activeRow);
        for(var i=idx+1;i<all.length;i++){if(!ds.includes(all[i].dataset.fromEmail)&&!all[i].classList.contains('done')){nextId=all[i].id.replace('row-','');break;}}
        if(!nextId)for(var i=idx-1;i>=0;i--){if(!ds.includes(all[i].dataset.fromEmail)&&!all[i].classList.contains('done')){nextId=all[i].id.replace('row-','');break;}}
      }
    }
    ds.forEach(function(email){
      document.querySelectorAll('.triage-row[data-from-email="'+email+'"]').forEach(function(r){r.remove();});
    });
    sessionStorage.removeItem('deletedSenders');
    if(activePreviewId&&!document.getElementById('row-'+activePreviewId)){
      if(nextId)openPreview(nextId);else closePreview();
    }
  });

  var scanEntries=[];
  function toggleScan(){scanOpen=!scanOpen;document.getElementById('scan-body').style.display=scanOpen?'':'none';document.getElementById('scan-chevron').textContent=scanOpen?'▲':'▼';}
  function toggleScanGroup(id){
    var el=document.getElementById(id),chev=document.getElementById('chev-'+id);if(!el)return;
    var open=el.style.display!=='none';el.style.display=open?'none':'';
    if(chev)chev.textContent=open?'▶':'▼';
  }
  function addScanRow(email,reason,moved,ts,subjects){
    document.getElementById('scan-card').style.display='';
    autoCleaned+=moved;document.getElementById('scan-total').textContent=autoCleaned;
    scanEntries.push({email:email,reason:reason,moved:moved,ts:ts||Date.now(),subjects:subjects||[]});
    renderScanRows();updateStats();
  }
  function renderScanRows(){
    var groups={};
    scanEntries.forEach(function(e){if(!groups[e.email])groups[e.email]=[];groups[e.email].push(e);});
    // Sort groups by most recent ts descending
    var emails=Object.keys(groups).sort(function(a,b){
      var maxA=Math.max.apply(null,groups[a].map(function(e){return e.ts||0;}));
      var maxB=Math.max.apply(null,groups[b].map(function(e){return e.ts||0;}));
      return maxB-maxA;
    });
    var html='';
    function subjHtml(subjects){
      if(!subjects||!subjects.length)return '';
      return '<div style="font-size:.75rem;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
        +subjects.slice(0,3).map(function(s){return s.replace(/</g,'&lt;');}).join(' &middot; ')+'</div>';
    }
    emails.forEach(function(email){
      var entries=groups[email].slice().sort(function(a,b){return (b.ts||0)-(a.ts||0);});
      var total=entries.reduce(function(s,e){return s+e.moved;},0);
      var sid='sg_'+email.replace(/[^a-z0-9]/gi,'_');
      var allSubj=[];entries.forEach(function(e){if(e.subjects)allSubj=allSubj.concat(e.subjects);});
      if(entries.length===1){
        html+='<div class="scan-row" style="flex-direction:column;align-items:flex-start;gap:2px">'
          +'<div style="display:flex;justify-content:space-between;width:100%"><span>'+email
          +' <span style="color:#94a3b8;font-size:.75rem">('+entries[0].reason+')</span></span>'
          +'<span class="scan-badge">'+total+' labeled</span></div>'
          +subjHtml(entries[0].subjects)+'</div>';
      } else {
        html+='<div class="scan-row" style="cursor:pointer" onclick="toggleScanGroup(\\''+sid+'\\');">'
          +'<span>'+email+' <span style="color:#94a3b8;font-size:.75rem">('+entries.length+' runs)</span></span>'
          +'<span style="display:flex;align-items:center;gap:8px"><span class="scan-badge">'+total+' labeled</span>'
          +'<span id="chev-'+sid+'" style="font-size:.7rem;color:#94a3b8">▶</span></span></div>'
          +'<div id="'+sid+'" style="display:none">';
        entries.forEach(function(e){
          html+='<div class="scan-row" style="padding-left:28px;background:#f8fafc;flex-direction:column;align-items:flex-start;gap:2px">'
            +'<div style="display:flex;justify-content:space-between;width:100%">'
            +'<span style="color:#64748b;font-size:.82rem">('+e.reason+')</span>'
            +'<span class="scan-badge">'+e.moved+' labeled</span></div>'
            +subjHtml(e.subjects)+'</div>';
        });
        html+='</div>';
      }
    });
    document.getElementById('scan-rows').innerHTML=html;
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
  function updateBlCount(d){blCount+=d;var el=document.getElementById('sb-block-count');if(el)el.textContent=blCount;}
  scanResults.forEach(function(r){addScanRow(r.email,r.reason,r.moved,r.latestEmailDate||(r.runAt?new Date(r.runAt).getTime():r.ts),r.subjects);});

  // Auto-preview first email on load
  (function(){
    var first=document.querySelector('.triage-row:not(.done)');
    if(first)openPreview(first.id.replace('row-',''));
  })();
  function toggleSnippet(id){openPreview(id);}
  function openPreview(id){
    if(activePreviewId===id&&previewPanel.classList.contains('open')){closePreview();return;}
    document.querySelectorAll('.triage-row.preview-active').forEach(function(r){r.classList.remove('preview-active');});
    activePreviewId=id;
    previewIframe.src='/api/preview/'+id;
    previewPanel.classList.add('open');
    document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
    var btn=document.querySelector('#row-'+id+' .btn-expand');
    if(btn)btn.textContent='▲ Close';
    var row=document.getElementById('row-'+id);
    if(row)row.classList.add('preview-active');
  }
  function closePreview(){
    previewPanel.classList.remove('open');
    previewIframe.src='';
    document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
    document.querySelectorAll('.triage-row.preview-active').forEach(function(r){r.classList.remove('preview-active');});
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
      if(data.autoCleanedEntries)data.autoCleanedEntries.forEach(function(e){addScanRow(e.email,e.reason,e.moved,e.latestEmailDate||e.ts,e.subjects);});
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
  function applyLabelToDuplicates(fromEmail,exceptId,rowCls,tagText,tagCls){
    var dupes=Array.from(document.querySelectorAll('.triage-row:not(.done)'))
      .filter(function(r){return r.dataset.fromEmail===fromEmail&&r.id!=='row-'+exceptId;});
    if(!dupes.length)return;
    dupes.forEach(function(row){
      var dupId=row.id.replace('row-','');
      // Just show the label badge — card stays visible and actionable
      var tag=document.getElementById('tag-'+dupId);
      if(tag){tag.className='status-tag '+tagCls;tag.textContent=tagText;tag.style.display='inline-block';}
      row.style.borderLeft='4px solid '+(tagCls==='tag-vip'?'#f59e0b':tagCls==='tag-ok'?'#14b8a6':tagCls==='tag-junk'?'#ef4444':'#f59e0b');
    });
  }
  function markDone(id,rowCls){
    var row=document.getElementById('row-'+id);
    row.classList.add('done',rowCls);actioned++;updateStats();
    // Auto-advance preview
    if(activePreviewId===id){
      var all=Array.from(document.querySelectorAll('.triage-row'));
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
            var fresh=document.querySelectorAll('.triage-row:not(.done)');
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
    markDone(id,isVip?'r-vip':'r-ok');applyLabelToDuplicates(fromEmail,id,isVip?'r-vip':'r-ok',isVip?'⭐ VIP':'✅ OK',isVip?'tag-vip':'tag-ok');
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
    setStatus(id,'tag-working','⏳ OK & cleaning...');markDone(id,'r-ok');applyLabelToDuplicates(fromEmail,id,'r-ok','✅ OK','tag-ok');
    try{
      var r=await fetch('/api/ok-clean',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,fromEmail,fromName})});
      var data=await r.json();cleaned+=data.cleaned||0;updateStats();
      document.getElementById('tag-'+id).textContent='✅ OK · 🗑 '+(data.cleaned||0)+' older cleaned';
      document.getElementById('tag-'+id).className='status-tag tag-ok';
      scheduleDismiss(id);
    }catch(e){document.getElementById('tag-'+id).textContent='⚠ '+e.message;}
  }
  async function doJunk(id,fromEmail,fromName){
    setStatus(id,'tag-working','⏳ Blocking...');markDone(id,'junked');applyLabelToDuplicates(fromEmail,id,'junked','🗑 Junked','tag-junk');
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
    setStatus(id,'tag-working','⏳ Unsubscribing...');markDone(id,'unsubbed');applyLabelToDuplicates(fromEmail,id,'unsubbed','🚫 Unsub','tag-unsub');
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
  async function doArchive(id,threadId){
    setStatus(id,'tag-working','⏳ Archiving...');markDone(id,'r-archived');
    try{
      await fetch('/api/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,threadId:threadId||null})});
      document.getElementById('tag-'+id).textContent='📥 Archived';
      document.getElementById('tag-'+id).className='status-tag tag-archive';
      scheduleDismiss(id);
      // Dismiss any other visible rows from the same thread
      if(threadId){
        document.querySelectorAll('[data-thread-id="'+threadId+'"]').forEach(function(row){
          var sid=row.id.replace(/^row-/,'');
          if(sid===id||row.classList.contains('done'))return;
          markDone(sid,'r-archived');
          var tag=document.getElementById('tag-'+sid);
          if(tag){tag.textContent='📥 Archived';tag.className='status-tag tag-archive';tag.style.display='inline-block';}
          var acts=document.getElementById('actions-'+sid);
          if(acts)acts.style.display='none';
          scheduleDismiss(sid);
        });
      }
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

  const nav = sidebar({ active: 'stats' });
  const body = `
    <script type="application/json" id="stats-data">${JSON.stringify({last30,topBlocked,inboxSeries})}</script>
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">📊 Stats Dashboard</span>
        </div>
        <div class="main-scroll">
          <div style="max-width:900px;margin:0 auto">
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
        </div>
      </div>
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
function senderEmailCard(e, border) {
  const dateStr = e.date ? new Date(e.date).toLocaleDateString() : "";
  const subj = (e.subject || "(no subject)").replace(/</g, "&lt;");
  const borderStyle = border ? `border-left:4px solid ${border}` : "";
  return `
    <div class="triage-row" id="row-${e.id}" style="${borderStyle}">
      <div class="triage-header" onclick="openPreview('${e.id}')">
        <input type="checkbox" class="sel-check" data-id="${e.id}" onclick="event.stopPropagation()" style="margin-right:10px;cursor:pointer;width:16px;height:16px;flex-shrink:0"/>
        <div class="triage-meta">
          <div class="triage-subj" style="${e.isRead ? "color:#94a3b8" : "font-weight:600;color:#1e293b"}">${subj}</div>
        </div>
        <div class="triage-date">${dateStr}</div>
        <span class="status-tag" id="tag-${e.id}" style="display:none"></span>
      </div>
      <div class="triage-actions" id="actions-${e.id}">
        <button class="btn btn-danger" onclick="doDelete('${e.id}')">🗑 Delete</button>
        <button class="btn btn-expand" onclick="openPreview('${e.id}')">▼ Preview</button>
      </div>
    </div>`;
}

export function senderPage(emails, fromEmail, fromName) {
  const displayName = fromName || fromEmail;
  const isVip = loadViplist().some(v => v.email === fromEmail.toLowerCase());
  const isOk  = !isVip && loadOklist().some(o => o.email === fromEmail.toLowerCase());
  const border = isVip ? '#f59e0b' : isOk ? '#14b8a6' : null;
  const tierBadge = isVip
    ? `<span style="background:#fef3c7;color:#92400e;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:8px">⭐ VIP</span>`
    : isOk
    ? `<span style="background:#ccfbf1;color:#0f766e;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:8px">✅ OK</span>`
    : "";
  const firstId = emails.length ? emails[0].id : null;
  const rows = emails.length
    ? emails.map(e => senderEmailCard(e, border)).join("")
    : `<div class="empty">No emails found from this sender.</div>`;

  const nav = sidebar({ active: '' });
  const body = `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">👤 ${displayName.replace(/</g,"&lt;")}${tierBadge} <span style="font-weight:400;color:#94a3b8;font-size:.8rem">&lt;${fromEmail}&gt;</span></span>
          <a href="javascript:history.back()" class="btn-nav">← Back</a>
        </div>
        <div style="flex:1;min-height:0;display:flex;overflow:hidden">
          <div class="main-scroll" id="email-panel" style="flex:1;overflow-y:auto;padding:16px;min-width:0">
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
      document.querySelectorAll('.triage-row').forEach(function(r){r.classList.remove('preview-active');});
      var row=document.getElementById('row-'+id);if(row)row.classList.add('preview-active');
      document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
      var btn=document.querySelector('#row-'+id+' .btn-expand');if(btn)btn.textContent='▲ Close';
    }
    function closePreview(){
      previewPanel.classList.remove('open');applyWidths();previewIframe.src='';
      document.querySelectorAll('.triage-row').forEach(function(r){r.classList.remove('preview-active');});
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
      var all=Array.from(document.querySelectorAll('.triage-row'));
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
          var remaining=Array.from(document.querySelectorAll('.triage-row:not(.faded)'));
          if(remaining.length)openPreview(remaining[0].id.replace('row-',''));else closePreview();
        }
        document.getElementById('select-all').checked=false;
        updateTrashBtn();
      }catch(e){alert('Error: '+e.message);}
    }
    ${firstId ? `window.addEventListener('load',function(){openPreview('${firstId}');});` : ''}
  `;

  return { body, script };
}

// ─── Labeled emails page ───────────────────────────────────────────────────────
export function labeledPage(labelName, emails) {
  const LABELS = {
    '..VIP':    { icon: '⭐', title: 'VIP Emails',      border: '#f59e0b' },
    '..OK':     { icon: '✅', title: 'OK Emails',       border: '#14b8a6' },
    '.DelPend': { icon: '🗑', title: 'Delete Pending',  border: '#ef4444' },
  };
  const meta = LABELS[labelName] || { icon: '🏷', title: labelName, border: '#6366f1' };
  const nav = sidebar({ active: 'labeled-' + labelName });
  const safe = s => (s||'').replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  const tz = ""; // date formatted server-side

  const rows = emails.length ? emails.map(e => {
    const fromEmail = extractEmail(e.from || '');
    const fromName  = extractName(e.from || '') || fromEmail;
    const dateStr   = e.date ? new Date(e.date).toLocaleDateString() : "";
    const subj      = (e.subject || "(no subject)").replace(/</g, "&lt;");
    return `
      <div class="triage-row" id="row-${e.id}" style="border-left:4px solid ${meta.border}" data-from-email="${fromEmail}">
        <div class="triage-header" onclick="openPreview('${e.id}')">
          <div class="triage-meta">
            <div class="triage-from">${fromName} <span style="color:#94a3b8;font-weight:400;font-size:.78rem">&lt;${fromEmail}&gt;</span></div>
            <div class="triage-subj" style="${e.isRead ? 'color:#94a3b8' : 'font-weight:600;color:#1e293b'}">${subj}</div>
          </div>
          <div class="triage-date">${dateStr}</div>
          <span class="status-tag" id="tag-${e.id}" style="display:none"></span>
        </div>
        <div class="triage-actions" id="actions-${e.id}">
          <button class="btn btn-danger" onclick="doDelete('${e.id}')">🗑 Delete</button>
          <a href="/sender?email=${encodeURIComponent(fromEmail)}&name=${encodeURIComponent(fromName)}" class="btn btn-sender">👤 View All</a>
          <button class="btn btn-expand" onclick="openPreview('${e.id}')">▼ Preview</button>
        </div>
      </div>`;
  }).join("") : `<div class="empty">No emails with this label.</div>`;

  const firstId = emails.length ? emails[0].id : null;

  const body = `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">${meta.icon} ${meta.title}</span>
          <span style="font-size:.78rem;color:#94a3b8">${emails.length} email${emails.length !== 1 ? "s" : ""}</span>
        </div>
        <div class="main-scroll" id="email-panel" style="flex:1;overflow-y:auto;padding:12px 16px">
          <div id="email-list">${rows}</div>
        </div>
      </div>
      <div class="preview-panel" id="preview-panel">
        <div class="preview-header">
          <span>Preview</span>
          <button class="preview-close" onclick="closePreview()">✕</button>
        </div>
        <iframe class="preview-iframe" id="preview-iframe" sandbox="allow-scripts allow-popups"></iframe>
      </div>
    </div>`;

  const script = `
    var previewPanel=document.getElementById('preview-panel');
    var previewIframe=document.getElementById('preview-iframe');
    var activePreviewId=null;
    function openPreview(id){
      if(activePreviewId===id&&previewPanel.classList.contains('open')){closePreview();return;}
      activePreviewId=id;previewIframe.src='/api/preview/'+id;
      previewPanel.classList.add('open');
      document.querySelectorAll('.triage-row').forEach(function(r){r.classList.remove('preview-active');});
      var row=document.getElementById('row-'+id);if(row)row.classList.add('preview-active');
      document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
      var btn=document.querySelector('#row-'+id+' .btn-expand');if(btn)btn.textContent='▲ Close';
    }
    function closePreview(){
      previewPanel.classList.remove('open');previewIframe.src='';
      document.querySelectorAll('.triage-row').forEach(function(r){r.classList.remove('preview-active');});
      document.querySelectorAll('.btn-expand').forEach(function(b){b.textContent='▼ Preview';});
    }
    function doDelete(id){
      fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
        .then(function(r){return r.json();}).then(function(){
          var row=document.getElementById('row-'+id);if(row){row.style.transition='opacity .4s';row.style.opacity='0';setTimeout(function(){row.remove();},400);}
          if(activePreviewId===id)closePreview();
        });
    }
    ${firstId ? `window.addEventListener('load',function(){openPreview('${firstId}');});` : ''}
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

  const nav = sidebar({ active: 'lists' });
  return `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">🚫 Blocklist Manager</span>
        </div>
        <div class="main-scroll">
          <div style="max-width:800px;margin:0 auto">
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
        </div>
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

  const nav = sidebar({ active: 'lists' });
  return `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">⭐ VIP Senders</span>
        </div>
        <div class="main-scroll">
          <div style="max-width:800px;margin:0 auto">
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
        </div>
      </div>
    </div>
  `;
}

// ─── Unified Lists page ────────────────────────────────────────────────────────
export function listsPage(blocklist, viplist, oklist, backupInfo = null, namedBackups = [], viewMode = "table") {
  const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  // Merge entries by email so each sender gets one row with all list badges
  const rawAll = [
    ...blocklist.map(e => ({ ...e, listType: 'block' })),
    ...viplist.map(e => ({ ...e, listType: 'vip' })),
    ...oklist.map(e => ({ ...e, listType: 'ok' })),
  ];
  const byEmail = {};
  for (const e of rawAll) {
    const k = e.email.toLowerCase();
    if (!byEmail[k]) byEmail[k] = { email: e.email, name: e.name, date: e.date, lists: [] };
    byEmail[k].lists.push({ listType: e.listType, reason: e.reason });
    if (e.name && !byEmail[k].name) byEmail[k].name = e.name;
    if (e.date && (!byEmail[k].date || e.date > byEmail[k].date)) byEmail[k].date = e.date;
  }
  const all = Object.values(byEmail);

  const removeForm = (email, listType) => `<form method="POST" action="/lists/remove" style="margin:0;display:inline">
    <input type="hidden" name="email" value="${esc(email)}"/>
    <input type="hidden" name="name" value=""/>
    <input type="hidden" name="listType" value="${listType}"/>
    <button class="btn btn-danger" type="submit" style="font-size:.72rem;padding:2px 7px">✕</button>
  </form>`;

  const badgeHtml = (list) => list.listType === 'block'
    ? `<span class="badge-block">🚫 ${esc(list.reason || 'blocked')}</span>`
    : list.listType === 'vip'
    ? `<span class="badge-vip">⭐ VIP</span>`
    : `<span class="badge-ok">✅ OK</span>`;

  const typesStr = (e) => e.lists.map(l => l.listType).join(' ');

  const rows = all.map(e => `<tr data-type="${typesStr(e)}" data-email="${esc(e.email.toLowerCase())}" data-name="${esc((e.name||"").toLowerCase())}" data-date="${esc(e.date||"")}">
      <td data-col="name" class="lt-td">${e.name ? `<span class="lt-name">${esc(e.name)}</span>` : `<span style="color:#cbd5e1">—</span>`}</td>
      <td data-col="email" class="lt-td"><span class="lt-email">${esc(e.email)}</span></td>
      <td data-col="date" class="lt-td" style="white-space:nowrap">${e.date ? new Date(e.date).toLocaleDateString() : "—"}</td>
      <td data-col="label" class="lt-td"><div style="display:flex;flex-direction:column;gap:3px">${e.lists.map(l => badgeHtml(l)).join('')}</div></td>
      <td data-col="action" class="lt-td lt-action">${e.lists.map(l => removeForm(e.email, l.listType)).join('')}</td>
    </tr>`).join("");

  const compactRows = all.map(e => `<div class="lt-compact-row" data-type="${typesStr(e)}" data-email="${esc(e.email.toLowerCase())}" data-name="${esc((e.name||"").toLowerCase())}" data-date="${esc(e.date||"")}">
    ${e.lists.map(l => badgeHtml(l)).join(' ')}
    <span class="lt-compact-name">${e.name ? `<strong>${esc(e.name)}</strong> <span style="color:#94a3b8">&lt;${esc(e.email)}&gt;</span>` : `<span>${esc(e.email)}</span>`}</span>
    <span class="lt-compact-date">${e.date ? new Date(e.date).toLocaleDateString() : ""}</span>
    ${e.lists.map(l => removeForm(e.email, l.listType)).join('')}
  </div>`).join("");

  const nav = sidebar({ active: 'lists' });

  const body = `
    <style>
      .lt-table{width:100%;border-collapse:collapse}
      .lt-th{padding:9px 12px;text-align:left;font-size:.76rem;font-weight:700;color:#6b7280;background:#f8fafc;border-bottom:2px solid #e2e8f0;white-space:nowrap;user-select:none}
      .lt-th.sortable{cursor:pointer}.lt-th.sortable:hover{background:#f1f5f9;color:#374151}
      .lt-th.draggable{cursor:grab}
      .lt-th-dragging{opacity:.35}
      .lt-th-over{background:#e0e7ff!important;color:#4338ca!important}
      .lt-td{padding:7px 12px;font-size:.84rem;border-bottom:1px solid #f1f5f9;vertical-align:middle}
      .lt-action{width:38px;text-align:right}
      .lt-name{font-weight:600;color:#1e293b}
      .lt-email{color:#374151;font-size:.81rem}
      .sort-arrow{color:#4f46e5;font-size:.68rem;margin-left:3px;vertical-align:middle}
      #list-tbody tr:hover td{background:#f8fafc}
      .lt-empty{padding:28px;text-align:center;color:#94a3b8;font-size:.85rem}
      .lt-compact-list{display:flex;flex-direction:column}
      .lt-compact-row{display:flex;align-items:center;gap:10px;padding:5px 10px;border-bottom:1px solid #f1f5f9;font-size:.82rem}
      .lt-compact-row:hover{background:#f8fafc}
      .lt-compact-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lt-compact-date{flex-shrink:0;font-size:.74rem;color:#94a3b8;white-space:nowrap}
    </style>
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">🏷 Label Lists</span>
          <span style="font-size:.8rem;color:#94a3b8">${all.length} senders</span>
        </div>
        <div class="main-scroll">
          <div class="list-toolbar">
            <button class="list-chip list-chip-active" id="chip-all" onclick="filterList('all',this)">All ${all.length}</button>
            <button class="list-chip" id="chip-block" onclick="filterList('block',this)">🚫 Blocked ${blocklist.length}</button>
            <button class="list-chip" id="chip-vip" onclick="filterList('vip',this)">⭐ VIP ${viplist.length}</button>
            <button class="list-chip" id="chip-ok" onclick="filterList('ok',this)">✅ OK ${oklist.length}</button>
            <input class="list-search" id="list-search" type="text" placeholder="Search by name or email…" oninput="searchList(this.value)"/>
            <button class="btn btn-secondary" id="create-backup-btn" style="margin-left:auto;font-size:.78rem;padding:5px 12px;white-space:nowrap" type="button">💾 Create Backup</button>
            <span id="backup-status" style="font-size:.78rem;color:#64748b"></span>
          </div>
          <div class="card" style="overflow:hidden">
            ${viewMode === 'compact' ? `
            <div class="lt-compact-list" id="list-tbody">
              ${all.length ? compactRows : '<div class="lt-empty">No entries yet.</div>'}
            </div>` : `
            <div style="overflow-x:auto">
              <table class="lt-table">
                <thead><tr id="list-thead-row"></tr></thead>
                <tbody id="list-tbody">${all.length ? rows : ''}</tbody>
              </table>
              ${!all.length ? '<div class="lt-empty">No entries yet.</div>' : ''}
            </div>`}
          </div>
          <div class="card" style="margin-top:14px">
            <div class="card-header" style="cursor:pointer" onclick="toggleAdd()">
              <span>+ Add Sender</span><span id="add-chev">▼</span>
            </div>
            <div id="add-panel" style="display:none">
              <form class="add-form" id="add-form" method="POST" action="/blocklist/add">
                <input type="text" name="name" placeholder="Display name (optional)" style="max-width:180px"/>
                <input type="text" name="email" placeholder="email@domain.com" required/>
                <select id="add-list" onchange="updateAddForm(this)" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff">
                  <option value="blocklist">🚫 Blocklist</option>
                  <option value="viplist">⭐ VIP</option>
                  <option value="oklist">✅ OK</option>
                </select>
                <select name="reason" id="add-reason" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff">
                  <option value="manual">manual</option><option value="junk">junk</option><option value="unsub">unsub</option>
                </select>
                <button class="btn btn-primary" type="submit">+ Add</button>
              </form>
            </div>
          </div>
          <div class="card" style="margin-top:14px;border:1px solid #fecaca">
            <div class="card-header" style="background:#fff5f5;color:#b91c1c;border-bottom:1px solid #fecaca">Danger Zone</div>
            <div style="padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
              <div>
                <div style="font-weight:600;font-size:.88rem;color:#374151">Reset Blocklist</div>
                <div style="font-size:.78rem;color:#94a3b8;margin-top:2px">Permanently clears all ${blocklist.length} blocked sender${blocklist.length !== 1 ? 's' : ''}. A backup will be saved automatically.</div>
              </div>
              <button class="btn btn-danger" onclick="openResetModal()">🗑 Reset Blocklist</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="reset-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1000;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:14px;padding:28px 32px;max-width:440px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="font-size:2rem;text-align:center;margin-bottom:12px">⚠️</div>
        <h3 style="margin:0 0 10px;text-align:center;color:#b91c1c;font-size:1.05rem">Reset Blocklist?</h3>
        <p style="font-size:.85rem;color:#374151;margin:0 0 8px">You are about to <strong>permanently delete all ${blocklist.length} blocked sender${blocklist.length !== 1 ? 's' : ''}</strong>. This list may represent hours of triage work.</p>
        <p style="font-size:.85rem;color:#374151;margin:0 0 18px">A backup will be saved and can be restored from Settings. Gmail labels already applied to emails are not affected.</p>
        <div style="font-size:.82rem;color:#64748b;margin-bottom:6px">Type <strong>RESET</strong> to confirm:</div>
        <input id="reset-confirm-input" type="text" autocomplete="off" placeholder="RESET"
          style="width:100%;box-sizing:border-box;padding:8px 12px;border:2px solid #e2e8f0;border-radius:8px;font-size:.9rem;margin-bottom:16px"
          oninput="document.getElementById('reset-confirm-btn').disabled=this.value!=='RESET'"/>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="closeResetModal()">Cancel</button>
          <form method="POST" action="/lists/reset-blocklist" style="margin:0">
            <button id="reset-confirm-btn" class="btn btn-danger" type="submit" disabled>Reset Blocklist</button>
          </form>
        </div>
      </div>
    </div>
  `;

  const script = `
    var COLS = ['name','email','date','label','action'];
    var COL_LABELS = {name:'Name',email:'Email Address',date:'Date Added',label:'Label',action:''};
    var _filter='all', _search='', _sortCol='date', _sortDir='desc';
    var _colOrder = ['name','email','date','label','action'];
    var _dragCol = null;

    function loadPrefs() {
      try {
        var p = JSON.parse(localStorage.getItem('listsLayout')||'{}');
        if (p.colOrder && p.colOrder.length === COLS.length && COLS.every(function(c){return p.colOrder.indexOf(c)>=0;})) _colOrder = p.colOrder;
        if (p.sortCol && COLS.indexOf(p.sortCol)>=0) _sortCol = p.sortCol;
        if (p.sortDir) _sortDir = p.sortDir;
        if (p.filter) _filter = p.filter;
        if (p.search) _search = p.search;
      } catch(e){}
    }
    function savePrefs() {
      localStorage.setItem('listsLayout', JSON.stringify({colOrder:_colOrder,sortCol:_sortCol,sortDir:_sortDir,filter:_filter,search:_search}));
    }

    function renderHeaders() {
      var thead = document.getElementById('list-thead-row');
      thead.innerHTML = '';
      _colOrder.forEach(function(col) {
        var th = document.createElement('th');
        th.className = 'lt-th' + (col!=='action'?' sortable draggable':'');
        th.dataset.col = col;
        if (col !== 'action') {
          th.draggable = true;
          th.addEventListener('click', function(){ sortBy(col); });
          th.addEventListener('dragstart', onDragStart);
          th.addEventListener('dragover', onDragOver);
          th.addEventListener('drop', onDrop);
          th.addEventListener('dragend', onDragEnd);
          var arrow = _sortCol===col ? '<span class="sort-arrow">'+(_sortDir==='asc'?'▲':'▼')+'</span>' : '';
          th.innerHTML = COL_LABELS[col] + arrow;
        } else {
          th.innerHTML = '';
        }
        thead.appendChild(th);
      });
    }

    function reorderCells() {
      document.querySelectorAll('#list-tbody tr[data-type]').forEach(function(tr) {
        var cells = {};
        tr.querySelectorAll('td[data-col]').forEach(function(td){ cells[td.dataset.col] = td; });
        _colOrder.forEach(function(col){ if (cells[col]) tr.appendChild(cells[col]); });
      });
    }

    function sortRows() {
      var tbody = document.getElementById('list-tbody');
      var rows = Array.from(tbody.querySelectorAll('tr[data-type]'));
      rows.sort(function(a, b) {
        var av = a.dataset[_sortCol==='label'?'type':_sortCol] || '';
        var bv = b.dataset[_sortCol==='label'?'type':_sortCol] || '';
        if (_sortCol === 'date') { av = new Date(av).getTime()||0; bv = new Date(bv).getTime()||0; }
        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return _sortDir === 'asc' ? cmp : -cmp;
      });
      rows.forEach(function(r){ tbody.appendChild(r); });
    }

    function sortBy(col) {
      if (_sortCol === col) { _sortDir = _sortDir==='asc'?'desc':'asc'; }
      else { _sortCol = col; _sortDir = col==='date'?'desc':'asc'; }
      savePrefs();
      renderHeaders();
      sortRows();
      applyFilters();
    }

    function onDragStart(e) {
      _dragCol = this.dataset.col;
      this.classList.add('lt-th-dragging');
      e.dataTransfer.effectAllowed = 'move';
    }
    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.lt-th').forEach(function(t){ t.classList.remove('lt-th-over'); });
      if (this.dataset.col !== 'action') this.classList.add('lt-th-over');
    }
    function onDrop(e) {
      e.preventDefault();
      var target = this.dataset.col;
      if (!_dragCol || _dragCol === target || target === 'action') return;
      var fi = _colOrder.indexOf(_dragCol), ti = _colOrder.indexOf(target);
      _colOrder.splice(fi, 1); _colOrder.splice(ti, 0, _dragCol);
      savePrefs();
      renderHeaders();
      reorderCells();
      applyFilters();
    }
    function onDragEnd() {
      document.querySelectorAll('.lt-th').forEach(function(t){ t.classList.remove('lt-th-dragging','lt-th-over'); });
    }

    function filterList(type, btn) {
      _filter = type;
      document.querySelectorAll('.list-chip').forEach(function(b){ b.classList.remove('list-chip-active'); });
      btn.classList.add('list-chip-active');
      savePrefs();
      applyFilters();
    }
    function searchList(q) { _search = q.toLowerCase(); savePrefs(); applyFilters(); }
    function applyFilters() {
      document.querySelectorAll('#list-tbody [data-type]').forEach(function(r) {
        var tm = _filter==='all' || r.dataset.type.indexOf(_filter)>=0;
        var sm = !_search || r.dataset.email.includes(_search) || r.dataset.name.includes(_search);
        r.style.display = (tm && sm) ? '' : 'none';
      });
    }

    function toggleAdd() {
      var p=document.getElementById('add-panel'), c=document.getElementById('add-chev');
      var open = p.style.display==='none';
      p.style.display = open?'block':'none'; c.textContent = open?'▲':'▼';
    }
    function updateAddForm(sel) {
      document.getElementById('add-form').action = '/'+sel.value+'/add';
      document.getElementById('add-reason').style.display = sel.value==='blocklist'?'':'none';
    }
    document.getElementById('create-backup-btn').onclick = async function() {
      var btn = this, status = document.getElementById('backup-status');
      btn.disabled = true; status.textContent = 'Saving...';
      try {
        var r = await fetch('/lists/backup', { method: 'POST' });
        var d = await r.json();
        status.textContent = d.ok ? ('Backup #' + d.n + ' saved') : ('Error: ' + d.error);
      } catch(e) { status.textContent = 'Error: ' + e.message; }
      btn.disabled = false;
    };
    function openResetModal() {
      document.getElementById('reset-modal').style.display='flex';
      document.getElementById('reset-confirm-input').value='';
      document.getElementById('reset-confirm-btn').disabled=true;
    }
    function closeResetModal() { document.getElementById('reset-modal').style.display='none'; }
    document.getElementById('reset-modal').addEventListener('click',function(e){if(e.target===this)closeResetModal();});

    // Init
    var _viewMode = '${viewMode}';
    loadPrefs();
    if (_viewMode !== 'compact') { renderHeaders(); reorderCells(); sortRows(); }
    // Restore filter chip
    var chipMap = {all:'chip-all',block:'chip-block',vip:'chip-vip',ok:'chip-ok'};
    if (chipMap[_filter]) {
      document.querySelectorAll('.list-chip').forEach(function(b){b.classList.remove('list-chip-active');});
      var chip = document.getElementById(chipMap[_filter]);
      if (chip) chip.classList.add('list-chip-active');
    }
    // Restore search
    if (_search) { var si=document.getElementById('list-search'); if(si){si.value=_search;} }
    applyFilters();
  `;

  return { body, script };
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

  const nav = sidebar({ active: 'review' });
  const body = `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">🤖 Claude Review Queue <span style="font-weight:400;color:#94a3b8;font-size:.82rem">${pending.length} pending</span></span>
        </div>
        <div style="flex:1;min-height:0;display:flex;overflow:hidden">
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

  const nav = sidebar({ active: 'lists' });
  return `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">✅ OK Senders</span>
        </div>
        <div class="main-scroll">
          <div style="max-width:800px;margin:0 auto">
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
        </div>
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

export function settingsPage(settings, backupInfo = null, namedBackups = [], activityLog = []) {
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

  const nav = sidebar({ active: 'settings' });
  const body = `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar">
          <span style="font-weight:600;font-size:.92rem">⚙️ Settings</span>
        </div>
        <div class="main-scroll">
          <div style="max-width:800px;margin:0 auto">
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
          Event Interests
          <span style="font-size:.75rem;font-weight:400;color:#94a3b8">What types of events Claude should search for in your locations</span>
        </div>
        ${(settings.eventInterests||[]).length
          ? (settings.eventInterests||[]).map((t,i) => `
            <div class="bl-row" id="interest-row-${i}">
              <div id="interest-view-${i}" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
                <div class="bl-email">${t.replace(/</g,"&lt;")}</div>
                <button class="btn btn-secondary" type="button" style="font-size:.78rem;padding:4px 8px" onclick="interestEditOpen(${i})">Edit</button>
                <form method="POST" action="/settings/event-interests/remove" style="margin:0">
                  <input type="hidden" name="topic" value="${t.replace(/"/g,'&quot;')}">
                  <button class="btn btn-danger" type="submit" style="font-size:.78rem;padding:4px 8px">Remove</button>
                </form>
              </div>
              <form id="interest-edit-${i}" method="POST" action="/settings/event-interests/edit" style="display:none;flex:1;gap:6px;align-items:center" onsubmit="">
                <input type="hidden" name="old" value="${t.replace(/"/g,'&quot;')}">
                <input type="text" name="new" value="${t.replace(/"/g,'&quot;')}" style="flex:1;padding:5px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem">
                <button class="btn btn-primary" type="submit" style="font-size:.78rem;padding:4px 10px">Save</button>
                <button class="btn btn-secondary" type="button" style="font-size:.78rem;padding:4px 8px" onclick="interestEditClose(${i})">Cancel</button>
              </form>
            </div>`).join("")
          : `<div class="empty">No interests set — add topics like "wine festivals" or "outdoor concerts".</div>`}
        <div class="add-form">
          <input type="text" id="interest-input" placeholder="e.g. wine festivals" style="flex:1;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem">
          <button class="btn btn-primary" id="interest-add-btn" type="button">Add</button>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          Event Search Schedule
          <span style="font-size:.75rem;font-weight:400;color:#94a3b8">Runs at the Daily Summary send time, every N days</span>
        </div>
        <form method="POST" action="/settings/events-search" style="padding:14px 18px;display:flex;flex-direction:column;gap:14px">
          <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;cursor:pointer">
            <input type="checkbox" name="enabled" value="1" ${settings.eventsSearchEnabled ? 'checked' : ''}>
            Enable scheduled event search
          </label>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:.8rem;color:#64748b;font-weight:500">Run every</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="number" name="intervalDays" value="${settings.eventsSearchIntervalDays||7}" min="1" max="365" style="width:70px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem">
              <span style="font-size:.85rem;color:#374151">days, at ${String(settings.dailySummaryHour??6).padStart(2,'0')}:${String(settings.dailySummaryMinute??0).padStart(2,'0')} (set in Daily Summary)</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:.8rem;color:#64748b;font-weight:500">Send results to</label>
            <input type="text" name="email" value="${settings.eventsSearchEmail||''}" placeholder="email address (leave blank to use Daily Summary email)" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem">
          </div>
          ${settings.eventsSearchLastRunAt ? `<div style="font-size:.8rem;color:#64748b">Last searched: ${new Date(settings.eventsSearchLastRunAt).toLocaleString()}</div>` : ''}
          <div style="display:flex;gap:10px">
            <button class="btn btn-primary" type="submit">Save</button>
            <button class="btn btn-secondary" type="submit" formaction="/events/search" formmethod="POST">Search Now</button>
          </div>
        </form>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          Daily Email Summary
          <span style="font-size:.75rem;font-weight:400;color:#94a3b8">Sends a summary of the previous 24h of auto-clean activity</span>
        </div>
        <form method="POST" action="/settings/daily-summary" style="padding:14px 18px 10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;cursor:pointer">
            <input type="checkbox" name="enabled" ${settings.dailySummaryEnabled ? "checked" : ""} style="width:16px;height:16px">
            Enabled
          </label>
          <input type="email" name="email" value="${settings.dailySummaryEmail || ""}"
            placeholder="Leave blank to send to your Gmail account"
            style="flex:1;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem">
          <button class="btn btn-primary" type="submit">Save</button>
        </form>
        <form method="POST" action="/settings/daily-summary-schedule" style="padding:4px 18px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px solid #f1f5f9">
          <span style="font-size:.82rem;color:#64748b;white-space:nowrap">Send at</span>
          <input type="number" name="hour" min="0" max="23" value="${settings.dailySummaryHour ?? 6}"
            style="width:54px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;text-align:center">
          <span style="font-size:.82rem;color:#64748b">:</span>
          <input type="number" name="minute" min="0" max="59" value="${String(settings.dailySummaryMinute ?? 0).padStart(2,'0')}"
            style="width:54px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;text-align:center">
          <span style="font-size:.82rem;color:#64748b;white-space:nowrap;margin-left:8px">every</span>
          <input type="number" name="intervalValue" min="1" value="${settings.dailySummaryIntervalValue ?? 1}"
            style="width:60px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;text-align:center">
          <select name="intervalUnit" style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff">
            <option value="hours" ${(settings.dailySummaryIntervalUnit||"days")==="hours"?"selected":""}>hours</option>
            <option value="days"  ${(settings.dailySummaryIntervalUnit||"days")==="days" ?"selected":""}>days</option>
            <option value="weeks" ${(settings.dailySummaryIntervalUnit||"days")==="weeks"?"selected":""}>weeks</option>
          </select>
          <button class="btn btn-secondary" type="submit" style="font-size:.82rem">Save Schedule</button>
        </form>
        <div style="padding:0 18px 14px;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;gap:10px;align-items:center">
            <button class="btn btn-secondary" id="test-summary-btn" type="button">Send Test Email Now</button>
            <span id="test-summary-status" style="font-size:.82rem;color:#64748b"></span>
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:.82rem;cursor:pointer;color:#64748b">
            <input type="checkbox" id="debug-summary-cb" ${settings.dailySummaryDebug ? "checked" : ""} style="width:14px;height:14px">
            Debug: send after each auto-clean (auto-disables after 12h)
            <span id="debug-summary-ts" style="color:#f59e0b;font-size:.75rem">${settings.dailySummaryDebug && settings.dailySummaryDebugEnabledAt ? `· enabled ${Math.round((Date.now()-new Date(settings.dailySummaryDebugEnabledAt).getTime())/3600000*10)/10}h ago` : ""}</span>
          </label>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header">Display</div>
        <form method="POST" action="/settings/lists-view-mode" style="padding:14px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <label style="font-size:.85rem;color:#374151;font-weight:500">Label Lists view</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:.84rem;cursor:pointer">
            <input type="radio" name="mode" value="table" ${settings.listsViewMode !== 'compact' ? 'checked' : ''}> Table
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:.84rem;cursor:pointer">
            <input type="radio" name="mode" value="compact" ${settings.listsViewMode === 'compact' ? 'checked' : ''}> Compact
          </label>
          <button class="btn btn-primary" type="submit">Save</button>
        </form>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          Timezone
          <span style="font-size:.75rem;font-weight:400;color:#94a3b8">Used when creating Google Calendar events and for scheduling</span>
        </div>
        <form method="POST" action="/settings/timezone" style="padding:14px 18px;display:flex;gap:10px;align-items:center">
          <select name="timezone" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff;flex:1">
            ${TIMEZONES.map(([val, lbl]) => `<option value="${val}"${val === timezone ? " selected" : ""}>${lbl} — ${val}</option>`).join("")}
          </select>
          <button class="btn btn-primary" type="submit">Save</button>
        </form>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          Auto-Clean Schedule
          <span style="font-size:.75rem;font-weight:400;color:#94a3b8">Runs blocklist + VIP/OK scan on a timer while the app is running</span>
        </div>
        <form method="POST" action="/settings/scheduler" style="padding:14px 18px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;cursor:pointer">
            <input type="checkbox" name="enabled" ${settings.schedulerEnabled !== false ? "checked" : ""} style="width:16px;height:16px">
            Enabled
          </label>
          <label style="font-size:.85rem">Start time
            <select name="startHour" style="margin-left:6px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff">
              ${[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22].map(h =>
                `<option value="${h}"${h === (settings.schedulerStartHour ?? 10) ? " selected" : ""}>${h < 12 ? h+" AM" : h === 12 ? "12 PM" : (h-12)+" PM"}</option>`
              ).join("")}
            </select>
            <select name="startMinute" style="margin-left:4px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff">
              <option value="0"${(settings.schedulerStartMinute ?? 0) === 0 ? " selected" : ""}>:00</option>
              <option value="30"${(settings.schedulerStartMinute ?? 0) === 30 ? " selected" : ""}>:30</option>
            </select>
          </label>
          <label style="font-size:.85rem">Every
            <select name="intervalHours" style="margin-left:6px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff">
              ${[[0.5,"30 min"],[1,"1 hr"],[2,"2 hr"],[3,"3 hr"],[4,"4 hr"],[6,"6 hr"],[8,"8 hr"]].map(([v,label]) =>
                `<option value="${v}"${(settings.schedulerIntervalHours ?? 2) === v ? " selected" : ""}>${label}</option>`
              ).join("")}
            </select>
          </label>
          <button class="btn btn-primary" type="submit">Save</button>
        </form>
        <div style="padding:0 18px 14px;display:flex;gap:10px;align-items:center">
          <button class="btn btn-secondary" id="run-scan-btn" type="button">Run Auto-Clean Now</button>
          <span id="run-scan-status" style="font-size:.82rem;color:#64748b"></span>
        </div>
      </div>
      ${(backupInfo && backupInfo.backedUpAt) || namedBackups.length ? `
      <div class="card" style="margin-top:16px;border:1px solid #fde68a">
        <div class="card-header" style="background:#fffbeb;border-bottom:1px solid #fde68a">
          Blocklist Backups
          <span style="font-size:.75rem;font-weight:400;color:#92400e">Manage saved snapshots · <a href="/lists" style="color:#92400e">Create new backup on Lists page</a></span>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#fffbeb">
            <th style="padding:6px 14px;text-align:left;font-size:.74rem;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a">#</th>
            <th style="padding:6px 14px;text-align:left;font-size:.74rem;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a">Date</th>
            <th style="padding:6px 14px;text-align:left;font-size:.74rem;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a">Senders</th>
            <th style="padding:6px 14px;text-align:left;font-size:.74rem;font-weight:600;color:#92400e;border-bottom:1px solid #fde68a">Type</th>
            <th style="padding:6px 14px;border-bottom:1px solid #fde68a"></th>
          </tr></thead>
          <tbody>
            ${namedBackups.slice().reverse().map(b => `<tr>
              <td style="padding:7px 14px;font-size:.84rem;color:#374151;font-weight:600">#${b.n}</td>
              <td style="padding:7px 14px;font-size:.82rem;color:#64748b">${new Date(b.backedUpAt).toLocaleString()}</td>
              <td style="padding:7px 14px;font-size:.84rem;color:#374151">${b.list.length}</td>
              <td style="padding:7px 14px;font-size:.78rem;color:#94a3b8">manual</td>
              <td style="padding:7px 14px;text-align:right;display:flex;gap:6px;justify-content:flex-end">
                <button class="btn btn-secondary" style="font-size:.75rem;padding:3px 10px" onclick="openRestoreModal('named',${b.n},${b.list.length},'${new Date(b.backedUpAt).toLocaleDateString()}')">↩ Restore</button>
                <form method="POST" action="/settings/delete-named-backup" style="margin:0" onsubmit="return confirm('Delete backup #${b.n}?')">
                  <input type="hidden" name="n" value="${b.n}"/>
                  <button class="btn btn-danger" style="font-size:.75rem;padding:3px 9px" type="submit">✕</button>
                </form>
              </td>
            </tr>`).join('')}
            ${backupInfo && backupInfo.backedUpAt ? `<tr>
              <td style="padding:7px 14px;font-size:.84rem;color:#374151;font-weight:600">—</td>
              <td style="padding:7px 14px;font-size:.82rem;color:#64748b">${new Date(backupInfo.backedUpAt).toLocaleString()}</td>
              <td style="padding:7px 14px;font-size:.84rem;color:#374151">${backupInfo.list.length}</td>
              <td style="padding:7px 14px;font-size:.78rem;color:#94a3b8">pre-reset</td>
              <td style="padding:7px 14px;text-align:right">
                <button class="btn btn-secondary" style="font-size:.75rem;padding:3px 10px" onclick="openRestoreModal('auto',0,${backupInfo.list.length},'${new Date(backupInfo.backedUpAt).toLocaleDateString()}')">↩ Restore</button>
              </td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>
      <div id="restore-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;align-items:center;justify-content:center">
        <div style="background:#fff;border-radius:12px;padding:24px 28px;max-width:380px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,.25)">
          <h3 style="margin:0 0 10px;font-size:1rem;color:#1e293b" id="restore-modal-title">Restore Backup</h3>
          <p id="restore-modal-body" style="font-size:.84rem;color:#64748b;margin:0 0 18px"></p>
          <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-secondary" onclick="closeRestoreModal()">Cancel</button>
            <form id="restore-form-replace" method="POST" style="margin:0">
              <input type="hidden" name="merge" value="false"/>
              <input type="hidden" id="restore-n" name="n" value=""/>
              <button class="btn btn-primary" type="submit">Replace current list</button>
            </form>
            <form id="restore-form-merge" method="POST" style="margin:0">
              <input type="hidden" name="merge" value="true"/>
              <input type="hidden" id="restore-n-merge" name="n" value=""/>
              <button class="btn btn-secondary" type="submit" style="background:#f0fdf4;color:#15803d;border:1px solid #86efac">Merge into current list</button>
            </form>
          </div>
        </div>
      </div>` : ""}
      <div class="card" style="margin-top:16px">
        <div class="card-header">
          Activity Log
          <span style="font-size:.75rem;font-weight:400;color:#94a3b8">Last ${activityLog.length} events (newest first)</span>
        </div>
        ${activityLog.length === 0 ? `<div class="empty">No activity recorded yet.</div>` : `
        <table style="width:100%;border-collapse:collapse;font-size:.82rem">
          <thead><tr style="background:#f8fafc">
            <th style="padding:6px 14px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Time</th>
            <th style="padding:6px 14px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Action</th>
            <th style="padding:6px 14px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Sender / Rule</th>
            <th style="padding:6px 14px;text-align:right;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0">Count</th>
          </tr></thead>
          <tbody>${activityLog.slice(0, 200).map(e => {
            const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
            const ts = e.ts ? new Date(e.ts).toLocaleString('en-US', { timeZone: settings.timezone || 'America/Los_Angeles', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';
            const actionMap = { vip:'⭐ VIP', ok:'✅ OK', 'ok-clean':'✅ OK & Clean', junk:'🗑 Junk', unsub:'🚫 Unsub', archive:'📥 Archive', delete:'🗑 Delete', 'rule-applied':'⚡ Rule' };
            const badge = e.type === 'rule'
              ? `<span style="background:#ede9fe;color:#6d28d9;padding:1px 7px;border-radius:999px;font-size:.74rem;font-weight:700">⚡ Rule</span>`
              : { vip:`<span style="background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:999px;font-size:.74rem;font-weight:700">⭐ VIP</span>`,
                  ok:`<span style="background:#ccfbf1;color:#0f766e;padding:1px 7px;border-radius:999px;font-size:.74rem;font-weight:700">✅ OK</span>`,
                  'ok-clean':`<span style="background:#a7f3d0;color:#065f46;padding:1px 7px;border-radius:999px;font-size:.74rem;font-weight:700">✅ OK & Clean</span>`,
                  junk:`<span style="background:#fee2e2;color:#b91c1c;padding:1px 7px;border-radius:999px;font-size:.74rem;font-weight:700">🗑 Junk</span>`,
                  unsub:`<span style="background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:999px;font-size:.74rem;font-weight:700">🚫 Unsub</span>`,
                  archive:`<span style="background:#dbeafe;color:#1e40af;padding:1px 7px;border-radius:999px;font-size:.74rem;font-weight:700">📥 Archive</span>`,
                  delete:`<span style="background:#fee2e2;color:#b91c1c;padding:1px 7px;border-radius:999px;font-size:.74rem;font-weight:700">🗑 Delete</span>`,
                }[e.action] || `<span style="color:#94a3b8">${esc(e.action)}</span>`;
            const senderCell = e.type === 'rule'
              ? `<span style="font-weight:600">${esc(e.ruleName)}</span><span style="color:#94a3b8;margin-left:6px">→ ${esc(e.label)}</span>`
              : e.sender ? `${esc(e.senderName || e.sender)}<span style="color:#94a3b8;font-size:.76rem;margin-left:4px">&lt;${esc(e.sender)}&gt;</span>` : `<span style="color:#94a3b8">${esc(e.msgId||'—')}</span>`;
            const count = e.count != null ? e.count : '—';
            return `<tr style="border-bottom:1px solid #f8fafc">
              <td style="padding:6px 14px;white-space:nowrap;color:#64748b">${ts}</td>
              <td style="padding:6px 14px">${badge}</td>
              <td style="padding:6px 14px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${senderCell}</td>
              <td style="padding:6px 14px;text-align:right;color:#64748b">${count}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`}
      </div>
          </div>
        </div>
      </div>
    </div>`;

  const script = `
    function interestEditOpen(i) {
      document.getElementById('interest-view-'+i).style.display='none';
      var ef=document.getElementById('interest-edit-'+i);
      ef.style.display='flex'; ef.querySelector('input[name="new"]').focus();
    }
    function interestEditClose(i) {
      document.getElementById('interest-edit-'+i).style.display='none';
      document.getElementById('interest-view-'+i).style.display='flex';
    }
    var interestInput = document.getElementById('interest-input');
    document.getElementById('interest-add-btn').onclick = function() {
      var val = interestInput.value.trim();
      if (!val) return;
      var f = document.createElement('form');
      f.method = 'POST'; f.action = '/settings/event-interests/add';
      var i = document.createElement('input');
      i.type = 'hidden'; i.name = 'topic'; i.value = val;
      f.appendChild(i); document.body.appendChild(f); f.submit();
    };
    interestInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('interest-add-btn').click(); });
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
    };
    document.getElementById('run-scan-btn').onclick = async function() {
      var btn = this, status = document.getElementById('run-scan-status');
      btn.disabled = true; status.textContent = 'Running...';
      try {
        var r = await fetch('/settings/run-scan', { method: 'POST' });
        var d = await r.json();
        if (!d.ok) { status.textContent = 'Error: ' + d.error; }
        else if (!d.totalMoved) { status.textContent = 'Nothing to clean at ' + d.timeLabel; }
        else {
          var parts = [];
          if (d.blocklistMoved) parts.push('blocklist: ' + d.blocklistMoved);
          if (d.vipMoved) parts.push('VIP: ' + d.vipMoved);
          if (d.okMoved) parts.push('OK: ' + d.okMoved);
          status.textContent = d.totalMoved + ' emails labeled at ' + d.timeLabel + ' (' + parts.join(', ') + ')';
        }
      } catch(e) { status.textContent = 'Error: ' + e.message; }
      btn.disabled = false;
    };
    document.getElementById('test-summary-btn').onclick = async function() {
      var btn = this, status = document.getElementById('test-summary-status');
      btn.disabled = true; status.textContent = 'Sending...';
      try {
        var r = await fetch('/settings/daily-summary/test', { method: 'POST' });
        var d = await r.json();
        status.textContent = d.ok ? (d.sent ? 'Sent!' : 'Nothing to report — no activity in last 24h') : ('Error: ' + d.error);
      } catch(e) { status.textContent = 'Error: ' + e.message; }
      btn.disabled = false;
    };
    var debugExpireTimer = null;
    function scheduleDebugExpiry(enabledAt) {
      if (debugExpireTimer) { clearTimeout(debugExpireTimer); debugExpireTimer = null; }
      if (!enabledAt) return;
      var msLeft = new Date(enabledAt).getTime() + 12 * 3600000 - Date.now();
      if (msLeft <= 0) { updateDebugTs(false, null); return; }
      debugExpireTimer = setTimeout(function() { updateDebugTs(false, null); }, msLeft);
    }
    function updateDebugTs(enabled, enabledAt) {
      var cb = document.getElementById('debug-summary-cb');
      var ts = document.getElementById('debug-summary-ts');
      cb.checked = enabled;
      if (enabled && enabledAt) {
        var hrs = Math.round((Date.now() - new Date(enabledAt).getTime()) / 3600000 * 10) / 10;
        ts.textContent = '· enabled ' + hrs + 'h ago';
      } else {
        ts.textContent = '';
      }
    }
    document.getElementById('debug-summary-cb').onchange = async function() {
      var cb = this;
      var intended = cb.checked;
      try {
        var r = await fetch('/settings/daily-summary/debug', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ enabled: intended }) });
        var d = await r.json();
        if (d.ok) { updateDebugTs(intended, d.enabledAt); scheduleDebugExpiry(intended ? d.enabledAt : null); }
        else { cb.checked = !intended; }
      } catch(e) { cb.checked = !intended; }
    };
    scheduleDebugExpiry(${settings.dailySummaryDebug && settings.dailySummaryDebugEnabledAt ? `"${settings.dailySummaryDebugEnabledAt}"` : 'null'});
    function openRestoreModal(type, n, count, date) {
      var modal = document.getElementById('restore-modal');
      if (!modal) return;
      document.getElementById('restore-modal-title').textContent = type === 'auto' ? 'Restore Pre-Reset Backup' : 'Restore Backup #' + n;
      document.getElementById('restore-modal-body').textContent = count + ' senders from ' + date + '. Choose how to restore:';
      var action = type === 'auto' ? '/settings/restore-blocklist-backup' : '/settings/restore-named-backup';
      document.getElementById('restore-form-replace').action = action;
      document.getElementById('restore-form-merge').action = action;
      document.getElementById('restore-n').value = n;
      document.getElementById('restore-n-merge').value = n;
      modal.style.display = 'flex';
    }
    function closeRestoreModal() {
      var modal = document.getElementById('restore-modal');
      if (modal) modal.style.display = 'none';
    }
    var _rm = document.getElementById('restore-modal');
    if (_rm) _rm.addEventListener('click', function(e) { if (e.target === this) closeRestoreModal(); });`;

  return { body, script };
}

// ─── Rules page ────────────────────────────────────────────────────────────────
export function rulesPage(rules) {
  const nav = sidebar({ active: 'rules' });
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const ruleCards = rules.length
    ? rules.map(r => {
        const enabled = r.enabled !== false;
        const senderLines = (r.senders || []).map(s => `<div class="rule-chip">${esc(s)}</div>`).join('');
        const subjectLines = (r.subjects || []).map(s => `<div class="rule-chip rule-chip-subject">${esc(s)}</div>`).join('');
        const skipBadge = r.skipInbox ? `<span class="badge-skip">skip inbox</span>` : '';
        const enabledBadge = enabled
          ? `<span class="badge-enabled">active</span>`
          : `<span class="badge-disabled">disabled</span>`;
        const rid = esc(r.id);
        const sendersVal = esc((r.senders || []).join('\n'));
        const subjectsVal = esc((r.subjects || []).join('\n'));
        return `<div class="card" style="margin-bottom:12px;${enabled ? '' : 'opacity:.6'}">
          <div id="view-${rid}">
            <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-weight:600;color:#1e293b">${esc(r.name || r.label)}</span>
                <span class="badge-label">${esc(r.label)}</span>
                ${skipBadge}
                ${enabledBadge}
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn" type="button" onclick="ruleEditOpen('${rid}')" style="padding:4px 10px;font-size:.8rem;background:#f1f5f9;color:#475569">Edit</button>
                <form method="POST" action="/rules/toggle" style="margin:0">
                  <input type="hidden" name="id" value="${rid}"/>
                  <button class="btn" type="submit" style="padding:4px 10px;font-size:.8rem;background:${enabled ? '#f1f5f9' : '#dcfce7'};color:${enabled ? '#475569' : '#166534'}">${enabled ? 'Disable' : 'Enable'}</button>
                </form>
                <form method="POST" action="/rules/delete" style="margin:0">
                  <input type="hidden" name="id" value="${rid}"/>
                  <button class="btn btn-danger" type="submit" style="padding:4px 10px;font-size:.8rem">Delete</button>
                </form>
              </div>
            </div>
            <div style="padding:10px 18px 12px">
              ${senderLines ? `<div style="margin-bottom:6px"><span class="rule-section-label">Senders</span><div class="rule-chips">${senderLines}</div></div>` : ''}
              ${subjectLines ? `<div><span class="rule-section-label">Subject keywords</span><div class="rule-chips">${subjectLines}</div></div>` : ''}
              ${!senderLines && !subjectLines ? `<div style="color:#94a3b8;font-size:.85rem;font-style:italic">No conditions — rule will not run</div>` : ''}
            </div>
          </div>
          <div id="edit-${rid}" style="display:none;padding:16px 18px">
            <form method="POST" action="/rules/edit">
              <input type="hidden" name="id" value="${rid}"/>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                <div>
                  <label class="form-label">Name</label>
                  <input class="form-input" type="text" name="name" value="${esc(r.name || '')}"/>
                </div>
                <div>
                  <label class="form-label">Label</label>
                  <input class="form-input" type="text" name="label" value="${esc(r.label)}" required/>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                <div>
                  <label class="form-label">Senders <span style="color:#94a3b8;font-size:.78rem">(one per line)</span></label>
                  <textarea class="form-input" name="senders" rows="4">${sendersVal}</textarea>
                </div>
                <div>
                  <label class="form-label">Subject keywords <span style="color:#94a3b8;font-size:.78rem">(one per line, optional)</span></label>
                  <textarea class="form-input" name="subjects" rows="4">${subjectsVal}</textarea>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:16px">
                <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;color:#374151;cursor:pointer">
                  <input type="checkbox" name="skipInbox"${r.skipInbox ? ' checked' : ''}/> Skip Inbox
                </label>
                <button class="btn btn-primary" type="submit" style="padding:5px 14px">Save</button>
                <button class="btn" type="button" onclick="ruleEditClose('${rid}')" style="padding:5px 12px;background:#f1f5f9;color:#475569">Cancel</button>
              </div>
            </form>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty" style="margin-bottom:16px">No rules yet. Add one below.</div>`;

  const addForm = `<div class="card" style="margin-bottom:12px">
    <div class="card-header" style="cursor:pointer;user-select:none" onclick="var f=document.getElementById('add-rule-form');f.style.display=f.style.display==='none'?'block':'none';this.querySelector('.add-rule-toggle').textContent=f.style.display==='none'?'▶  Add Rule':'▼  Add Rule'">
      <span class="add-rule-toggle">▶  Add Rule</span>
    </div>
    <div id="add-rule-form" style="display:none;padding:16px 18px">
      <form method="POST" action="/rules/add">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="form-label">Name <span style="color:#94a3b8;font-size:.78rem">(description, optional)</span></label>
            <input class="form-input" type="text" name="name" placeholder="e.g. Food newsletters"/>
          </div>
          <div>
            <label class="form-label">Label <span style="color:#94a3b8;font-size:.78rem">(required — creates if needed)</span></label>
            <input class="form-input" type="text" name="label" placeholder="e.g. P/Food Stuff" required/>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="form-label">Senders <span style="color:#94a3b8;font-size:.78rem">(one per line, @domain.com supported)</span></label>
            <textarea class="form-input" name="senders" rows="4" placeholder="newsletter@example.com&#10;@foodnetwork.com"></textarea>
          </div>
          <div>
            <label class="form-label">Subject keywords <span style="color:#94a3b8;font-size:.78rem">(one per line, optional)</span></label>
            <textarea class="form-input" name="subjects" rows="4" placeholder="Weekly Digest&#10;Large Purchase Approved"></textarea>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:16px">
          <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;color:#374151;cursor:pointer">
            <input type="checkbox" name="skipInbox"/> Skip Inbox (archive to label)
          </label>
          <button class="btn btn-primary" type="submit">Save Rule</button>
        </div>
      </form>
    </div>
  </div>`;

  const body = `<div class="app-layout">
    ${nav}
    <div class="main-content">
      <div class="main-topbar"><span>Rules</span></div>
      <div class="main-scroll" style="padding:20px 24px;max-width:860px">
        <p style="font-size:.85rem;color:#64748b;margin:0 0 16px">Rules apply custom Gmail labels based on sender and/or subject. They run during triage and scheduled scans.</p>
        ${ruleCards}
        ${addForm}
      </div>
    </div>
  </div>
  <style>
    .badge-label{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600;background:#e0e7ff;color:#4f46e5}
    .badge-skip{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600;background:#fef3c7;color:#92400e}
    .badge-enabled{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600;background:#dcfce7;color:#166534}
    .badge-disabled{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:600;background:#f1f5f9;color:#94a3b8}
    .rule-section-label{display:block;font-size:.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
    .rule-chips{display:flex;flex-wrap:wrap;gap:6px}
    .rule-chip{display:inline-block;padding:2px 10px;border-radius:10px;font-size:.8rem;background:#f1f5f9;color:#334155;font-family:monospace}
    .rule-chip-subject{background:#fef9c3;color:#713f12}
    .form-label{display:block;font-size:.82rem;font-weight:500;color:#374151;margin-bottom:4px}
    .form-input{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.85rem;font-family:inherit}
    .form-input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.15)}
  </style>`;

  const script = `
    function ruleEditOpen(id) {
      document.getElementById('view-' + id).style.display = 'none';
      document.getElementById('edit-' + id).style.display = 'block';
    }
    function ruleEditClose(id) {
      document.getElementById('edit-' + id).style.display = 'none';
      document.getElementById('view-' + id).style.display = 'block';
    }`;
  return { body, script };
}

// ─── Events page ───────────────────────────────────────────────────────────────
export function eventsPage(events, settings) {
  const today = new Date().toISOString().slice(0, 10);
  const active = (events || []).filter(e => !e.ignored && (!e.date || e.date >= today)).sort((a, b) => (a.date||'') < (b.date||'') ? -1 : 1);
  const interests = settings.eventInterests || [];

  // Group by configured location
  const grouped = {};
  for (const e of active) {
    const key = e.configuredLocation || e.location || 'Other';
    (grouped[key] = grouped[key] || []).push(e);
  }

  const lastRun = settings.eventsSearchLastRunAt
    ? `Last searched: ${new Date(settings.eventsSearchLastRunAt).toLocaleString()}`
    : 'Never searched';

  const noInterests = !interests.length
    ? `<div class="card" style="border-left:4px solid #f59e0b;margin-bottom:20px">
        <div style="padding:16px 18px;color:#92400e">
          No event interests configured. <a href="/settings" style="color:#1d4ed8">Add some in Settings</a> to start finding events.
        </div>
      </div>` : '';

  const eventCards = active.length
    ? Object.entries(grouped).map(([loc, evs]) => `
        <div style="margin-bottom:24px">
          <h3 style="font-size:.9rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">📍 ${loc}</h3>
          <ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px">
            ${evs.map(e => {
              const sourceIcon = e.source === 'email' ? '✉ ' : '';
              const titleLink = e.url
                ? `<a href="${e.url}" target="_blank" rel="noopener" style="color:#1d4ed8;text-decoration:none">${sourceIcon}${e.title} ↗</a>`
                : `${sourceIcon}${e.title}`;
              const priceRating = [
                e.pricePerPerson ? `<strong style="color:#16a34a;font-size:.88rem">${e.pricePerPerson} / person</strong>` : '',
                e.rating ? `<span style="font-size:.85rem">⭐ ${e.rating}</span>` : '',
              ].filter(Boolean).join(' &nbsp;&bull;&nbsp; ');
              return `
            <li class="card" style="margin:0;padding:0">
              <div style="padding:14px 18px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:.9rem;margin-bottom:4px">
                      ${titleLink}
                      <span style="font-weight:400;font-size:.78rem;color:#94a3b8"> &mdash; ${e.interest||''}</span>
                    </div>
                    ${priceRating ? `<div style="margin-bottom:5px">${priceRating}</div>` : ''}
                    <div style="font-size:.82rem;color:#374151;margin-bottom:4px">
                      📅 ${e.date||'TBD'}${e.time ? ' at ' + e.time : ''} &nbsp;|&nbsp; 📍 ${e.location||'TBD'}
                    </div>
                    ${e.description ? `<div style="font-size:.82rem;color:#6b7280">${e.description}</div>` : ''}
                    ${e.calendarEventUrl ? `<div style="margin-top:6px"><a href="${e.calendarEventUrl}" target="_blank" style="font-size:.8rem;color:#16a34a">✓ Added to Calendar</a></div>` : ''}
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                    ${e.url ? `<a href="${e.url}" target="_blank" rel="noopener" class="btn btn-secondary" style="font-size:.78rem;padding:5px 10px;text-decoration:none">Open ↗</a>` : ''}
                    ${!e.calendarEventUrl ? `<button class="btn btn-primary" style="font-size:.78rem;padding:5px 10px" onclick="toggleCalForm('${e.id}')">+ Calendar</button>` : ''}
                    <form method="POST" action="/events/ignore" style="margin:0">
                      <input type="hidden" name="id" value="${e.id}">
                      <button class="btn btn-danger" style="font-size:.78rem;padding:5px 10px;width:100%" type="submit">Ignore</button>
                    </form>
                  </div>
                </div>
                <div id="cal-form-${e.id}" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9">
                  <form method="POST" action="/events/calendar" style="display:flex;flex-direction:column;gap:8px">
                    <input type="hidden" name="id" value="${e.id}">
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      <input type="text" name="title" value="${(e.title||'').replace(/"/g,'&quot;')}" placeholder="Title" style="flex:2;min-width:160px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem">
                      <input type="date" name="date" value="${e.date||''}" style="flex:1;min-width:120px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem">
                      <input type="time" name="time" value="${e.time||''}" style="flex:1;min-width:100px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem">
                    </div>
                    <input type="text" name="location" value="${(e.location||'').replace(/"/g,'&quot;')}" placeholder="Location" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem">
                    <input type="url" name="url" value="${(e.url||'').replace(/"/g,'&quot;')}" placeholder="URL (optional)" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem">
                    <textarea name="description" rows="2" placeholder="Description (optional)" style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.83rem;resize:vertical">${e.description||''}</textarea>
                    <div style="display:flex;gap:8px">
                      <button class="btn btn-primary" type="submit" style="font-size:.83rem">Add to Calendar</button>
                      <button class="btn btn-secondary" type="button" onclick="toggleCalForm('${e.id}')" style="font-size:.83rem">Cancel</button>
                    </div>
                  </form>
                </div>
              </div>
            </li>`;}).join('')}
          </ul>
        </div>`).join('')
    : `<div class="empty" style="padding:40px 0;text-align:center;color:#94a3b8">
        No upcoming events found yet.<br>
        <span style="font-size:.85rem">Use "Search Now" to find events, or enable scheduled search in Settings.</span>
      </div>`;

  const nav = sidebar({ active: 'events' });
  const body = `
    <div class="app-layout">
      ${nav}
      <div class="main-content">
        <div class="main-topbar" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="font-weight:600;font-size:.92rem">📅 Upcoming Events</span>
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:.78rem;color:#94a3b8">${lastRun}</span>
            <form method="POST" action="/events/send-email" style="margin:0">
              <button class="btn btn-secondary" type="submit" style="font-size:.82rem">Send Email</button>
            </form>
            <form method="POST" action="/events/search" style="margin:0">
              <button class="btn btn-primary" type="submit" style="font-size:.82rem">Search Now</button>
            </form>
          </div>
        </div>
        <div class="main-scroll">
          <div style="max-width:800px;margin:0 auto;padding:20px 16px">
            ${noInterests}
            ${eventCards}
          </div>
        </div>
      </div>
    </div>`;

  const script = `
    function toggleCalForm(id) {
      var el = document.getElementById('cal-form-' + id);
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }`;

  return { body, script };
}
