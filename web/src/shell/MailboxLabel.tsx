import { useEffect, useState } from "react";

// One container per mailbox: show which one this is on every screen.
export function MailboxLabel() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // fetch is called inside try so a missing/throwing fetch (jsdom) can never
    // escape; any failure just leaves the label hidden.
    (async () => {
      try {
        const r = await fetch("/api/mailbox");
        const d = r.ok ? await r.json() : null;
        if (live && d?.ok && typeof d.email === "string") {
          setEmail(d.email);
          document.title = `Gmail Triage · ${d.email}`;
        }
      } catch {
        // label stays hidden
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!email) return null;
  return (
    <p
      className="px-4 pt-2 text-right text-xs text-muted"
      title="Mailbox this app is acting on"
    >
      {email}
    </p>
  );
}
