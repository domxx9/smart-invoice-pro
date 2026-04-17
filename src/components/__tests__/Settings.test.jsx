import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Settings } from '../Settings.jsx'
import { SettingsProvider, isSmartPasteContextSet } from '../../contexts/SettingsContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

// Stub gemma — jsdom can't handle MediaPipe/WebGPU imports.
vi.mock('../../gemma.js', () => ({
  MODELS: { small: { id: 'small', label: 'Gemma', size: '~300 MB', description: 'on-device' } },
  getLoadedModelId: () => null,
  getBackendInfo: () => null,
  cancelDownload: () => {},
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

function renderSettings() {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <Settings ai={makeAiStub()} onStartTour={() => {}} />
      </SettingsProvider>
    </ToastProvider>,
  )
}

function openContextSection() {
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /^Smart Paste AI Context/i }))
}

const CONTEXT_LABELS = [
  /Product type/i,
  /Shop type/i,
  /Customer type/i,
  /Customer vocabulary/i,
  /Language ?\/ ?locale/i,
]

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('Settings — Smart Paste AI Context section', () => {
  it('renders 5 labeled textareas inside the new section', () => {
    renderSettings()
    openContextSection()
    for (const label of CONTEXT_LABELS) {
      const field = screen.getByLabelText(label)
      expect(field).toBeInTheDocument()
      expect(field.tagName).toBe('TEXTAREA')
    }
  })

  it('anchors the section heading with id="smart-paste-ai-context" for deep-linking', () => {
    renderSettings()
    const anchor = document.getElementById('smart-paste-ai-context')
    expect(anchor).not.toBeNull()
    expect(anchor).toHaveTextContent(/Smart Paste AI Context/i)
  })

  it('round-trips values through localStorage across remount', () => {
    const values = {
      'Product type': 'artisan cheese',
      'Shop type': 'brick-and-mortar',
      'Customer type': 'restaurants',
      'Customer vocabulary': '"chedd" = cheddar',
      'Language / locale': 'UK English + Spanish',
    }

    const first = renderSettings()
    openContextSection()
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(new RegExp(label, 'i')), {
        target: { value },
      })
    }
    fireEvent.click(screen.getByRole('button', { name: /Save Settings/i }))
    first.unmount()

    const stored = JSON.parse(localStorage.getItem('sip_settings'))
    expect(stored.smartPasteContext).toEqual({
      productType: 'artisan cheese',
      shopType: 'brick-and-mortar',
      customerType: 'restaurants',
      vocabulary: '"chedd" = cheddar',
      locale: 'UK English + Spanish',
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
})

describe('isSmartPasteContextSet', () => {
  const full = {
    productType: 'a',
    shopType: 'b',
    customerType: 'c',
    vocabulary: 'd',
    locale: 'e',
  }

  it('returns true when every phrase is non-empty after trim', () => {
    expect(isSmartPasteContextSet({ smartPasteContext: full })).toBe(true)
  })

  it('returns false when any phrase is blank', () => {
    for (const key of Object.keys(full)) {
      expect(isSmartPasteContextSet({ smartPasteContext: { ...full, [key]: '' } })).toBe(false)
    }
  })

  it('returns false when a phrase is whitespace-only', () => {
    expect(isSmartPasteContextSet({ smartPasteContext: { ...full, vocabulary: '   \n\t' } })).toBe(
      false,
    )
  })

  it('returns false when smartPasteContext is missing entirely', () => {
    expect(isSmartPasteContextSet({})).toBe(false)
    expect(isSmartPasteContextSet(null)).toBe(false)
    expect(isSmartPasteContextSet(undefined)).toBe(false)
  })
})
