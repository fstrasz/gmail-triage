import type { ReactNode } from 'react'

/** A titled settings card. Shared shell so every section looks the same. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  )
}

/** Standard label + control row. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm text-ink">
      <span>{label}</span>
      {children}
    </label>
  )
}

const INPUT = 'rounded-lg border border-hairline px-2 py-1 text-sm text-ink'
export const inputClass = INPUT
export const numberInputClass = `${INPUT} w-20 text-right`

export const saveBtnClass =
  'mt-3 rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40'
