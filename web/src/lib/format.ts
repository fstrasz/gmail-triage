// Compact, human dates for lists: "3:42 PM" today, "Oct 3" this year,
// "Oct 3, 2025" otherwise. Unparseable input is returned unchanged rather
// than shown as "Invalid Date".
export function shortDate(
  raw: string | null | undefined,
  now = new Date(),
): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// "Oct 6, 3:42 PM" — date and time to the minute, never seconds.
export function dateTime(raw: string | number | null | undefined): string {
  if (raw == null || raw === "") return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Event dates arrive as "YYYY-MM-DD" (calendar dates, no zone) plus an
// optional free-text time. Render "Fri, Oct 9" without shifting the day by
// the viewer's UTC offset.
export function eventDate(date: string | null | undefined): string {
  if (!date) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
