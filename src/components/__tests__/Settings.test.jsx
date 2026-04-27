import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Settings } from '../Settings.jsx'
import { SettingsProvider, isSmartPasteContextSet } from '../../contexts/SettingsContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'
import {
  SHOP_TYPE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  VOCABULARY_OPTIONS,
  LOCALE_OPTIONS,
} from '../../constants/smartPasteContextPresets.js'

// Stub gemma — jsdom can't handle MediaPipe/WebGPU imports.
vi.mock('../../gemma.js', () => ({
  MODELS: { small: { id: 'small', label: 'Gemma', size: '~300 MB', description: 'on-device' } },
  getLoadedModelId: () => null,
  getBackendInfo: () => null,
  cancelDownload: () => {},
  isNativePlatform: () => false,
}))

function makeAiStub() {
  return {
    aiModelId: 'small',
    aiDownloaded: {},
    aiDownloadProgress: {},
    aiDownloading: null,
    aiLoading: false,
    aiReady: false,
    handleAiSelect: vi.fn(),
    handleAiDownload: vi.fn(),
    handleAiDelete: vi.fn(),
    handleAiLoad: vi.fn(),
    byokStatus: 'idle',
    byokError: '',
    handleByokTest: vi.fn(),
    handleByokClear: vi.fn(),
  }
}

const contactsApiStub = {
  contacts: [],
  mergeContacts: vi.fn().mockReturnValue({ added: 0, skipped: 0 }),
}

function renderSettings() {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <Settings ai={makeAiStub()} onStartTour={() => {}} contactsApi={contactsApiStub} />
      </SettingsProvider>
    </ToastProvider>,
  )
}

function openContextSection() {
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /^Smart Paste AI Context/i }))
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('Settings — Smart Paste AI Context section', () => {
  it('keeps product type as a free-form textarea', () => {
    renderSettings()
    openContextSection()
    const field = screen.getByLabelText(/Product type/i)
    expect(field.tagName).toBe('TEXTAREA')
  })

  it('renders the four remaining fields as preset dropdowns (SMA-97)', () => {
    renderSettings()
    openContextSection()
    for (const label of [
      /Shop type/i,
      /Customer type/i,
      /Customer vocabulary/i,
      /Language ?\/ ?locale/i,
    ]) {
      const field = screen.getByLabelText(label)
      expect(field.tagName).toBe('SELECT')
    }
  })

  it('prefills each preset dropdown with its option list', () => {
    renderSettings()
    openContextSection()
    const cases = [
      [/Shop type/i, SHOP_TYPE_OPTIONS],
      [/Customer type/i, CUSTOMER_TYPE_OPTIONS],
      [/Language ?\/ ?locale/i, LOCALE_OPTIONS],
    ]
    for (const [label, options] of cases) {
      const select = screen.getByLabelText(label)
      for (const opt of options) {
        expect(within(select).getByRole('option', { name: opt })).toBeInTheDocument()
      }
    }
  })

  it('surfaces a blank option on the vocabulary (slang) dropdown', () => {
    renderSettings()
    openContextSection()
    const vocab = screen.getByLabelText(/Customer vocabulary/i)
    // The blank option should be selectable (no `disabled` attribute) and
    // the select should default to the empty string when no context saved.
    const blank = within(vocab).getByRole('option', { name: /none ?\/ ?skip/i })
    expect(blank).toBeInTheDocument()
    expect(blank).not.toHaveAttribute('disabled')
    expect(vocab).toHaveValue('')
    // Preset slang options are still listed.
    for (const opt of VOCABULARY_OPTIONS) {
      expect(within(vocab).getByRole('option', { name: opt })).toBeInTheDocument()
    }
  })

  it('anchors the section heading with id="smart-paste-ai-context" for deep-linking', () => {
    renderSettings()
    const anchor = document.getElementById('smart-paste-ai-context')
    expect(anchor).not.toBeNull()
    expect(anchor).toHaveTextContent(/Smart Paste AI Context/i)
  })

  it('round-trips preset selections through localStorage across remount', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const values = {
      'Product type': 'artisan cheese',
      'Shop type': SHOP_TYPE_OPTIONS[0],
      'Customer type': CUSTOMER_TYPE_OPTIONS[1],
      'Customer vocabulary': VOCABULARY_OPTIONS[2],
      'Language / locale': LOCALE_OPTIONS[0],
    }

    const first = renderSettings()
    openContextSection()
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(new RegExp(label, 'i')), {
        target: { value },
      })
    }
    vi.advanceTimersByTime(1100)
    first.unmount()
    vi.useRealTimers()

    const stored = JSON.parse(localStorage.getItem('sip_settings'))
    expect(stored.smartPasteContext).toEqual({
      productType: 'artisan cheese',
      shopType: SHOP_TYPE_OPTIONS[0],
      customerType: CUSTOMER_TYPE_OPTIONS[1],
      vocabulary: VOCABULARY_OPTIONS[2],
      locale: LOCALE_OPTIONS[0],
    })

    renderSettings()
    openContextSection()
    const section = within(
      document.getElementById('smart-paste-ai-context').closest('.settings-section'),
    )
    for (const [label, value] of Object.entries(values)) {
      expect(section.getByLabelText(new RegExp(label, 'i'))).toHaveValue(value)
    }
  })

  it('preserves a legacy free-form value as a selectable option (migration)', () => {
    localStorage.setItem(
      'sip_settings',
      JSON.stringify({
        smartPasteContext: {
          productType: 'legacy product blurb',
          shopType: 'freehand shop description',
          customerType: CUSTOMER_TYPE_OPTIONS[0],
          vocabulary: '',
          locale: LOCALE_OPTIONS[0],
        },
      }),
    )

    renderSettings()
    openContextSection()
    const shop = screen.getByLabelText(/Shop type/i)
    // Legacy value must be shown as selected so the user sees what was saved.
    expect(shop).toHaveValue('freehand shop description')
    expect(
      within(shop).getByRole('option', { name: 'freehand shop description' }),
    ).toBeInTheDocument()
  })
})

describe('Settings — auto-save debounce (SMA-218)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function openBusinessSection() {
    fireEvent.click(screen.getByRole('button', { name: /^Business$/i }))
  }

  it('does not persist settings to localStorage before the debounce delay', () => {
    const initialSettings = { businessName: 'Test Biz', smartPasteContext: {} }
    localStorage.setItem('sip_settings', JSON.stringify(initialSettings))

    renderSettings()
    openBusinessSection()
    const input = screen.getByLabelText(/Business Name/i)
    fireEvent.change(input, { target: { value: 'New Biz' } })

    vi.advanceTimersByTime(500)
    const storedDuring = JSON.parse(localStorage.getItem('sip_settings') || '{}')
    expect(storedDuring.businessName).toBe('Test Biz')
  })

  it('persists settings to localStorage after the debounce delay expires', () => {
    const initialSettings = { businessName: 'Test Biz', smartPasteContext: {} }
    localStorage.setItem('sip_settings', JSON.stringify(initialSettings))

    renderSettings()
    openBusinessSection()
    const input = screen.getByLabelText(/Business Name/i)
    fireEvent.change(input, { target: { value: 'Auto-saved Biz' } })

    vi.advanceTimersByTime(1100)
    const storedAfter = JSON.parse(localStorage.getItem('sip_settings') || '{}')
    expect(storedAfter.businessName).toBe('Auto-saved Biz')
  })

  it('cancels the pending save when a new change arrives before the delay', () => {
    const initialSettings = { businessName: 'Test Biz', smartPasteContext: {} }
    localStorage.setItem('sip_settings', JSON.stringify(initialSettings))

    renderSettings()
    openBusinessSection()
    const input = screen.getByLabelText(/Business Name/i)
    fireEvent.change(input, { target: { value: 'First' } })
    vi.advanceTimersByTime(600)
    fireEvent.change(input, { target: { value: 'Second' } })
    vi.advanceTimersByTime(1100)

    const storedAfter = JSON.parse(localStorage.getItem('sip_settings') || '{}')
    expect(storedAfter.businessName).toBe('Second')
  })

  it('does not fire save on initial mount — isFirstRender guard prevents mount-fire', () => {
    const initialSettings = { businessName: 'Mount Fire Test', smartPasteContext: {} }
    localStorage.setItem('sip_settings', JSON.stringify(initialSettings))

    renderSettings()
    vi.advanceTimersByTime(2000)

    const stored = JSON.parse(localStorage.getItem('sip_settings') || '{}')
    expect(stored.businessName).toBe('Mount Fire Test')
  })
})

describe('isSmartPasteContextSet', () => {
  const full = {
    productType: 'a',
    shopType: 'b',
    customerType: 'c',
    vocabulary: 'd',
    locale: 'e',
  }

  it('returns true when every required phrase is non-empty after trim', () => {
    expect(isSmartPasteContextSet({ smartPasteContext: full })).toBe(true)
  })

  it('still returns true when vocabulary is blank (SMA-97 — slang is optional)', () => {
    expect(isSmartPasteContextSet({ smartPasteContext: { ...full, vocabulary: '' } })).toBe(true)
    expect(isSmartPasteContextSet({ smartPasteContext: { ...full, vocabulary: '   \n\t' } })).toBe(
      true,
    )
  })

  it('returns false when any required phrase is blank', () => {
    for (const key of ['productType', 'shopType', 'customerType', 'locale']) {
      expect(isSmartPasteContextSet({ smartPasteContext: { ...full, [key]: '' } })).toBe(false)
    }
  })

  it('returns false when a required phrase is whitespace-only', () => {
    expect(isSmartPasteContextSet({ smartPasteContext: { ...full, locale: '   \n\t' } })).toBe(
      false,
    )
  })

  it('returns false when smartPasteContext is missing entirely', () => {
    expect(isSmartPasteContextSet({})).toBe(false)
    expect(isSmartPasteContextSet(null)).toBe(false)
    expect(isSmartPasteContextSet(undefined)).toBe(false)
  })
})
