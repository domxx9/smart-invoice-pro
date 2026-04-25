import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { InvoiceProvider, useInvoice } from '../InvoiceContext.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { MEDIUM: 'MEDIUM', Medium: 'MEDIUM' },
}))

vi.mock('../../secure-storage.js', () => ({
  setSecret: vi.fn(),
  getSecret: vi.fn(() => Promise.resolve(null)),
  migrateKeysFromLocalStorage: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../pdf.js', () => ({
  savePDFToPhone: vi.fn(),
  sharePDF: vi.fn(),
  openPDF: vi.fn(),
  getPDFFilename: () => 'invoice.pdf',
  pdfFileExists: vi.fn(async () => false),
}))

function wrapper({ children }) {
  return (
    <SettingsProvider>
      <ToastProvider>
        <InvoiceProvider onOpenEditor={vi.fn()}>{children}</InvoiceProvider>
      </ToastProvider>
    </SettingsProvider>
  )
}

describe('InvoiceProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('exposes invoices and confettiTrigger in context', async () => {
    const { result } = renderHook(() => useInvoice(), { wrapper })
    await waitFor(() => {
      expect(result.current.invoices).toBeDefined()
      expect(result.current.confettiTrigger).toBe(0)
    })
  })

  it('handleNewInvoice creates a new invoice accessible via editing', async () => {
    const { result } = renderHook(() => useInvoice(), { wrapper })
    await waitFor(() => expect(result.current.invoices).toBeDefined())
    await act(async () => {
      result.current.handleNewInvoice()
    })
    await waitFor(() => {
      expect(result.current.editing).not.toBeNull()
    })
    expect(result.current.editing.id).toBeDefined()
  })

  it('handleSave persists invoice to invoices list', async () => {
    const { result } = renderHook(() => useInvoice(), { wrapper })
    await waitFor(() => expect(result.current.invoices).toBeDefined())
    await act(async () => {
      result.current.handleNewInvoice()
    })
    await waitFor(() => expect(result.current.editing).not.toBeNull())
    const draft = { ...result.current.editing, customer: 'Test Corp' }
    await act(async () => {
      result.current.handleSave(draft)
    })
    await waitFor(() => {
      expect(result.current.invoices.length).toBe(1)
      expect(result.current.invoices[0].customer).toBe('Test Corp')
    })
  })

  it('confettiTrigger starts at 0', async () => {
    const { result } = renderHook(() => useInvoice(), { wrapper })
    await waitFor(() => {
      expect(result.current.confettiTrigger).toBe(0)
    })
  })

  it('confettiTrigger increments when invoice is marked paid', async () => {
    const { result } = renderHook(() => useInvoice(), { wrapper })
    await waitFor(() => expect(result.current.invoices).toBeDefined())
    await act(async () => {
      result.current.handleNewInvoice()
    })
    await waitFor(() => expect(result.current.editing).not.toBeNull())
    const paidInvoice = { ...result.current.editing, status: 'paid' }
    await act(async () => {
      result.current.handleSave(paidInvoice)
    })
    await waitFor(() => {
      expect(result.current.confettiTrigger).toBe(1)
    })
  })
})
