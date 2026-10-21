import type { TriageAction, TriageEmail } from "../lib/api.ts";

// Client mirror of app/lib/queueScope.js `jobCoversMessage`: which deck cards a
// queued action will take care of. Both sides are checked against the same
// fixture, web/src/test/fixtures/queueScope.json — change them together.
//
// A null fromName matches every display name (the backend filters by name only
// when one is set).

const sameEmail = (a: TriageEmail, b: TriageEmail) =>
  String(a.fromEmail).toLowerCase() === String(b.fromEmail).toLowerCase();

const nameMatches = (acted: TriageEmail, other: TriageEmail) =>
  acted.fromName == null || other.fromName === acted.fromName;

function covers(
  action: TriageAction,
  acted: TriageEmail,
  other: TriageEmail,
  hideListed: boolean,
): boolean {
  const clicked = other.id === acted.id;
  switch (action) {
    case "archive":
    case "delete":
    case "review":
      return clicked;
    case "ok":
    case "vip":
      return (
        clicked ||
        (hideListed && sameEmail(acted, other) && nameMatches(acted, other))
      );
    case "ok-clean":
    case "vip-clean":
      // keepAndClean spares ..VIP mail but always includes the clicked card.
      return (
        clicked ||
        (sameEmail(acted, other) &&
          nameMatches(acted, other) &&
          other.tier !== "..VIP")
      );
    case "junk":
    case "unsub":
      return sameEmail(acted, other) && nameMatches(acted, other);
    case "delete-all":
    case "archive-all":
      return sameEmail(acted, other);
  }
}

/** Ids of the cards in `cards` the action covers; `card.id` is always first. */
export function coveredCardIds(
  action: TriageAction,
  card: TriageEmail,
  cards: TriageEmail[],
  { hideListed }: { hideListed: boolean },
): string[] {
  const others = cards
    .filter((c) => c.id !== card.id && covers(action, card, c, hideListed))
    .map((c) => c.id);
  return [card.id, ...others];
}
