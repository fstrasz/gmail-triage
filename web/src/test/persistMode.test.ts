import { describe, test, expect, beforeEach } from 'vitest'
import { loadMode, saveMode } from '../lib/persistMode.ts'

describe('persistMode (triage Hide-VIP/OK toggle persistence, #28)', () => {
  beforeEach(() => localStorage.clear())

  test('defaults to hidden (filter ON) when nothing is stored', () => {
    expect(loadMode()).toBe('hidden')
  })

  test('reads a stored "shown" preference', () => {
    localStorage.setItem('triageMode', 'shown')
    expect(loadMode()).toBe('shown')
  })

  test('round-trips via saveMode', () => {
    saveMode('shown')
    expect(loadMode()).toBe('shown')
    saveMode('hidden')
    expect(loadMode()).toBe('hidden')
  })

  test('falls back to hidden for an unknown stored value', () => {
    localStorage.setItem('triageMode', 'garbage')
    expect(loadMode()).toBe('hidden')
  })
})
