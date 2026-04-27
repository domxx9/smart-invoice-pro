import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Settings } from '../Settings.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

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

function renderSettings() {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <Settings ai={makeAiStub()} onStartTour={() => {}} />
      </SettingsProvider>
    </ToastProvider>,
  )
}

function openSection(titleRegex) {
  fireEvent.click(screen.getByRole('button', { expanded: false, name: titleRegex }))
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('Settings — Billing Information', () => {
  it('renders bank and payment fields', () => {
    renderSettings()
    openSection(/^Billing Information/)
    expect(screen.getByLabelText(/Bank Name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Account Holder/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Account Number/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Sort Code/)).toBeInTheDocument()
    expect(screen.getByLabelText(/IBAN/)).toBeInTheDocument()
    expect(screen.getByLabelText(/SWIFT \/ BIC/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Payment Instructions/)).toBeInTheDocument()
  })

  it('persists non-sensitive fields to localStorage without leaking bank account number', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderSettings()
    openSection(/^Billing Information/)

    fireEvent.change(screen.getByLabelText(/Bank Name/), { target: { value: 'Barclays' } })
    fireEvent.change(screen.getByLabelText(/Sort Code/), { target: { value: '12-34-56' } })
    fireEvent.change(screen.getByLabelText(/Account Number/), { target: { value: '87654321' } })

    vi.advanceTimersByTime(1100)
    vi.useRealTimers()

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('sip_settings') || '{}')
      expect(saved.bankName).toBe('Barclays')
      expect(saved.bankSortCode).toBe('12-34-56')
      expect(saved.bankAccountNumber).toBeUndefined()
    })
  })
})

describe('Settings — Tax & Compliance', () => {
  it('renders the tax id label select, number, and company number fields', () => {
    renderSettings()
    openSection(/^Tax & Compliance/)
    expect(screen.getByLabelText(/Tax ID Label/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Number/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Company Number/)).toBeInTheDocument()
  })

  it('persists tax label, number, and company number to localStorage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderSettings()
    openSection(/^Tax & Compliance/)

    fireEvent.change(screen.getByLabelText(/Tax ID Label/), { target: { value: 'GST' } })
    fireEvent.change(screen.getByLabelText(/^Number/), { target: { value: '123-456-789' } })
    fireEvent.change(screen.getByLabelText(/Company Number/), { target: { value: '12345678' } })

    vi.advanceTimersByTime(1100)
    vi.useRealTimers()

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('sip_settings') || '{}')
      expect(saved.taxIdLabel).toBe('GST')
      expect(saved.taxIdNumber).toBe('123-456-789')
      expect(saved.companyNumber).toBe('12345678')
    })
  })
})
