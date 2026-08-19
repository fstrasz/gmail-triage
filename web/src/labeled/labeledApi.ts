// ---------------------------------------------------------------------------
// Labeled feature — typed fetch function for the read-only Labeled screen.
// Colocated per the Slice-2/3 per-feature decision: this screen owns its
// <feature>Api.ts rather than extending lib/api.ts.
// ---------------------------------------------------------------------------

export type LabeledTier = '..VIP' | '..OK' | '.DelPend'

export interface LabeledItem {
  id: string
  subject: string
  from: string
  date: string
  snippet: string
  isRead: boolean
}

export interface LabeledResponse {
  ok: true
  label: LabeledTier
  items: LabeledItem[]
}

/** GET /api/labeled?label=<tier> — up to 200 Gmail messages.get calls per
 * load. Throws on non-2xx (400 for a disallowed label, matching lib/api.ts
 * getQueue's throw-on-non-2xx convention). */
export async function getLabeled(label: LabeledTier): Promise<LabeledResponse> {
  const res = await fetch(`/api/labeled?label=${encodeURIComponent(label)}`)
  if (!res.ok) throw new Error(`getLabeled failed: ${res.status}`)
  return res.json() as Promise<LabeledResponse>
}
