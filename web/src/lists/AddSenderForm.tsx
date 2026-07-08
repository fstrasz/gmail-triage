import { useState, type FormEvent } from 'react'
import type { ListName } from './listsApi.ts'
import { useAddSender } from './listsQueries.ts'

const INPUT = 'rounded-lg border border-hairline px-2 py-1 text-sm text-ink'

export function AddSenderForm() {
  const addSender = useAddSender()
  const [list, setList] = useState<ListName>('vip')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    addSender.mutate(
      {
        list,
        email: trimmed,
        name: name.trim() || undefined,
        reason: list === 'blocklist' ? reason.trim() || undefined : undefined,
      },
      {
        onSuccess: () => {
          setEmail('')
          setName('')
          setReason('')
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border border-hairline p-3">
      <label className="flex flex-col text-xs text-muted">
        List
        <select
          aria-label="List"
          value={list}
          onChange={(e) => setList(e.target.value as ListName)}
          className={INPUT}
        >
          <option value="vip">VIP</option>
          <option value="ok">OK</option>
          <option value="blocklist">Blocklist</option>
        </select>
      </label>
      <label className="flex flex-1 flex-col text-xs text-muted">
        Email
        {/* type="text" (not "email"): domain-wildcard entries like "@mail.anthropic.com"
            are a first-class feature (backend matches a whole domain), but the native
            type="email" validation rejects a leading-"@" value with no local part. */}
        <input aria-label="Email" type="text" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
      </label>
      <label className="flex flex-1 flex-col text-xs text-muted">
        Name
        <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
      </label>
      {list === 'blocklist' && (
        <label className="flex flex-1 flex-col text-xs text-muted">
          Reason
          <input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} />
        </label>
      )}
      <button
        type="submit"
        disabled={addSender.isPending}
        className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        Add
      </button>
    </form>
  )
}
