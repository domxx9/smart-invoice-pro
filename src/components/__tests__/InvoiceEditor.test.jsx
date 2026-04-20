import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.mock('react-swipeable', () => ({ useSwipeable: vi.fn(() => ({})) }))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { Medium: 'MEDIUM' },
}))

// PDF helpers touch APIs (jsPDF, file system) we don't need in these tests.
vi.mock('../../pdf.js', () => ({
  savePDFToPhone: vi.fn(),
  sharePDF: vi.fn(),
  openPDF: vi.fn(),
  getPDFFilename: () => 'invoice.pdf',
  pdfFileExists: vi.fn(async () => false),
}))

import { InvoiceEditor } from '../InvoiceEditor.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

function renderEditor(invoice, overrides = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  const onDelete = vi.fn()
  render(
    <SettingsProvider>
      <ToastProvider>
        <InvoiceEditor
          invoice={invoice}
          products={[]}
          onSave={onSave}
          onClose={onClose}
          onDelete={onDelete}
          aiMode="off"
          aiReady={false}
          runInference={vi.fn()}
          toast={vi.fn()}
          smartPasteContext={{}}
          {...overrides}
        />
      </ToastProvider>
    </SettingsProvider>,
  )
  return { onSave, onClose, onDelete }
}

function pendingInvoice(overrides = {}) {
  return {
    id: 'INV0042',
    status: 'pending',
    customer: 'Acme',
    items: [
      { desc: 'Widget', qty: 1, price: 10 },
      { desc: 'Gadget', qty: 2, price: 5 },
    ],
    notes: '',
    tax: 10,
    date: '2026-01-01',
    due: '2026-01-15',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('InvoiceEditor — fulfillment flow (SMA-106)', () => {
  it('does not render the picker CTA when status !== "pending"', () => {
    renderEditor({ ...pendingInvoice(), status: 'new' })
    expect(screen.queryByRole('button', { name: /start pick/i })).toBeNull()
  })

  it('renders the picker CTA when status === "pending"', () => {
    renderEditor(pendingInvoice())
    expect(screen.getByRole('button', { name: /start pick/i })).toBeInTheDocument()
    // Picker is not open until Start Pick is pressed.
    expect(screen.queryByTestId('picker-ui')).toBeNull()
  })

  it('"Start Pick" opens PickerUI with the invoice items mapped to { name, qty }', () => {
    renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', { name: /start pick/i }))
    const picker = screen.getByTestId('picker-ui')
    expect(picker).toBeInTheDocument()
    expect(within(picker).getByText('Widget')).toBeInTheDocument()
    expect(within(picker).getByText('Gadget')).toBeInTheDocument()
    expect(within(picker).getByText(/0 of 3 items picked/i)).toBeInTheDocument()
  })

  it('"Skip" marks the invoice fulfilled with fulfillmentMethod: "instant"', () => {
    const { onSave } = renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', { name: /start pick/i }))
    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.status).toBe('fulfilled')
    expect(saved.fulfillmentMethod).toBe('instant')
    // Instant skip does NOT commit picks/unavailable.
    expect(saved.picks).toBeUndefined()
    expect(saved.unavailable).toBeUndefined()
  })

  it('"Mark as Fulfilled" commits picks and unavailable onto the saved invoice', () => {
    const { onSave } = renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', { name: /start pick/i }))

    // Pick the single-qty "Widget" (idx 0).
    const picker = screen.getByTestId('picker-ui')
    const widgetRow = within(picker).getByTestId('picker-row-0')
    fireEvent.click(within(widgetRow).getByRole('button', { name: /mark widget as picked/i }))

    // Mark "Gadget" (idx 1) as unavailable.
    const gadgetRow = within(picker).getByTestId('picker-row-1')
    fireEvent.click(within(gadgetRow).getByRole('button', { name: /mark gadget unavailable/i }))

    fireEvent.click(screen.getByRole('button', { name: /mark as fulfilled/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.status).toBe('fulfilled')
    expect(saved.fulfillmentMethod).toBe('picked')
    expect(saved.picks).toEqual({ 0: 1 })
    expect(saved.unavailable).toEqual({ 1: true })
  })

  it('picker is in-memory only — no sip_picks_* persistence is written for the invoice flow', () => {
    renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', { name: /start pick/i }))
    const picker = screen.getByTestId('picker-ui')
    const widgetRow = within(picker).getByTestId('picker-row-0')
    fireEvent.click(within(widgetRow).getByRole('button', { name: /mark widget as picked/i }))
    const picksKeys = Object.keys(localStorage).filter((k) => k.startsWith('sip_picks'))
    expect(picksKeys).toEqual([])
  })
})
