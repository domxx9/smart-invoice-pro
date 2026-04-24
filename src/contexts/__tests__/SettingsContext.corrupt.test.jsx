import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SettingsProvider } from '../SettingsContext.jsx'
import { ToastProvider } from '../ToastContext.jsx'
import { logger } from '../../utils/logger.js'

beforeEach(() => {
  localStorage.clear()
  logger.clear()
  logger.setMinLevel('error')
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
