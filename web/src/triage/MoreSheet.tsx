import * as Dialog from "@radix-ui/react-dialog";
import type { TriageAction } from "../lib/api.ts";
import { dialogOverlay, label } from "../shell/ui.ts";
import { ACTION_COLOR, ACTION_LABEL } from "./actionMeta.ts";

// The full overflow sheet. Holds every action NOT in the primary button row,
// so button-row ∪ More = all nine actions (DECK-3). Each row is a labeled
// menuitem reachable without a gesture, on every breakpoint.
export function MoreSheet({
  actions,
  open,
  onOpenChange,
  onPick,
}: {
  actions: TriageAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (action: TriageAction) => void;
}) {
  const isSenderWide = (a: TriageAction) =>
    a === "delete-all" || a === "archive-all";
  const general = actions.filter((a) => !isSenderWide(a));
  const senderWide = actions.filter(isSenderWide);
  const item = (a: TriageAction) => (
    <button
      key={a}
      type="button"
      role="menuitem"
      aria-label={ACTION_LABEL[a]}
      className={`flex min-h-12 items-center justify-between rounded-lg px-3 text-left text-base font-semibold ${ACTION_COLOR[a]} hover:bg-sunk active:bg-sunk`}
      onClick={() => {
        onPick(a);
        onOpenChange(false);
      }}
    >
      {ACTION_LABEL[a]}
    </button>
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlay} />
        <Dialog.Content
          aria-label="More actions"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto w-[min(28rem,100vw)] rounded-t-2xl border border-b-0 border-rule bg-paper p-3 text-ink shadow-float"
          style={{
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          }}
        >
          <div
            aria-hidden
            className="mx-auto mb-2 h-1 w-10 rounded-full bg-rule-strong"
          />
          <Dialog.Title className="title-hand px-3 pb-1 pt-1 text-base font-semibold text-ink">
            More actions
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            All remaining triage actions for the top card.
          </Dialog.Description>
          <div role="menu" className="flex flex-col">
            {general.map(item)}
            {senderWide.length > 0 && (
              <>
                <hr className="my-2 border-dashed border-rule-strong" />
                <p className={`px-3 pb-1 ${label}`}>All from this sender</p>
                {senderWide.map(item)}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
