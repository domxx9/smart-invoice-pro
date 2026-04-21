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

describe('InvoiceEditor — fulfillment flow (SMA-106 / SMA-30)', () => {
  const fulfilBtn = { name: /^Mark as Fulfilled$/ }

  it('does not render the Mark as Fulfilled CTA when status !== "pending"', () => {
    renderEditor({ ...pendingInvoice(), status: 'new' })
    expect(screen.queryByRole('button', fulfilBtn)).toBeNull()
  })

  it('renders the Mark as Fulfilled CTA when status === "pending" and does not auto-open anything', () => {
    renderEditor(pendingInvoice())
    expect(screen.getByRole('button', fulfilBtn)).toBeInTheDocument()
    expect(screen.queryByTestId('picker-ui')).toBeNull()
    expect(screen.queryByRole('dialog', { name: /Fulfil invoice INV0042/ })).toBeNull()
  })

  it('"Mark as Fulfilled" opens the fulfilment choice modal (SMA-30)', () => {
    renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', fulfilBtn))
    const dialog = screen.getByRole('dialog', { name: /Fulfil invoice INV0042/ })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Go to Picker/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Skip picking/ })).toBeInTheDocument()
  })

  it('choosing "Go to Picker" closes the modal and opens PickerUI with mapped items', () => {
    renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', fulfilBtn))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Go to Picker/ }),
    )
    expect(screen.queryByRole('dialog', { name: /Fulfil invoice INV0042/ })).toBeNull()
    const picker = screen.getByTestId('picker-ui')
    expect(within(picker).getByText('Widget')).toBeInTheDocument()
    expect(within(picker).getByText('Gadget')).toBeInTheDocument()
    expect(within(picker).getByText(/0 of 3 items picked/i)).toBeInTheDocument()
  })

  it('choosing "Skip picking" marks the invoice fulfilled with fulfillmentMethod: "instant"', () => {
    const { onSave } = renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', fulfilBtn))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Skip picking/ }),
    )
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.status).toBe('fulfilled')
    expect(saved.fulfillmentMethod).toBe('instant')
    expect(saved.picks).toBeUndefined()
    expect(saved.unavailable).toBeUndefined()
  })

  it('Cancel on the modal closes it without saving', () => {
    const { onSave } = renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', fulfilBtn))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Cancel/ }))
    expect(screen.queryByRole('dialog', { name: /Fulfil invoice INV0042/ })).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('picker path still commits picks and unavailable onto the saved invoice', () => {
    const { onSave } = renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', fulfilBtn))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Go to Picker/ }),
    )

    const picker = screen.getByTestId('picker-ui')
    const widgetRow = within(picker).getByTestId('picker-row-0')
    fireEvent.click(within(widgetRow).getByRole('button', { name: /mark widget as picked/i }))

    const gadgetRow = within(picker).getByTestId('picker-row-1')
    fireEvent.click(within(gadgetRow).getByRole('button', { name: /mark gadget unavailable/i }))

    fireEvent.click(within(picker).getByRole('button', { name: /mark as fulfilled/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]
    expect(saved.status).toBe('fulfilled')
    expect(saved.fulfillmentMethod).toBe('picked')
    expect(saved.picks).toEqual({ 0: 1 })
    expect(saved.unavailable).toEqual({ 1: true })
  })

  it('Skip button inside the picker also marks the invoice fulfilled with fulfillmentMethod: "instant"', () => {
    const { onSave } = renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', fulfilBtn))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Go to Picker/ }),
    )
    fireEvent.click(
      within(screen.getByTestId('picker-ui')).getByRole('button', { name: /^skip$/i }),
    )
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].fulfillmentMethod).toBe('instant')
  })

  it('picker is in-memory only — no sip_picks_* persistence is written for the invoice flow', () => {
    renderEditor(pendingInvoice())
    fireEvent.click(screen.getByRole('button', fulfilBtn))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Go to Picker/ }),
    )
    const picker = screen.getByTestId('picker-ui')
    const widgetRow = within(picker).getByTestId('picker-row-0')
    fireEvent.click(within(widgetRow).getByRole('button', { name: /mark widget as picked/i }))
    const picksKeys = Object.keys(localStorage).filter((k) => k.startsWith('sip_picks'))
    expect(picksKeys).toEqual([])
  })
})
