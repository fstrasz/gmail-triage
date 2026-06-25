import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// A component now reads/writes localStorage (triage Hide-VIP/OK mode persistence, #28).
// Clear it after every test so persisted UI state never leaks across tests in a file
// (which would make a later test init 'shown' after an earlier one toggled it).
afterEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* no storage in this env */
  }
})
