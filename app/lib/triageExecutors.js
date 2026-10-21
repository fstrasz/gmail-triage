// Per-action Gmail work behind POST /api/triage/action and /api/triage/undo.
// Extracted from the route so a background worker can run the same code. The route
// keeps its guard pre-flights; everything here assumes the action is already cleared
// to run.
import { appendLog } from "./activityLog.js";
import {
  addToBlocklist,
  isBlocked,
  removeFromBlocklist,
} from "./blocklist.js";
import { analyzeEmail } from "./claude.js";
import {
  archiveAllFromSender,
  archiveMessage,
  archiveThread,
  blockSender,
  ensureLabel,
  deleteAllFromSender,
  labelSender,
  trashMessage,
  untrashMessage,
} from "./gmail.js";
import { keepAndClean } from "./keepClean.js";
import { addToOklist, isOklisted, removeFromOklist } from "./oklist.js";
import { addToReview } from "./review.js";
import { addToStats } from "./stats.js";
import { ACTION_DISPATCH } from "./triageApi.js";
import { tryUnsubscribe } from "./unsub.js";
import {
  addToViplist,
  isViplisted,
  removeFromViplist,
} from "./viplist.js";

export function findPart(part, mimeType) {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part.body.data;
  if (part.parts) {
    for (const p of part.parts) {
      const f = findPart(p, mimeType);
      if (f) return f;
    }
  }
  return null;
}

// ─── Auth error classifier ──────────────────────────────────────────────────────
export function isAuthError(e) {
  return e?.response?.status === 401 || /invalid_grant/i.test(e?.message || "");
}

// job: { action, msgId, threadId, fromEmail, fromName, subject, unsubUrl, unsubPost, unsubDone }
// Resolves to { labeled, undo, result } — `result` carries the action-specific extras
// (unsubResult / openTab / openTabUrl / analysis) the route spreads into its response.
export async function executeTriageAction(
  gmail,
  job,
  { onProgress = null, markUnsubDone = null } = {},
) {
  const { action, msgId, threadId, fromEmail, subject, unsubUrl, unsubPost } =
    job;
  const name = job.fromName || null;
  const undoBase = {
    action,
    id: msgId,
    threadId: threadId || null,
    fromEmail,
    fromName: name,
  };

  if (action === "ok" || action === "vip") {
    const isVip = action === "vip";
    const alreadyListed = isVip
      ? isViplisted(fromEmail, name)
      : isOklisted(fromEmail, name);
    let labeled = 0;
    if (!alreadyListed) {
      if (isVip) addToViplist(fromEmail, name);
      else addToOklist(fromEmail, name);
      labeled = await labelSender(
        gmail,
        isVip ? "..VIP" : "..OK",
        fromEmail,
        name,
        [],
        onProgress,
      );
      addToStats({ [isVip ? "vip" : "ok"]: labeled });
    } else {
      const r = await gmail.users.messages.list({
        userId: "me",
        q: `from:${fromEmail} in:inbox -in:sent -in:trash`,
        maxResults: 500,
      });
      labeled = (r.data.messages || []).length;
    }
    if (msgId)
      await gmail.users.messages.modify({
        userId: "me",
        id: msgId,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: labeled,
    });
    return {
      labeled,
      undo: {
        ...undoBase,
        addedToList: !alreadyListed,
        listName: isVip ? "vip" : "ok",
      },
      result: {},
    };
  }

  if (action === "ok-clean" || action === "vip-clean") {
    const isVip = action === "vip-clean";
    const alreadyListed = isVip
      ? isViplisted(fromEmail, name)
      : isOklisted(fromEmail, name);
    const { cleaned } = await keepAndClean(
      gmail,
      msgId,
      fromEmail,
      name,
      onProgress,
    );
    if (isVip) addToViplist(fromEmail, name);
    else addToOklist(fromEmail, name);
    addToStats({ cleaned });
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: cleaned,
    });
    return {
      labeled: cleaned,
      undo: {
        ...undoBase,
        addedToList: !alreadyListed,
        listName: isVip ? "vip" : "ok",
      },
      result: {},
    };
  }

  if (action === "junk") {
    const alreadyListed = !!isBlocked(fromEmail, name);
    addToBlocklist(fromEmail, "junk", name);
    const moved = await blockSender(gmail, fromEmail, name, null, onProgress);
    addToStats({ junked: moved });
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: moved,
    });
    return {
      labeled: moved,
      undo: {
        ...undoBase,
        addedToList: !alreadyListed,
        listName: "blocklist",
      },
      result: {},
    };
  }

  if (action === "delete-all" || action === "archive-all") {
    const moved =
      action === "delete-all"
        ? await deleteAllFromSender(gmail, fromEmail, onProgress)
        : await archiveAllFromSender(gmail, fromEmail, onProgress);
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: moved,
    });
    return {
      labeled: moved,
      undo: { ...undoBase, addedToList: false },
      result: {},
    };
  }

  if (action === "unsub") {
    const alreadyListed = !!isBlocked(fromEmail, name);
    let result;
    let openTab;
    let openTabUrl;
    if (job.unsubDone) {
      // Recovered job: the unsubscribe already went out before the interruption.
      result = "skipped-recovered";
    } else {
      ({ result, openTab, openTabUrl } = await tryUnsubscribe(
        gmail,
        unsubUrl,
        unsubPost,
        fromEmail,
      ));
      if (markUnsubDone) await markUnsubDone();
    }
    addToBlocklist(fromEmail, "unsub", name);
    const moved = await blockSender(gmail, fromEmail, name, null, onProgress);
    addToStats({ junked: moved, unsubbed: 1 });
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: moved,
      unsubResult: result,
    });
    return {
      labeled: moved,
      undo: {
        ...undoBase,
        addedToList: !alreadyListed,
        listName: "blocklist",
      },
      result: { unsubResult: result, openTab, openTabUrl },
    };
  }

  if (action === "archive") {
    // A thread archive's message count is not known here, so `labeled` is
    // reported only for the single-message path.
    onProgress?.({ total: 1 });
    if (threadId) await archiveThread(gmail, threadId);
    else await archiveMessage(gmail, msgId);
    onProgress?.({ processed: 1 });
    appendLog({ type: "triage", action, msgId });
    return {
      labeled: threadId ? undefined : 1,
      undo: { ...undoBase, addedToList: false },
      result: {},
    };
  }

  if (action === "delete") {
    onProgress?.({ total: 1 });
    await trashMessage(gmail, msgId);
    onProgress?.({ processed: 1 });
    appendLog({ type: "triage", action, msgId });
    return {
      labeled: 1,
      undo: { ...undoBase, addedToList: false },
      result: {},
    };
  }

  if (action === "review") {
    onProgress?.({ total: 1 });
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: msgId,
      format: "full",
    });
    const headers = msg.data.payload.headers;
    const g = (n) => headers.find((x) => x.name === n)?.value || "";
    const plainRaw =
      findPart(msg.data.payload, "text/plain") ||
      findPart(msg.data.payload, "text/html");
    const body = plainRaw
      ? Buffer.from(plainRaw, "base64url")
          .toString("utf8")
          .replace(/<[^>]+>/g, " ")
      : "";
    const from = g("From");
    const analysis = await analyzeEmail(subject || g("Subject"), from, body);
    const item = {
      id: msgId,
      subject: subject || g("Subject"),
      from,
      date: g("Date"),
      analysis,
      status: "pending",
      analyzedAt: new Date().toISOString(),
    };
    addToReview(item);
    const labelId = await ensureLabel(gmail, "For_Review");
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: { ids: [msgId], addLabelIds: [labelId] },
    });
    onProgress?.({ processed: 1 });
    return {
      labeled: 1,
      undo: { ...undoBase, addedToList: false },
      result: { analysis },
    };
  }

  // The route validates `action` against ACTION_DISPATCH, whose eleven keys are
  // exactly the branches above — review is the last.
}

// Consumes the UndoDescriptor and applies the compensating call per
// ACTION_DISPATCH[action].undo. The bulk .DelPend from clean/junk is NOT reversed;
// undo only reverses list membership + single-message moves. The caller has already
// checked that d.action is a known action.
export async function applyTriageUndo(gmail, d) {
  const spec = ACTION_DISPATCH[d.action];
  if (spec.undo === "untrash") {
    await untrashMessage(gmail, d.id);
  } else if (spec.undo === "addInbox") {
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: { ids: [d.id], addLabelIds: ["INBOX"] },
    });
  } else if (spec.undo === "removeListEntry" || spec.undo === "listOnly") {
    // Idempotent-add guard (H2): only undo the list entry if THIS action added it.
    if (d.addedToList === true) {
      const ln = d.listName;
      if (ln === "vip") removeFromViplist(d.fromEmail, d.fromName || null);
      else if (ln === "ok") removeFromOklist(d.fromEmail, d.fromName || null);
      else if (ln === "blocklist")
        removeFromBlocklist(d.fromEmail, d.fromName || null);
    }
  }
  // spec.undo === "none" → no compensating action (unsub/review).
}
