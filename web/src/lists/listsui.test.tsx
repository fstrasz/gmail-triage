import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ListsResponse } from './listsApi.ts'

// ---------------------------------------------------------------------------
// Mock the feature's query hooks so ListsPage renders without a backend.
// (ReapplyBar talks to listsApi directly, so the guard-flow test stubs fetch.)
// ---------------------------------------------------------------------------

const addMutate = vi.fn()
const removeMutate = vi.fn()
const resetMutate = vi.fn()
const backupMutate = vi.fn()
const ruleAddMutate = vi.fn()
const ruleUpdateMutate = vi.fn()
const ruleToggleMutate = vi.fn()
const ruleDeleteMutate = vi.fn()

interface ListsState {
  data: ListsResponse | undefined
  isPending: boolean
  isError: boolean
}

const state: { lists: ListsState } = {
  lists: { data: undefined, isPending: false, isError: false },
}

function mut(mutate: ReturnType<typeof vi.fn>) {
  return { mutate, isPending: false }
}

vi.mock('./listsQueries.ts', () => ({
  useLists: () => state.lists,
  useAddSender: () => mut(addMutate),
  useRemoveSender: () => mut(removeMutate),
  useResetBlocklist: () => mut(resetMutate),
  useCreateBackup: () => mut(backupMutate),
  useAddRule: () => mut(ruleAddMutate),
  useUpdateRule: () => mut(ruleUpdateMutate),
  useToggleRule: () => mut(ruleToggleMutate),
  useDeleteRule: () => mut(ruleDeleteMutate),
}))

// Import AFTER the mock is registered.
import { ListsPage } from './ListsPage.tsx'

const emptyData: ListsResponse = {
  vip: [],
  oklist: [],
  blocklist: [],
  rules: [],
  backups: { single: null, named: [] },
  counts: { vip: 0, ok: 0, blocklist: 0 },
}

beforeEach(() => {
  vi.clearAllMocks()
  state.lists = { data: undefined, isPending: false, isError: false }
})

describe('ListsPage', () => {
  test('loading state shows a skeleton', () => {
    state.lists = { data: undefined, isPending: true, isError: false }
    render(<ListsPage />)
    expect(screen.getByTestId('lists-skeleton')).toBeInTheDocument()
  })

  test('error state shows Reconnect Gmail with an /auth link', () => {
    state.lists = { data: undefined, isPending: false, isError: true }
    render(<ListsPage />)
    expect(screen.getByText(/reconnect gmail/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /reconnect/i }).getAttribute('href')).toBe('/auth')
  })

  test('empty state when no senders on any list', () => {
    state.lists = { data: emptyData, isPending: false, isError: false }
    render(<ListsPage />)
    expect(screen.getByTestId('lists-empty')).toBeInTheDocument()
  })

  test('renders a merged row with both VIP and Block remove controls', () => {
    state.lists = {
      data: {
        ...emptyData,
        vip: [{ email: 'a@x.com', name: 'Al', date: '2026-01-01' }],
        blocklist: [{ email: 'a@x.com', name: 'Al', reason: 'spam', date: '2026-01-02' }],
      },
      isPending: false,
      isError: false,
    }
    render(<ListsPage />)
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove .* from VIP/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove .* from Block/i })).toBeInTheDocument()
  })

  test('clicking a badge remove calls removeSender name-scoped', () => {
    state.lists = {
      data: { ...emptyData, vip: [{ email: 'a@x.com', name: 'Al', date: '' }] },
      isPending: false,
      isError: false,
    }
    render(<ListsPage />)
    fireEvent.click(screen.getByRole('button', { name: /remove .* from VIP/i }))
    expect(removeMutate).toHaveBeenCalledWith({ list: 'vip', email: 'a@x.com', name: 'Al' })
  })

  test('Add-sender form submit calls addSender.mutate with the entered fields', () => {
    state.lists = { data: emptyData, isPending: false, isError: false }
    render(<ListsPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.com' } })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(addMutate).toHaveBeenCalledTimes(1)
    expect(addMutate.mock.calls[0][0]).toMatchObject({ list: 'vip', email: 'new@x.com', name: 'New' })
  })

  test('reapply guard flow: clicking a reapply button opens the guard dialog', async () => {
    state.lists = { data: emptyData, isPending: false, isError: false }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ ok: false, guard: true, count: 300, message: 'This will reapply ~300' }),
    } as unknown as Response)

    render(<ListsPage />)
    fireEvent.click(screen.getByRole('button', { name: /^VIP$/ }))
    expect(await screen.findByText(/this will reapply ~300/i)).toBeInTheDocument()
  })
})
