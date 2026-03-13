import { extractEmail, extractName } from "./gmail.js";
import { loadSettings } from "./settings.js";

export function emailCard(e) {
  const fromEmail = extractEmail(e.from);
  const fromName  = extractName(e.from);
  const dateStr   = e.date ? (() => {
    const d  = new Date(e.date);
    const tz = loadSettings().timezone;
    const time = d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', timeZone: tz});
    const date = d.toLocaleDateString('en-US', {timeZone: tz});
    return `${time} ${date}`;
  })() : "";
  const subj      = (e.subject || "(no subject)").replace(/</g, "&lt;");
  const safe = s  => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const hasUnsub  = !!e.listUnsubscribe;
  const tier      = e.tier || null;

  const tierBorder = tier === "..VIP" ? "border-left:4px solid #f59e0b"
                   : tier === "..OK"  ? "border-left:4px solid #14b8a6" : "";
  const tierBadge  = tier === "..VIP"
    ? `<span style="background:#fef3c7;color:#92400e;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:6px">⭐ VIP</span>`
    : tier === "..OK"
    ? `<span style="background:#ccfbf1;color:#0f766e;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:6px">✅ OK</span>`
    : "";

  const unsubStyle = hasUnsub ? "" : ' style="opacity:.6;border:2px dashed #f59e0b"';
  const unsubTitle = hasUnsub ? "" : ' title="No List-Unsubscribe header — compose will open"';

  return `
    <div class="email-row" id="row-${e.id}" style="${tierBorder}" data-from-email="${fromEmail}" data-unsub-url="${e.listUnsubscribe || ""}" data-unsub-post="${e.listUnsubscribePost || ""}">
      <div class="email-header">
        <div class="email-meta">
          <div class="email-from">${fromName}${tierBadge} <span style="color:#94a3b8;font-weight:400">&lt;${fromEmail}&gt;</span></div>
          <div class="email-subject">${subj}</div>
        </div>
        <div class="email-date">${dateStr}</div>
        <span class="status-tag" id="tag-${e.id}" style="display:none"></span>
      </div>
      <div class="email-actions" id="actions-${e.id}">
        <button class="btn btn-vip"        onclick="doTier('${e.id}','${safe(fromEmail)}','${safe(fromName)}','..VIP')">⭐ VIP</button>
        <button class="btn btn-ok"         onclick="doTier('${e.id}','${safe(fromEmail)}','${safe(fromName)}','..OK')">✅ OK</button>
        <button class="btn btn-keep-clean" onclick="doOkClean('${e.id}','${safe(fromEmail)}','${safe(fromName)}')">✅ OK &amp; Clean</button>
        <button class="btn btn-junk"       onclick="doJunk('${e.id}','${safe(fromEmail)}','${safe(fromName)}')">🗑 Junk</button>
        <button class="btn btn-unsub"${unsubStyle}${unsubTitle} onclick="doUnsub('${e.id}','${safe(fromEmail)}','${safe(fromName)}')">🚫 Unsub${hasUnsub ? "" : " ✉"}</button>
        <a href="/sender?email=${encodeURIComponent(fromEmail)}&name=${encodeURIComponent(fromName)}" class="btn btn-sender">👤 View All</a>
        <button class="btn btn-archive"    onclick="doArchive('${e.id}')">📥 Archive</button>
        <button class="btn btn-danger"     onclick="doDelete('${e.id}')">🗑 Delete</button>
        <button class="btn btn-review"     onclick="doReview('${e.id}','${safe(fromEmail)}','${safe(fromName)}','${safe(e.subject||"")}')">🤖 Review</button>
        <button class="btn btn-expand"     onclick="toggleSnippet('${e.id}')">▼ Preview</button>
      </div>
    </div>`;
}

export function triageEmailRow(e) {
  const fromEmail = extractEmail(e.from);
  const fromName  = extractName(e.from);
  const dateStr   = e.date ? (() => {
    const d  = new Date(e.date);
    const tz = loadSettings().timezone;
    const time = d.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', timeZone: tz});
    const date = d.toLocaleDateString('en-US', {timeZone: tz});
    return `${time} ${date}`;
  })() : "";
  const subj     = (e.subject || "(no subject)").replace(/</g, "&lt;");
  const safe = s => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const hasUnsub = !!e.listUnsubscribe;
  const tier     = e.tier || null;

  const tierBorder = tier === "..VIP" ? "border-left:4px solid #f59e0b"
                   : tier === "..OK"  ? "border-left:4px solid #14b8a6" : "";
  const tierBadge  = tier === "..VIP"
    ? `<span style="background:#fef3c7;color:#92400e;font-size:.68rem;font-weight:700;padding:1px 6px;border-radius:999px;margin-left:5px">⭐ VIP</span>`
    : tier === "..OK"
    ? `<span style="background:#ccfbf1;color:#0f766e;font-size:.68rem;font-weight:700;padding:1px 6px;border-radius:999px;margin-left:5px">✅ OK</span>`
    : "";

  const unsubStyle = hasUnsub ? "" : ' style="opacity:.6;border:2px dashed #f59e0b"';
  const unsubTitle = hasUnsub ? "" : ' title="No List-Unsubscribe header"';

  return `
    <div class="triage-row" id="row-${e.id}" style="${tierBorder}" data-from-email="${fromEmail}" data-unsub-url="${e.listUnsubscribe || ""}" data-unsub-post="${e.listUnsubscribePost || ""}">
      <div class="triage-header" onclick="openPreview('${e.id}')">
        <div class="triage-meta">
          <div class="triage-from">${fromName}${tierBadge} <span style="color:#94a3b8;font-weight:400;font-size:.78rem">&lt;${fromEmail}&gt;</span></div>
          <div class="triage-subj">${subj}</div>
        </div>
        <div class="triage-date">${dateStr}</div>
        <span class="status-tag" id="tag-${e.id}" style="display:none"></span>
      </div>
      <div class="triage-actions" id="actions-${e.id}">
        <button class="btn btn-vip"        onclick="doTier('${e.id}','${safe(fromEmail)}','${safe(fromName)}','..VIP')">⭐ VIP</button>
        <button class="btn btn-ok"         onclick="doTier('${e.id}','${safe(fromEmail)}','${safe(fromName)}','..OK')">✅ OK</button>
        <button class="btn btn-keep-clean" onclick="doOkClean('${e.id}','${safe(fromEmail)}','${safe(fromName)}')">✅ OK &amp; Clean</button>
        <button class="btn btn-junk"       onclick="doJunk('${e.id}','${safe(fromEmail)}','${safe(fromName)}')">🗑 Junk</button>
        <button class="btn btn-unsub"${unsubStyle}${unsubTitle} onclick="doUnsub('${e.id}','${safe(fromEmail)}','${safe(fromName)}')">🚫 Unsub${hasUnsub ? "" : " ✉"}</button>
        <a href="/sender?email=${encodeURIComponent(fromEmail)}&name=${encodeURIComponent(fromName)}" class="btn btn-sender">👤 View All</a>
        <button class="btn btn-archive"    onclick="doArchive('${e.id}')">📥 Archive</button>
        <button class="btn btn-danger"     onclick="doDelete('${e.id}')">🗑 Delete</button>
        <button class="btn btn-review"     onclick="doReview('${e.id}','${safe(fromEmail)}','${safe(fromName)}','${safe(e.subject||"")}')">🤖 Review</button>
        <button class="btn btn-expand"     onclick="openPreview('${e.id}')">▼ Preview</button>
      </div>
    </div>`;
}

export function shell(title, body, script = "") {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;overflow:hidden}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b}
    .topbar{background:#1e293b;color:#fff;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;position:relative;z-index:100}
    .topbar h1{font-size:1rem;font-weight:700}
    .topbar-right{display:flex;align-items:center;gap:12px;font-size:.85rem}
    .counter{background:#4f46e5;color:#fff;padding:4px 12px;border-radius:999px;font-size:.8rem;font-weight:600}
    .btn-nav{color:#fff;text-decoration:none;background:#334155;padding:6px 14px;border-radius:8px;font-size:.82rem;font-weight:600}
    .btn-nav:hover{background:#475569}
    .layout{position:fixed;top:53px;left:0;right:0;bottom:0;display:flex}
    .email-panel{flex:none;overflow-y:auto;padding:16px;box-sizing:border-box;height:100%}
    .preview-panel{flex:1;height:100%;background:#fff;border-left:2px solid #e2e8f0;overflow:hidden;display:none;flex-direction:column}
    .preview-panel.open{display:flex}
    .preview-header{padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:.85rem;font-weight:600;color:#475569;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
    .preview-close{background:none;border:none;cursor:pointer;font-size:1rem;color:#94a3b8;padding:0 4px}.preview-close:hover{color:#1e293b}
    .preview-iframe{flex:1;border:none;width:100%;height:100%}
    .email-row{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;overflow:hidden}
    .email-row.done{opacity:.35;pointer-events:none}
    .email-row.preview-active{background:#f0f9ff;border-color:#93c5fd}
    .email-row.junked{border-left:4px solid #ef4444!important}
    .email-row.unsubbed{border-left:4px solid #f59e0b!important}
    .email-row.r-kept{border-left:4px solid #22c55e!important}
    .email-row.r-vip{border-left:4px solid #f59e0b!important}
    .email-row.r-ok{border-left:4px solid #14b8a6!important}
    .email-row.r-archived{border-left:4px solid #6366f1!important}
    .email-header{padding:14px 16px;display:flex;align-items:flex-start;gap:12px}
    .email-meta{flex:1;min-width:0}
    .email-from{font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .email-subject{font-size:.85rem;color:#475569;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .email-date{font-size:.75rem;color:#94a3b8;white-space:nowrap;margin-left:8px}
    .email-actions{display:flex;gap:6px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid #f1f5f9;background:#f8fafc}
    .btn{padding:7px 14px;border-radius:8px;border:none;font-size:.8rem;font-weight:600;cursor:pointer;transition:background .15s}
    .btn-vip{background:#fef3c7;color:#92400e}.btn-vip:hover{background:#fde68a}
    .btn-ok{background:#ccfbf1;color:#0f766e}.btn-ok:hover{background:#99f6e4}
    .btn-keep{background:#dcfce7;color:#15803d}.btn-keep:hover{background:#bbf7d0}
    .btn-keep-clean{background:#a7f3d0;color:#065f46}.btn-keep-clean:hover{background:#6ee7b7}
    .btn-junk{background:#fee2e2;color:#b91c1c}.btn-junk:hover{background:#fecaca}
    .btn-unsub{background:#fef3c7;color:#92400e}.btn-unsub:hover{background:#fde68a}
    .btn-expand{background:#f1f5f9;color:#475569;margin-left:auto}.btn-expand:hover{background:#e2e8f0}
    .btn-review{background:#f5f3ff;color:#6d28d9}.btn-review:hover{background:#ede9fe}
    .btn-sender{background:#f0f9ff;color:#0369a1;text-decoration:none}.btn-sender:hover{background:#e0f2fe}
    .btn-archive{background:#dbeafe;color:#1e40af}.btn-archive:hover{background:#bfdbfe}
    .btn-danger{background:#ef4444;color:#fff;font-size:.75rem;padding:4px 10px}.btn-danger:hover{background:#dc2626}
    .btn-primary{background:#4f46e5;color:#fff}.btn-primary:hover{background:#4338ca}
    .status-tag{font-size:.75rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}
    .tag-junk{background:#fee2e2;color:#b91c1c}
    .tag-unsub{background:#fef3c7;color:#92400e}
    .tag-kept{background:#dcfce7;color:#15803d}
    .tag-vip{background:#fef3c7;color:#92400e}
    .tag-ok{background:#ccfbf1;color:#0f766e}
    .tag-archive{background:#dbeafe;color:#1e40af}
    .tag-working{background:#ede9fe;color:#6d28d9}
    .tag-review{background:#f5f3ff;color:#6d28d9}
    .session-stats{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .stat-item{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 16px;flex:1;min-width:80px;text-align:center}
    .stat-num{display:block;font-size:1.4rem;font-weight:700;color:#1e293b}
    .stat-num.stat-vip{color:#92400e}.stat-num.stat-ok{color:#0f766e}
    .stat-num.stat-kept{color:#15803d}.stat-num.stat-clean{color:#065f46}
    .stat-num.stat-junk{color:#b91c1c}.stat-num.stat-unsub{color:#92400e}
    .stat-label{display:block;font-size:.7rem;color:#94a3b8;margin-top:2px;font-weight:500}
    .scan-summary{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;overflow:hidden}
    .scan-header{background:#0f172a;color:#86efac;padding:12px 16px;font-weight:600;font-size:.9rem}
    .scan-row{display:flex;justify-content:space-between;align-items:center;padding:8px 16px;border-bottom:1px solid #f1f5f9;font-size:.85rem}
    .scan-row:last-child{border-bottom:none}
    .scan-badge{background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:700}
    .done-banner{background:#0f172a;color:#86efac;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px}
    .done-banner h2{font-size:1.1rem;margin-bottom:6px}
    .home-btn{display:inline-block;margin-top:14px;padding:10px 22px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:.9rem}
    .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:12px;overflow:hidden}
    .card-header{padding:14px 18px;font-weight:700;font-size:.9rem;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center}
    .bl-row{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-bottom:1px solid #f8fafc;font-size:.85rem}
    .bl-row:last-child{border-bottom:none}
    .bl-email{font-weight:600;color:#1e293b}
    .bl-meta{font-size:.75rem;color:#94a3b8;margin-top:2px}
    .bl-reason{padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:700}
    .bl-junk{background:#fee2e2;color:#b91c1c}
    .bl-unsub{background:#fef3c7;color:#92400e}
    .bl-manual{background:#ede9fe;color:#6d28d9}
    .add-form{display:flex;gap:8px;padding:14px 18px;background:#f8fafc;border-top:1px solid #f1f5f9;flex-wrap:wrap}
    .add-form input{flex:1;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;min-width:200px}
    .add-form select{padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;background:#fff}
    .empty{text-align:center;padding:32px;color:#94a3b8;font-size:.85rem}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px}
    .stats-big{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;text-align:center}
    .stats-big-num{font-size:2rem;font-weight:800;line-height:1}
    .stats-big-label{font-size:.75rem;color:#94a3b8;margin-top:6px;font-weight:500}
    .chart-wrap{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px;overflow-x:auto}
    .chart-wrap h3{font-size:.85rem;font-weight:700;color:#475569;margin-bottom:14px}
    .bar-chart{display:flex;align-items:flex-end;gap:4px;height:120px;padding-bottom:24px;position:relative}
    .bar-col{display:flex;flex-direction:column;align-items:center;flex:1;min-width:28px;position:relative}
    .bar-stack{width:100%;display:flex;flex-direction:column;justify-content:flex-end;border-radius:4px 4px 0 0;overflow:hidden}
    .bar-seg{width:100%}
    .bar-label{position:absolute;bottom:-20px;font-size:.6rem;color:#94a3b8;white-space:nowrap;transform:rotate(-35deg);transform-origin:top left;left:4px}
    .bar-tip{display:none;position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;border-radius:6px;padding:4px 8px;font-size:.7rem;white-space:nowrap;z-index:10;pointer-events:none}
    .bar-col:hover .bar-tip{display:block}
    .inbox-line{height:120px;position:relative;padding-bottom:24px}
    svg.line-chart{width:100%;height:100%}
    .top-senders{font-size:.82rem}
    .ts-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9}
    .ts-row:last-child{border-bottom:none}
    .ts-email{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .ts-badge{padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700;margin-left:8px;white-space:nowrap}
    .legend{display:flex;gap:12px;font-size:.72rem;color:#64748b;flex-wrap:wrap;margin-bottom:10px}
    .legend-dot{width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:4px;vertical-align:middle}
    .review-item{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:8px;transition:background .15s}
    .review-item:hover{background:#f8fafc}
    .review-done{opacity:.55}
    .review-detail{flex:1}
    /* ── Sidebar layout ─────────────────────────────────────── */
    .app-layout{display:flex;height:100vh;overflow:hidden}
    .sidebar{width:220px;flex-shrink:0;background:#fff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;overflow-y:auto}
    .sb-logo{padding:14px 16px;border-bottom:1px solid #e2e8f0}
    .sb-nav{padding:6px 0;flex:1}
    .sb-item{display:flex;align-items:center;gap:9px;padding:8px 16px;font-size:.84rem;color:#475569;text-decoration:none;border:none;background:none;width:100%;text-align:left;cursor:pointer;transition:background .12s}
    .sb-item:hover{background:#f1f5f9;color:#1e293b}
    .sb-active{background:#eef2ff;color:#4f46e5;font-weight:600}
    .sb-active:hover{background:#eef2ff}
    .sb-badge{background:#e2e8f0;color:#475569;font-size:.7rem;font-weight:700;padding:1px 7px;border-radius:999px;margin-left:auto}
    .sb-section{font-size:.68rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;padding:10px 16px 3px}
    .sb-divider{height:1px;background:#e2e8f0;margin:4px 8px}
    .sb-stat-block{padding:10px 16px;border-top:1px solid #e2e8f0}
    .sb-stat-row{display:flex;justify-content:space-between;align-items:center;font-size:.75rem;padding:2px 0;color:#64748b}
    .sb-stat-val{font-weight:700;color:#1e293b}
    .main-content{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;background:#f1f5f9}
    .main-topbar{background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .main-scroll{flex:1;overflow-y:auto;padding:16px}
    /* ── Triage rows (Variant B — actions always visible) ────── */
    .triage-row{background:#fff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;overflow:hidden}
    .triage-row.done{opacity:.35;pointer-events:none}
    .triage-row.preview-active{background:#f0f9ff;border-color:#93c5fd}
    .triage-row.junked{border-left:4px solid #ef4444!important}
    .triage-row.unsubbed{border-left:4px solid #f59e0b!important}
    .triage-row.r-kept{border-left:4px solid #22c55e!important}
    .triage-row.r-vip{border-left:4px solid #f59e0b!important}
    .triage-row.r-ok{border-left:4px solid #14b8a6!important}
    .triage-row.r-archived{border-left:4px solid #6366f1!important}
    .triage-header{padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:10px}
    .triage-meta{flex:1;min-width:0}
    .triage-from{font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .triage-subj{font-size:.82rem;color:#475569;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .triage-date{font-size:.72rem;color:#94a3b8;white-space:nowrap;flex-shrink:0}
    .triage-actions{display:flex;gap:5px;flex-wrap:wrap;padding:8px 14px;border-top:1px solid #f1f5f9;background:#f8fafc}
    /* ── Lists page ──────────────────────────────────────────── */
    .list-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
    .list-chip{padding:5px 14px;border-radius:999px;font-size:.8rem;font-weight:600;cursor:pointer;border:1.5px solid #e2e8f0;background:#fff;color:#475569;transition:all .12s}
    .list-chip:hover{border-color:#6366f1;color:#4f46e5}
    .list-chip-active{background:#eef2ff;border-color:#6366f1;color:#4f46e5}
    .list-search{flex:1;padding:7px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.85rem;min-width:180px;outline:none}
    .list-search:focus{border-color:#6366f1}
    .list-row{display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-bottom:1px solid #f8fafc;font-size:.85rem}
    .list-row:last-child{border-bottom:none}
    .badge-block{background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:700}
    .badge-vip{background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:700}
    .badge-ok{background:#ccfbf1;color:#0f766e;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:700}
    /* preview panel inside app-layout */
    .app-layout .preview-panel{flex:none;width:46%;min-width:340px}
  </style></head><body>${body}${script ? "<script>" + script + "<\/script>" : ""}</body></html>`;
}