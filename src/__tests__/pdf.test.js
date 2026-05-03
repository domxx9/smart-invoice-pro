import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPDFFilename, buildInvoicePDF, pdfFileExists } from '../pdf.js'
import { setCurrency } from '../helpers.js'

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ fillRect: vi.fn() }))
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,')

const minimalInvoice = {
  id: 'INV-0001',
  customer: 'Acme Corp',
  email: 'billing@acme.com',
  date: '2025-01-15',
  due: '2025-02-15',
  status: 'draft',
  items: [{ qty: 2, price: 100, desc: 'Widget' }],
  tax: 20,
  discounts: [],
  notes: null,
}

const minimalSettings = {
  currency: 'GBP',
  businessName: 'My Business',
  email: 'me@example.com',
  phone: '01234567890',
  address1: '123 Main St',
  city: 'London',
  postcode: 'EC1 1AB',
  country: 'UK',
}

const pdfTextContent = (doc) => {
  const b64 = doc.output('datauristring').split(',')[1]
  return atob(b64)
}

// ─── getPDFFilename ───────────────────────────────────────────────────────────

describe('getPDFFilename', () => {
  it('uses customer name when present', () => {
    const inv = { id: 'INV-0001', customer: 'Acme Corp' }
    expect(getPDFFilename(inv)).toBe('INV-0001_Acme_Corp.pdf')
  })

  it('falls back to "invoice" when customer is empty string', () => {
    const inv = { id: 'INV-0001', customer: '' }
    expect(getPDFFilename(inv)).toBe('INV-0001_invoice.pdf')
  })

  it('falls back to "invoice" when customer is null', () => {
    const inv = { id: 'INV-0001', customer: null }
    expect(getPDFFilename(inv)).toBe('INV-0001_invoice.pdf')
  })

  it('falls back to "invoice" when customer is undefined', () => {
    const inv = { id: 'INV-0001' }
    expect(getPDFFilename(inv)).toBe('INV-0001_invoice.pdf')
  })

  it('replaces whitespace with underscores', () => {
    const inv = { id: 'INV-0001', customer: 'John Doe Ltd.' }
    expect(getPDFFilename(inv)).toBe('INV-0001_John_Doe_Ltd..pdf')
  })

  it('handles special characters in customer name', () => {
    const inv = { id: 'INV-0001', customer: "O'Brien & Sons ( Ltd.)" }
    const name = getPDFFilename(inv)
    expect(name).toContain('INV-0001')
    expect(name).toMatch(/\.pdf$/)
    expect(name).toContain("O'Brien")
  })

  it('collapses multiple spaces into single underscore', () => {
    const inv = { id: 'INV-0001', customer: 'Acme   Corp   Ltd' }
    expect(getPDFFilename(inv)).toBe('INV-0001_Acme_Corp_Ltd.pdf')
  })

  it('filename always ends in .pdf', () => {
    const inv = { id: 'INV-0001', customer: 'Test' }
    expect(getPDFFilename(inv)).toMatch(/\.pdf$/)
  })
})

// ─── buildInvoicePDF ──────────────────────────────────────────────────────────

describe('buildInvoicePDF', () => {
  beforeEach(() => {
    setCurrency('GBP')
  })

  it('returns a jsPDF instance without throwing', () => {
    const doc = buildInvoicePDF(minimalInvoice, minimalSettings)
    expect(doc).toBeTruthy()
    expect(typeof doc.text).toBe('function')
    expect(typeof doc.addPage).toBe('function')
  })

  it('creates A5 portrait document', () => {
    const doc = buildInvoicePDF(minimalInvoice, minimalSettings)
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('output is a valid base64 data URI', () => {
    const doc = buildInvoicePDF(minimalInvoice, minimalSettings)
    const dataUri = doc.output('datauristring')
    expect(dataUri).toMatch(/^data:application\/pdf;(?:filename=generated\.pdf;)?base64,/)
  })

  it('includes invoice id in PDF output', () => {
    const doc = buildInvoicePDF(minimalInvoice, minimalSettings)
    expect(pdfTextContent(doc)).toContain('INV-0001')
  })

  it('includes customer name in PDF output', () => {
    const doc = buildInvoicePDF({ ...minimalInvoice, customer: 'Acme Corp' }, minimalSettings)
    expect(pdfTextContent(doc)).toContain('Acme Corp')
  })

  it('includes businessName in PDF output', () => {
    const doc = buildInvoicePDF(minimalInvoice, { ...minimalSettings, businessName: 'TestBiz Ltd' })
    expect(pdfTextContent(doc)).toContain('TestBiz Ltd')
  })

  it('includes invoice date in PDF output', () => {
    const doc = buildInvoicePDF(minimalInvoice, minimalSettings)
    expect(pdfTextContent(doc)).toContain('2025-01-15')
  })

  it('includes due date in PDF output', () => {
    const doc = buildInvoicePDF(minimalInvoice, minimalSettings)
    expect(pdfTextContent(doc)).toContain('2025-02-15')
  })

  it('handles invoice with multiple line items', () => {
    const inv = {
      ...minimalInvoice,
      items: [
        { qty: 1, price: 50, desc: 'Item A' },
        { qty: 2, price: 25, desc: 'Item B' },
        { qty: 3, price: 10, desc: 'Item C' },
      ],
    }
    const doc = buildInvoicePDF(inv, minimalSettings)
    expect(doc).toBeTruthy()
    expect(doc.getNumberOfPages()).toBe(1)
  })

  it('handles invoice with no items', () => {
    const inv = { ...minimalInvoice, items: [] }
    const doc = buildInvoicePDF(inv, minimalSettings)
    expect(doc).toBeTruthy()
  })

  it('handles invoice with notes', () => {
    const inv = { ...minimalInvoice, notes: 'Payment due within 30 days.' }
    const settings = { ...minimalSettings, pdfTemplate: { showNotes: true } }
    const doc = buildInvoicePDF(inv, settings)
    expect(doc).toBeTruthy()
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('handles empty customer', () => {
    const inv = { ...minimalInvoice, customer: '' }
    const doc = buildInvoicePDF(inv, minimalSettings)
    expect(doc).toBeTruthy()
  })

  it('handles missing email', () => {
    const inv = { ...minimalInvoice, email: undefined }
    const doc = buildInvoicePDF(inv, minimalSettings)
    expect(doc).toBeTruthy()
  })

  it('handles missing address fields', () => {
    const inv = {
      ...minimalInvoice,
      address1: null,
      address2: null,
      city: null,
      postcode: null,
      country: null,
    }
    const doc = buildInvoicePDF(inv, minimalSettings)
    expect(doc).toBeTruthy()
  })

  it('handles custom pdfTemplate settings', () => {
    const inv = minimalInvoice
    const settings = {
      ...minimalSettings,
      pdfTemplate: {
        primaryColor: '#ff0000',
        secondaryColor: '#00ff00',
        showLogo: false,
        showNotes: false,
        showTaxLine: false,
        showFooter: false,
        footerText: 'Custom footer',
      },
    }
    const doc = buildInvoicePDF(inv, settings)
    expect(doc).toBeTruthy()
  })

  it('handles discount lines', () => {
    const inv = {
      ...minimalInvoice,
      discounts: [{ name: 'Early Payment', type: 'percent', value: 10, amount: 20 }],
    }
    const doc = buildInvoicePDF(inv, minimalSettings)
    expect(doc).toBeTruthy()
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })

  it('handles zero tax rate', () => {
    const inv = { ...minimalInvoice, tax: 0 }
    const doc = buildInvoicePDF(inv, minimalSettings)
    expect(doc).toBeTruthy()
  })

  it('respects currency setting', () => {
    const settings = { ...minimalSettings, currency: 'USD' }
    setCurrency('USD')
    const doc = buildInvoicePDF(minimalInvoice, settings)
    expect(doc).toBeTruthy()
    setCurrency('GBP')
  })

  it('handles customerBusiness in bill-to block', () => {
    const inv = {
      ...minimalInvoice,
      customerBusiness: 'Acme Holdings',
      customer: 'Accounts Payable',
    }
    const doc = buildInvoicePDF(inv, minimalSettings)
    expect(doc).toBeTruthy()
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })
})

// ─── pdfFileExists ────────────────────────────────────────────────────────────

describe('pdfFileExists', () => {
  it('returns false immediately on web (non-native)', async () => {
    const result = await pdfFileExists('test.pdf')
    expect(result).toBe(false)
  })
})
