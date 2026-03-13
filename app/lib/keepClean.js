import { ensureLabel, extractName } from "./gmail.js";

// ─── OK & Clean ────────────────────────────────────────────────────────────────
// Labels `id` as ..OK (stays in inbox), then finds all other messages from the
// same sender and labels them DelPend (stays in inbox).
// Returns { cleaned: number }.
export async function keepAndClean(gmail, id, fromEmail, fromName) {
  const okId      = await ensureLabel(gmail, "..OK");
  const delPendId = await ensureLabel(gmail, ".DelPend");

  // Label the kept message ..OK (stays in inbox, marks sender as OK)
  await gmail.users.messages.modify({
    userId: "me", id,
    requestBody: { addLabelIds: [okId], removeLabelIds: ["UNREAD"] },
  });

  // Collect all other messages from this sender
  const ids = [];
  let pageToken = null;
  do {
    const params = { userId: "me", q: "from:" + fromEmail + " -in:sent -in:trash", maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const result = await gmail.users.messages.list(params);
    for (const m of result.data.messages || []) {
      if (m.id === id) continue;
      if (fromName) {
        const dh = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From"] });
        const fh = dh.data.payload.headers.find(h => h.name === "From")?.value || "";
        if (extractName(fh) !== fromName) continue;
      }
      ids.push(m.id);
    }
    pageToken = result.data.nextPageToken || null;
  } while (pageToken);

  // Batch-move older messages to DelPend
  for (let i = 0; i < ids.length; i += 1000) {
    try {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [delPendId], removeLabelIds: ["UNREAD"] },
      });
    } catch(e) { console.error("keep-clean batchModify FAILED:", e.message); }
  }

  return { cleaned: ids.length };
}
