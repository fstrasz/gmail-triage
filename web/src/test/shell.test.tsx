import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '../shell/AppShell.tsx'

test('shell shows five tabs, Triage current', () => {
  render(
    <MemoryRouter basename="/app" initialEntries={['/app']}>
      <AppShell />
    </MemoryRouter>
  )
  ;['Triage', 'Lists', 'Events', 'Review', 'Settings'].forEach((t) =>
    expect(screen.getByText(t)).toBeInTheDocument()
  )
  expect(screen.getByRole('link', { name: /Triage/ }).getAttribute('aria-current')).toBe('page')
})
