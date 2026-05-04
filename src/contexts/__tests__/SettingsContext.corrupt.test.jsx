import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { SettingsProvider, useSettings } from '../SettingsContext.jsx'
import { ToastProvider, ToastContext } from '../ToastContext.jsx'
import { logger } from '../../utils/logger.js'
import * as secureStorage from '../../secure-storage.js'

beforeEach(() => {
  localStorage.clear()
  logger.clear()
  logger.setMinLevel('error')
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderSettingsContext() {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <div>loaded</div>
      </SettingsProvider>
    </ToastProvider>,
  )
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
})

describe('SettingsContext — hydration race fixes', () => {
  it('always sets hydrated=true even when getSecret rejects', async () => {
    vi.spyOn(secureStorage, 'migrateKeysFromLocalStorage').mockResolvedValue(undefined)
    vi.spyOn(secureStorage, 'getSecret').mockRejectedValue(new Error('storage unavailable'))

    function HydratedConsumer() {
      const { hydrated } = useSettings()
      return <div>{hydrated ? 'hydrated' : 'loading'}</div>
    }

    render(
      <ToastProvider>
        <SettingsProvider>
          <HydratedConsumer />
        </SettingsProvider>
      </ToastProvider>,
    )

    await waitFor(() => screen.getByText('hydrated'))
  })

  it('shows error toast when secure storage hydration fails', async () => {
    vi.spyOn(secureStorage, 'migrateKeysFromLocalStorage').mockResolvedValue(undefined)
    vi.spyOn(secureStorage, 'getSecret').mockRejectedValue(new Error('storage unavailable'))

    const toastSpy = vi.fn()

    function ToastCapture({ children }) {
      return (
        <ToastContext.Provider value={{ toasts: [], toast: toastSpy, dismissToast: vi.fn() }}>
          {children}
        </ToastContext.Provider>
      )
    }

    render(
      <ToastCapture>
        <SettingsProvider>
          <div>loaded</div>
        </SettingsProvider>
      </ToastCapture>,
    )

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        'Settings failed to load — some features may be unavailable',
        'error',
      ),
    )
  })

  it('warns via logger.warn when saveSettings called before hydration completes', async () => {
    let resolveMigration
    vi.spyOn(secureStorage, 'migrateKeysFromLocalStorage').mockReturnValue(
      new Promise((res) => {
        resolveMigration = res
      }),
    )
    vi.spyOn(secureStorage, 'getSecret').mockResolvedValue('')

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})

    function EarlySaver() {
      const { saveSettings, settings } = useSettings()
      return (
        <button onClick={() => saveSettings({ ...settings, businessName: 'Early Save' })}>
          save
        </button>
      )
    }

    const { getByText } = render(
      <ToastProvider>
        <SettingsProvider>
          <EarlySaver />
        </SettingsProvider>
      </ToastProvider>,
    )

    await act(async () => {
      getByText('save').click()
    })

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('saveSettings called before hydration complete'),
    )

    resolveMigration()
  })
})
