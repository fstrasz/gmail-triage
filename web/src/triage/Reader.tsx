import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft } from "lucide-react";
import type { TriageAction, TriageEmail } from "../lib/api.ts";
import { getBodyUrl } from "../lib/api.ts";
import { ACTION_COLOR, ACTION_LABEL } from "./actionMeta.ts";
import type { Dir, Mode } from "./swipeMap.ts";
import { swipeAction, TAP_GROUPS } from "./swipeMap.ts";

const DIRS: Dir[] = ["right", "left", "up", "down"];

// Full-screen message reader for the touch deck. Reading usually ends in a
// decision, so every action the card offers is at the bottom; taking one closes
// the reader and the deck advances as usual.
export function Reader({
  email,
  mode,
  open,
  onOpenChange,
  onAction,
}: {
  email: TriageEmail;
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: TriageAction) => void;
}) {
  const actions = [
    ...DIRS.map((d) => swipeAction(mode, d)),
    ...TAP_GROUPS[mode].message,
    ...TAP_GROUPS[mode].sender,
  ];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          // Keep input here from acting on the card underneath: the triage page
          // listens for shortcut keys on the document, and React bubbles portal
          // events to the deck's swipe handler.
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed inset-0 z-50 flex flex-col bg-desk text-ink"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-rule px-2 py-1.5">
            <Dialog.Close
              aria-label="Close message"
              className="inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg pr-2 text-sm font-semibold text-ink active:bg-sunk"
            >
              <ChevronLeft aria-hidden size={20} />
              Back
            </Dialog.Close>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {email.fromName ?? email.fromEmail ?? "Unknown sender"}
              </p>
              <Dialog.Title className="truncate text-xs text-muted">
                {email.subject || "(no subject)"}
              </Dialog.Title>
            </div>
          </div>

          {/* Body — sandboxed iframe ONLY (FIX H4, XSS). Never dangerouslySetInnerHTML. */}
          <iframe
            title="Email body"
            sandbox="allow-popups"
            src={getBodyUrl(email.id)}
            className="min-h-0 w-full flex-1 bg-white"
          />

          <div className="grid shrink-0 grid-cols-4 gap-1.5 border-t border-rule p-2">
            {actions.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={ACTION_LABEL[a]}
                className={`min-h-11 rounded-xl border border-rule-strong bg-paper px-1 text-[0.8125rem] font-bold leading-tight active:bg-sunk ${ACTION_COLOR[a]}`}
                onClick={() => {
                  onOpenChange(false);
                  onAction(a);
                }}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
