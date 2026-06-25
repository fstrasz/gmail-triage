import { useRef, useState } from 'react'
import type { TriageEmail, TriageAction } from '../lib/api.ts'
import type { Mode, Dir } from './swipeMap.ts'
import { swipeAction, BUTTONS, MORE, ALL9 } from './swipeMap.ts'
import { ACTION_LABEL, ACTION_COLOR } from './actionMeta.ts'
import { useMediaQuery } from '../lib/useMediaQuery.ts'
import { Card } from './Card.tsx'
import { MoreSheet } from './MoreSheet.tsx'

const SWIPE_THRESHOLD = 80 // px before release commits a swipe

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function dragDir(dx: number, dy: number): Dir | null {
  if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

export function Deck({
  cards,
  mode,
  onAction,
  moreOpen,
  onMoreOpenChange,
}: {
  cards: TriageEmail[]
  mode: Mode
  onAction: (action: TriageAction) => void
  moreOpen: boolean
  onMoreOpenChange: (open: boolean) => void
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  // Mouse/desktop (hover + fine pointer) can't swipe → expose every action as a
  // button. Touch keeps the lean primary row + ⋯; swipes cover the rest.
  const desktop = useMediaQuery('(hover: hover) and (pointer: fine)')

  const top = cards[0]
  const peek = cards.slice(1, 3) // up to 2 peeking behind

  function onPointerDown(e: React.PointerEvent) {
    if (!top) return
    start.current = { x: e.clientX, y: e.clientY }
    setDrag({ dx: 0, dy: 0 })
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y })
  }
  function onPointerUp() {
    if (!start.current || !drag) {
      start.current = null
      setDrag(null)
      return
    }
    const dir = dragDir(drag.dx, drag.dy)
    start.current = null
    setDrag(null)
    if (dir) onAction(swipeAction(mode, dir))
  }

  const reduced = prefersReducedMotion()
  const dragStyle =
    drag && !reduced
      ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx * 0.04}deg)`, transition: 'none' }
      : undefined

  return (
    <div className="flex flex-1 flex-col">
      {/* Card stack */}
      <div className="relative mx-auto w-full max-w-md flex-1" style={{ minHeight: '22rem' }}>
        {peek
          .slice()
          .reverse()
          .map((c, i) => {
            // i counts from the furthest-back peek; depth offsets stack them.
            const depth = peek.length - i
            return (
              <div
                key={c.id}
                inert
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ transform: `scale(${1 - depth * 0.04}) translateY(${depth * 10}px)`, opacity: 0.6 }}
              >
                <Card email={c} mode={mode} />
              </div>
            )
          })}

        {top && (
          <div
            className="absolute inset-0 touch-none"
            style={dragStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <Card email={top} mode={mode} />
          </div>
        )}
      </div>

      {/* Action controls.
          Desktop (mouse, no swipe): every action as a visible button — no ⋯.
          Touch: lean primary row + ⋯ overflow; swipes cover the rest. */}
      {desktop ? (
        <div
          className="mt-4 flex flex-wrap items-center justify-center gap-2"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {ALL9.map((a) => (
            <button
              key={a}
              type="button"
              aria-label={ACTION_LABEL[a]}
              disabled={!top}
              className={`rounded-xl border border-hairline px-3 py-2 text-sm font-semibold ${ACTION_COLOR[a]} disabled:opacity-40`}
              onClick={() => onAction(a)}
            >
              {ACTION_LABEL[a]}
            </button>
          ))}
        </div>
      ) : (
        <>
          {/* Primary actions for this mode + the More trigger. */}
          <div
            className="mt-4 flex items-center justify-center gap-2"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {BUTTONS[mode].map((a) => (
              <button
                key={a}
                type="button"
                aria-label={ACTION_LABEL[a]}
                disabled={!top}
                className={`flex-1 rounded-xl border border-hairline px-3 py-3 text-sm font-semibold ${ACTION_COLOR[a]} disabled:opacity-40`}
                onClick={() => onAction(a)}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
            <button
              type="button"
              aria-label="More actions"
              disabled={!top}
              className="rounded-xl border border-hairline px-4 py-3 text-lg font-semibold text-ink disabled:opacity-40"
              onClick={() => onMoreOpenChange(true)}
            >
              ⋯
            </button>
          </div>

          <MoreSheet actions={MORE[mode]} open={moreOpen} onOpenChange={onMoreOpenChange} onPick={onAction} />
        </>
      )}
    </div>
  )
}
