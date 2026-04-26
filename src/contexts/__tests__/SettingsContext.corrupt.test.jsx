import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SettingsProvider, useSettings } from '../SettingsContext.jsx'
import { ToastProvider, useToast } from '../ToastContext.jsx'
import { logger } from '../../utils/logger.js'

const { mockGetSecret, mockMigrateKeysFromLocalStorage } = vi.hoisted(() => ({
  mockGetSecret: vi.fn(),
  mockMigrateKeysFromLocalStorage: vi.fn(),
}))

vi.mock('../../secure-storage.js', () => ({
  getSecret: mockGetSecret,
  setSecret: vi.fn(),
  migrateKeysFromLocalStorage: mockMigrateKeysFromLocalStorage,
}))

beforeEach(() => {
  localStorage.clear()
  logger.clear()
  logger.setMinLevel('error')
  mockGetSecret.mockResolvedValue('')
  mockMigrateKeysFromLocalStorage.mockResolvedValue(undefined)
})

function ToastDisplay() {
  const { toasts } = useToast()
  return (
    <>
      {toasts.map((t) => (
        <div key={t.id} data-testid="toast">
          {t.message}
        </div>
      ))}
    </>
  )
}

function renderSettingsContext() {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <div>loaded</div>
        <ToastDisplay />
      </SettingsProvider>
    </ToastProvider>,
  )
}

function GetHydrated() {
  const { settings } = useSettings()
  return <div data-testid="hydrated">{String(settings !== null)}</div>
}

describe('SettingsContext — localStorage corruption recovery', () => {
  it('falls back to DEFAULTS on corrupted sip_settings JSON', async () => {
    localStorage.setItem('sip_settings', '{broken json')
    renderSettingsContext()
    await waitFor(() => screen.getByText('loaded'))
    const stored = localStorage.getItem('sip_settings')
    expect(stored).toBeNull()
  })

  it('loads successfully from valid sip_settings', async () => {
    const valid = JSON.stringify({
      businessName: 'Test Biz',
      currency: 'USD',
      defaultTax: 15,
    })
    localStorage.setItem('sip_settings', valid)
    renderSettingsContext()
    await waitFor(() => screen.getByText('loaded'))
    const stored = JSON.parse(localStorage.getItem('sip_settings'))
    expect(stored.businessName).toBe('Test Biz')
  })

  it('handles null sip_settings without crashing', async () => {
    localStorage.setItem('sip_settings', null)
    renderSettingsContext()
    await waitFor(() => screen.getByText('loaded'))
  })

  it('handles missing sip_settings key without crashing', async () => {
    renderSettingsContext()
    await waitFor(() => screen.getByText('loaded'))
  })

  it('still calls setHydrated(true) when getSecret throws', async () => {
    mockGetSecret.mockRejectedValue(new Error('Capacitor storage unavailable'))
    render(
      <ToastProvider>
        <SettingsProvider>
          <GetHydrated />
        </SettingsProvider>
      </ToastProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'))
  })

  it('logs error and shows toast when migrateKeysFromLocalStorage throws', async () => {
    mockMigrateKeysFromLocalStorage.mockRejectedValue(new Error('migration failed'))
    renderSettingsContext()
    await waitFor(() =>
      expect(screen.getByTestId('toast')).toHaveTextContent(/settings failed to load/i),
    )
  })

  it('renders children after secure settings failure (degraded mode)', async () => {
    mockGetSecret.mockRejectedValue(new Error('storage failure'))
    renderSettingsContext()
    await waitFor(() => screen.getByText('loaded'))
    expect(screen.getByText('loaded')).toBeInTheDocument()
  })
})
