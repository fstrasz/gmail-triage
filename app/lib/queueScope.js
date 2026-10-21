// Which inbox messages a queued triage action will take care of, so covered
// cards stay out of the deck. The web app mirrors this against the same
// fixture: web/src/test/fixtures/queueScope.json.
//
// job = { action, msgId, fromEmail, fromName }
// msg = { id, fromEmail, fromName, tier }   tier: "..VIP" | "..OK" | null
//
// A null job.fromName matches every display name (labelSender / blockSender /
// keepAndClean filter by name only when one is set).

const sameEmail = (job, msg) =>
  String(job.fromEmail).toLowerCase() === String(msg.fromEmail).toLowerCase();

const nameMatches = (job, msg) =>
  job.fromName == null || msg.fromName === job.fromName;

export function jobCoversMessage(job, msg, { hideListed = false } = {}) {
  const clicked = msg.id === job.msgId;
  switch (job.action) {
    case "archive":
    case "delete":
    case "review":
      return clicked;
    case "ok":
    case "vip":
      return clicked || (hideListed && sameEmail(job, msg) && nameMatches(job, msg));
    case "ok-clean":
    case "vip-clean":
      // keepAndClean excludes ..VIP mail but always includes the clicked id.
      return (
        clicked ||
        (sameEmail(job, msg) && nameMatches(job, msg) && msg.tier !== "..VIP")
      );
    case "junk":
    case "unsub":
      return sameEmail(job, msg) && nameMatches(job, msg);
    case "delete-all":
    case "archive-all":
      return sameEmail(job, msg);
    default:
      return false;
  }
}
