import { useState } from 'react'
import type { TriageEmail } from '../lib/api.ts'
import { getBodyUrl } from '../lib/api.ts'
import type { Mode, Dir } from './swipeMap.ts'
import { swipeAction } from './swipeMap.ts'
import { ACTION_LABEL, DIR_ARROW } from './actionMeta.ts'

const DIRS: Dir[] = ['right', 'left', 'up', 'down']

function senderQuery(email: TriageEmail): string {
  // Mirror the old UI's /sender reach. Prefer email, fall back to name.
  return encodeURIComponent(email.fromEmail ?? email.fromName ?? '')
}

export function Card({ email, mode }: { email: TriageEmail; mode: Mode }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex h-full flex-col rounded-2xl border border-hairline bg-white p-4 shadow-sm">
      {/* Header: sender + tier/rule badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{email.fromName ?? email.fromEmail ?? 'Unknown sender'}</p>
          {email.fromEmail && <p className="truncate text-xs text-muted">{email.fromEmail}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {email.tier === '..VIP' && <span className="rounded bg-vip px-1.5 py-0.5 text-xs font-semibold text-white">VIP</span>}
          {email.tier === '..OK' && <span className="rounded bg-ok px-1.5 py-0.5 text-xs font-semibold text-white">OK</span>}
        </div>
      </div>

      {/* Subject + snippet */}
      <p className="mt-3 font-medium text-ink">{email.subject}</p>
      {!expanded && <p className="mt-1 line-clamp-3 text-sm text-muted">{email.snippet}</p>}

      {/* Body — sandboxed iframe ONLY (FIX H4, XSS). Never dangerouslySetInnerHTML. */}
      {expanded && (
        <iframe
          title="Email body"
          sandbox="allow-popups"
          src={getBodyUrl(email.id)}
          className="mt-2 h-64 w-full flex-1 rounded-lg border border-hairline"
        />
      )}

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          aria-label={expanded ? 'Hide email body' : 'Show email body'}
          className="font-medium text-ink underline underline-offset-2"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Hide body' : 'Show body'}
        </button>
        <a
          href={`/sender?q=${senderQuery(email)}`}
          aria-label={`View all from this sender (${email.fromEmail ?? email.fromName ?? ''})`}
          className="text-muted underline underline-offset-2"
        >
          View all from this sender
        </a>
      </div>

      {/* DECK-1: persistent on-card legend of the current mode's four swipe directions. */}
      <ul aria-label="Swipe legend" className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-hairline pt-3 text-xs text-muted">
        {DIRS.map((d) => {
          const action = swipeAction(mode, d)
          return (
            <li key={d} className="flex items-center gap-1">
              <span aria-hidden className="font-mono text-ink">{DIR_ARROW[d]}</span>
              <span>{ACTION_LABEL[action]}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
