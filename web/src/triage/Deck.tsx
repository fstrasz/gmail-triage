import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import type { TriageAction, TriageEmail } from "../lib/api.ts";
import { Stamp } from "../shell/Stamp.tsx";
import { ACTION_COLOR, ACTION_LABEL, ACTION_TONE } from "./actionMeta.ts";
import { Card } from "./Card.tsx";
import { MoreSheet } from "./MoreSheet.tsx";
import type { Dir, Mode } from "./swipeMap.ts";
import { BUTTONS, MORE, swipeAction } from "./swipeMap.ts";

const SWIPE_THRESHOLD = 80; // px before release commits a swipe

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function dragDir(
  dx: number,
  dy: number,
  threshold = SWIPE_THRESHOLD,
): Dir | null {
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

// Touch deck: the top card swipes, the primary buttons sit in thumb reach, and
// ⋯ opens everything else. (Mouse-driven layouts use the workbench instead.)
export function Deck({
  cards,
  mode,
  onAction,
  moreOpen,
  onMoreOpenChange,
  feedback,
  footer,
}: {
  cards: TriageEmail[];
  mode: Mode;
  onAction: (action: TriageAction) => void;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  /** Action feedback + Undo, rendered above the action row. */
  feedback?: ReactNode;
  /** Rendered under the action row (Hide VIP/OK toggle). */
  footer?: ReactNode;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const top = cards[0];
  const peek = cards.slice(1, 3); // up to 2 peeking behind

  function onPointerDown(e: React.PointerEvent) {
    if (!top) return;
    // Don't start a swipe from a control on the card (Show message, links).
    if ((e.target as Element).closest("button, a, iframe")) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0 });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({
      dx: e.clientX - start.current.x,
      dy: e.clientY - start.current.y,
    });
  }
  function onPointerUp() {
    if (!start.current || !drag) {
      start.current = null;
      setDrag(null);
      return;
    }
    const dir = dragDir(drag.dx, drag.dy);
    start.current = null;
    setDrag(null);
    if (dir) onAction(swipeAction(mode, dir));
  }

  const reduced = prefersReducedMotion();
  const dragStyle =
    drag && !reduced
      ? {
          transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.04}deg)`,
          transition: "none",
        }
      : undefined;

  // Signature: while dragging, the decision the release will make is stamped
  // onto the card, inking in as the drag nears the commit threshold.
  const previewDir = drag
    ? dragDir(drag.dx, drag.dy, SWIPE_THRESHOLD / 3)
    : null;
  const previewAction = previewDir ? swipeAction(mode, previewDir) : null;
  const progress = drag
    ? Math.min(
        1,
        Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) / SWIPE_THRESHOLD,
      )
    : 0;

  return (
    <div className="flex flex-1 flex-col">
      {/* Card stack */}
      {/* The top card sits in flow and sizes to its content; the peeking
          cards are laid behind it at the same size. */}
      <div className="relative mx-auto w-full max-w-md">
        {peek
          .slice()
          .reverse()
          .map((c, i) => {
            // i counts from the furthest-back peek; depth offsets stack them.
            const depth = peek.length - i;
            return (
              <div
                key={c.id}
                inert
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  transform: `scale(${1 - depth * 0.035}) translateY(${depth * 9}px)`,
                  opacity: 1 - depth * 0.25,
                }}
              >
                <Card email={c} mode={mode} />
              </div>
            );
          })}

        {top && (
          <div
            className="relative touch-none select-none"
            style={dragStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <Card email={top} mode={mode} />
            {previewAction && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={{ opacity: 0.25 + progress * 0.75 }}
              >
                <Stamp
                  tone={ACTION_TONE[previewAction]}
                  className="-rotate-6 border-[3px] bg-paper px-4 py-2 text-xl tracking-[0.12em]"
                >
                  {ACTION_LABEL[previewAction]}
                </Stamp>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Thumb zone: feedback + Undo directly above the action row, the
          mode toggle below it. */}
      <div className="mx-auto mt-auto flex min-h-11 w-full max-w-md items-center justify-center pt-3">
        {feedback}
      </div>
      <div
        className="mx-auto w-full max-w-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Primary actions for this mode + the More trigger. */}
        <div className="flex items-stretch gap-2">
          {BUTTONS[mode].map((a) => (
            <button
              key={a}
              type="button"
              aria-label={ACTION_LABEL[a]}
              disabled={!top}
              className={`min-h-12 flex-1 rounded-xl border border-rule-strong bg-paper px-3 text-[0.9375rem] font-bold active:bg-sunk disabled:opacity-40 ${ACTION_COLOR[a]}`}
              onClick={() => onAction(a)}
            >
              {ACTION_LABEL[a]}
            </button>
          ))}
          <button
            type="button"
            aria-label="More actions"
            disabled={!top}
            className="inline-flex min-h-12 min-w-14 items-center justify-center rounded-xl border border-rule-strong bg-paper text-ink active:bg-sunk disabled:opacity-40"
            onClick={() => onMoreOpenChange(true)}
          >
            <MoreHorizontal aria-hidden size={22} />
          </button>
        </div>
        {footer && <div className="mt-3 flex justify-center">{footer}</div>}
      </div>

      <MoreSheet
        actions={MORE[mode]}
        open={moreOpen}
        onOpenChange={onMoreOpenChange}
        onPick={onAction}
      />
    </div>
  );
}
