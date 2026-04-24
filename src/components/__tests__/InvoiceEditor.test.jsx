import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { Medium: 'MEDIUM' },
}))

vi.mock('../../pdf.js', () => ({
  savePDFToPhone: vi.fn(),
  sharePDF: vi.fn(),
  openPDF: vi.fn(),
  getPDFFilename: () => 'invoice.pdf',
  pdfFileExists: vi.fn(async () => false),
}))

vi.mock('../../hooks/useInvoiceIntelligence.js', () => ({
  useInvoiceIntelligence: vi.fn(() => ({ issues: [], hasIssues: false })),
}))

import { InvoiceEditor } from '../InvoiceEditor.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'
import { useInvoiceIntelligence } from '../../hooks/useInvoiceIntelligence.js'

function makeInvoice(overrides = {}) {
  return {
    id: 'INV0042',
    status: 'new',
    customer: 'Acme',
    items: [{ desc: 'Widget', qty: 1, price: 10 }],
    notes: '',
    tax: 10,
    date: '2026-01-01',
    due: '2026-01-15',
    contactIds: [],
    ...overrides,
  }
}

const baseProps = {
  products: [],
  contacts: [],
  onAddContact: vi.fn(() => ({ id: 'c_new' })),
  onUpdateContact: vi.fn(),
  onSave: vi.fn(),
  onClose: vi.fn(),
  onDelete: vi.fn(),
  aiMode: 'off',
  aiReady: false,
  runInference: vi.fn(),
  toast: vi.fn(),
  smartPasteContext: {},
}

function renderEditor(invoice = makeInvoice(), overrides = {}) {
  const props = { ...baseProps, ...overrides }
  render(
    <SettingsProvider>
      <ToastProvider>
        <InvoiceEditor invoice={invoice} {...props} />
      </ToastProvider>
    </SettingsProvider>,
  )
  return props
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useInvoiceIntelligence.mockReturnValue({ issues: [], hasIssues: false })
})

describe('InvoiceEditor', () => {
  it('renders invoice id and status badge', () => {
    renderEditor(makeInvoice({ id: 'INV0099', status: 'pending' }))
    expect(screen.getByText('INV0099')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders notes textarea and updates on change', () => {
    renderEditor(makeInvoice({ notes: 'hello' }))
    const textarea = screen.getByPlaceholderText(/payment terms/i)
    expect(textarea.value).toBe('hello')
    fireEvent.change(textarea, { target: { value: 'updated' } })
    expect(textarea.value).toBe('updated')
  })

  it('persists draft to localStorage on change', () => {
    renderEditor()
    fireEvent.change(screen.getByPlaceholderText(/payment terms/i), {
      target: { value: 'draft note' },
    })
    const stored = JSON.parse(localStorage.getItem('sip_draft_edit'))
    expect(stored.notes).toBe('draft note')
  })

  it('does not render InvoiceIntelligenceGuard when no issues', () => {
    renderEditor()
    expect(screen.queryByText('Review before saving')).toBeNull()
  })

  it('renders InvoiceIntelligenceGuard when issues exist', () => {
    useInvoiceIntelligence.mockReturnValue({
      issues: ['Missing price on item'],
      hasIssues: true,
    })
    renderEditor()
    expect(screen.getByText('Review before saving')).toBeInTheDocument()
    expect(screen.getByText('Missing price on item')).toBeInTheDocument()
  })

  it('dismisses InvoiceIntelligenceGuard on button click', () => {
    useInvoiceIntelligence.mockReturnValue({
      issues: ['Bad item'],
      hasIssues: true,
    })
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText('Review before saving')).toBeNull()
  })
})
