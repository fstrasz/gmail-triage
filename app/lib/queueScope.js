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

// Drops shaped deck emails that any snapshot job will take care of (real tier known).
export function excludeCoveredEmails(emails, jobs, { hideListed = false } = {}) {
  return emails.filter(
    (e) => !jobs.some((j) => jobCoversMessage(j, e, { hideListed })),
  );
}

// skipSender callback for fetchEmails, which asks before a message's tier is known.
// ok-clean / vip-clean are left out: their coverage depends on the tier (..VIP mail
// is spared), so a tier:null check would wrongly drop that sender's ..VIP cards;
// excludeCoveredEmails handles them afterwards.
export function makeSkipSender(jobs, { hideListed = false, baseSkip = null } = {}) {
  const early = jobs.filter(
    (j) => j.action !== "ok-clean" && j.action !== "vip-clean",
  );
  return (fromEmail, fromName) =>
    !!baseSkip?.(fromEmail, fromName) ||
    early.some((j) =>
      jobCoversMessage(
        j,
        { id: undefined, fromEmail, fromName, tier: null },
        { hideListed },
      ),
    );
}
