import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Dashboard } from '../Dashboard.jsx'
import { InvoiceProvider } from '../../contexts/InvoiceContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'

vi.mock('../../secure-storage.js', () => ({
  setSecret: vi.fn(),
  getSecret: vi.fn(() => Promise.resolve(null)),
  migrateKeysFromLocalStorage: vi.fn(() => Promise.resolve()),
}))

function TestDashboard() {
  return <Dashboard onQuickAddContact={vi.fn()} />
}

function renderDashboard() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <InvoiceProvider onOpenEditor={vi.fn()}>
          <TestDashboard />
        </InvoiceProvider>
      </ToastProvider>
    </SettingsProvider>,
  )
}

describe('Dashboard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders without crashing with empty invoices', () => {
    renderDashboard()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('No invoices yet.')).toBeInTheDocument()
  })

  it('renders stat cards and recent activity section', () => {
    renderDashboard()
    expect(screen.getAllByText('Total Revenue').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Outstanding')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
  })
})
