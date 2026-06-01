import { ensureLabel, extractName } from "./gmail.js";

// ─── OK & Clean ────────────────────────────────────────────────────────────────
// Adds sender to the OK list (caller does that) and clears EVERY message from
// this sender currently in inbox — including the one clicked — by applying
// .DelPend and removing INBOX/UNREAD. The OK-list entry governs future mail
// from this sender; current inbox state is wiped uniformly.
// Returns { cleaned: number }.
export async function keepAndClean(gmail, id, fromEmail, fromName) {
  const delPendId = await ensureLabel(gmail, ".DelPend");

  // Collect every message from this sender in inbox (excluding VIP)
  const ids = [];
  let pageToken = null;
  do {
    const params = { userId: "me", q: `from:"${fromEmail}" in:inbox -label:..VIP`, maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const result = await gmail.users.messages.list(params);
    for (const m of result.data.messages || []) {
      if (fromName) {
        const dh = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From"] });
        const fh = dh.data.payload.headers.find(h => h.name === "From")?.value || "";
        if (extractName(fh) !== fromName) continue;
      }
      ids.push(m.id);
    }
    pageToken = result.data.nextPageToken || null;
  } while (pageToken);

  // Safety: ensure the clicked message is included even if Gmail's list query
  // hasn't surfaced it yet (label propagation lag).
  if (id && !ids.includes(id)) ids.push(id);

  // Batch-apply .DelPend, remove INBOX + UNREAD (true archive)
  for (let i = 0; i < ids.length; i += 1000) {
    try {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [delPendId], removeLabelIds: ["INBOX", "UNREAD"] },
      });
    } catch(e) { console.error("keep-clean batchModify FAILED:", e.message); }
  }

  return { cleaned: ids.length };
}
