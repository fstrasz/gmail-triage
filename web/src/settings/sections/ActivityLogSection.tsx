import { Card } from '../Card.tsx'
import type { ActivityEntry } from '../settingsApi.ts'

function senderOrRule(e: ActivityEntry): string {
  if (e.type === 'rule') return e.label ? `${e.ruleName ?? ''} → ${e.label}` : e.ruleName ?? ''
  return e.senderName ?? e.sender ?? e.msgId ?? ''
}

export function ActivityLogSection({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card title="Activity Log">
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No activity recorded.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-1 pr-3 font-semibold">Time</th>
                <th className="py-1 pr-3 font-semibold">Action</th>
                <th className="py-1 pr-3 font-semibold">Sender / Rule</th>
                <th className="py-1 font-semibold">Count</th>
              </tr>
            </thead>
            <tbody className="text-ink">
              {entries.map((e, i) => (
                <tr key={`${e.ts}-${i}`} className="border-t border-hairline">
                  <td className="py-1 pr-3 text-muted">{new Date(e.ts).toLocaleString()}</td>
                  <td className="py-1 pr-3">{e.action ?? e.type}</td>
                  <td className="py-1 pr-3 truncate">{senderOrRule(e)}</td>
                  <td className="py-1">{e.count ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
