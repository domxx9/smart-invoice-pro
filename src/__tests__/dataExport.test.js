import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  SCHEMA_VERSION,
  EXPORT_KIND,
  KNOWN_STORAGE_KEYS,
  TRANSIENT_STORAGE_KEYS,
  buildExportSnapshot,
  snapshotToJson,
  invoicesToCsv,
  backupFilename,
} from '../utils/dataExport.js'

const sampleInvoices = [
  {
    id: 'INV-0001',
    customer: 'Alice',
    email: 'alice@example.com',
    date: '2026-04-01',
    due: '2026-05-01',
    status: 'paid',
    items: [
      { desc: 'Widget', qty: 2, price: 50 },
      { desc: 'Bolt', qty: 4, price: 1.25 },
    ],
    tax: 20,
    notes: 'Paid in full',
  },
]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('module surface', () => {
  it('exposes the schema version and kind constants', () => {
    expect(SCHEMA_VERSION).toBe(1)
    expect(EXPORT_KIND).toBe('smart-invoice-pro-backup')
  })

  it('lists every persisted sip_* key the snapshot must cover', () => {
    expect(KNOWN_STORAGE_KEYS).toEqual([
      'sip_invoices',
      'sip_products',
      'sip_products_synced_at',
      'sip_orders',
      'sip_orders_synced_at',
      'sip_picks',
      'sip_settings',
      'sip_onboarded',
      'sip_ai_model',
    ])
  })

  it('KNOWN_STORAGE_KEYS stays in sync with what buildExportSnapshot actually reads', async () => {
    const readKeys = new Set()
    const realGetItem = Storage.prototype.getItem
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      readKeys.add(key)
      return realGetItem.call(this, key)
    })
    try {
      await buildExportSnapshot()
    } finally {
      spy.mockRestore()
    }
    for (const key of KNOWN_STORAGE_KEYS) {
      expect(readKeys, `buildExportSnapshot did not read ${key}`).toContain(key)
    }
  })

  it('exports TRANSIENT_STORAGE_KEYS listing intentionally-excluded editor keys', () => {
    expect(Array.isArray(TRANSIENT_STORAGE_KEYS)).toBe(true)
    expect(TRANSIENT_STORAGE_KEYS.length).toBeGreaterThan(0)
    for (const key of TRANSIENT_STORAGE_KEYS) {
      expect(key).toMatch(/^sip_/)
    }
    expect(TRANSIENT_STORAGE_KEYS).toEqual(['sip_draft_edit', 'sip_draft_original'])
  })

  it('KNOWN_STORAGE_KEYS and TRANSIENT_STORAGE_KEYS are disjoint', () => {
    const known = new Set(KNOWN_STORAGE_KEYS)
    for (const key of TRANSIENT_STORAGE_KEYS) {
      expect(known, `${key} must not be both persisted and transient`).not.toContain(key)
    }
  })
})

describe('buildExportSnapshot', () => {
  it('produces the versioned envelope with app metadata and an ISO timestamp', async () => {
    const snap = await buildExportSnapshot()
    expect(snap.kind).toBe('smart-invoice-pro-backup')
    expect(snap.version).toBe(1)
    expect(snap.app?.name).toBe('Smart Invoice Pro')
    expect(typeof snap.app?.version).toBe('string')
    expect(snap.app.version).toMatch(/^\d+\.\d+/)
    expect(new Date(snap.exportedAt).toString()).not.toBe('Invalid Date')
  })

  it('returns safe defaults for keys that have never been written', async () => {
    const snap = await buildExportSnapshot()
    expect(snap.data.invoices).toEqual([])
    expect(snap.data.products).toEqual([])
    expect(snap.data.productsSyncedAt).toBeNull()
    expect(snap.data.orders).toEqual([])
    expect(snap.data.ordersSyncedAt).toBeNull()
    expect(snap.data.picks).toEqual({})
    expect(snap.data.settings).toEqual({})
    expect(snap.data.onboarded).toBeNull()
    expect(snap.data.aiModelId).toBeNull()
    expect(snap.secrets).toBeNull()
  })

  it('captures every persisted sip_* value into the data block', async () => {
    localStorage.setItem('sip_invoices', JSON.stringify(sampleInvoices))
    localStorage.setItem('sip_products', JSON.stringify([{ id: 1, name: 'Bolt', price: 1.25 }]))
    localStorage.setItem('sip_products_synced_at', '1700000000000')
    localStorage.setItem('sip_orders', JSON.stringify([{ id: 'o1' }]))
    localStorage.setItem('sip_orders_synced_at', '1700000001000')
    localStorage.setItem('sip_picks', JSON.stringify({ o1: { 0: 2 } }))
    localStorage.setItem('sip_settings', JSON.stringify({ businessName: 'Acme', currency: 'GBP' }))
    localStorage.setItem('sip_onboarded', 'real')
    localStorage.setItem('sip_ai_model', 'small')

    const snap = await buildExportSnapshot()

    expect(snap.data.invoices).toEqual(sampleInvoices)
    expect(snap.data.products).toEqual([{ id: 1, name: 'Bolt', price: 1.25 }])
    expect(snap.data.productsSyncedAt).toBe(1700000000000)
    expect(snap.data.orders).toEqual([{ id: 'o1' }])
    expect(snap.data.ordersSyncedAt).toBe(1700000001000)
    expect(snap.data.picks).toEqual({ o1: { 0: 2 } })
    expect(snap.data.settings).toEqual({ businessName: 'Acme', currency: 'GBP' })
    expect(snap.data.onboarded).toBe('real')
    expect(snap.data.aiModelId).toBe('small')
  })

  it('falls back to safe defaults when a stored JSON value is corrupt', async () => {
    localStorage.setItem('sip_invoices', 'this is not json')
    localStorage.setItem('sip_picks', '{not json')
    localStorage.setItem('sip_settings', '<<corrupt>>')

    const snap = await buildExportSnapshot()

    expect(snap.data.invoices).toEqual([])
    expect(snap.data.picks).toEqual({})
    expect(snap.data.settings).toEqual({})
  })

  it('omits secrets by default and never leaks them into the serialized JSON', async () => {
    sessionStorage.setItem('sip_sqApiKey', 'sq-secret')
    sessionStorage.setItem('sip_byok_openai', 'sk-secret')

    const snap = await buildExportSnapshot()

    expect(snap.secrets).toBeNull()
    const serialized = snapshotToJson(snap)
    expect(serialized).not.toContain('sq-secret')
    expect(serialized).not.toContain('sk-secret')
  })

  it('includes only non-empty secrets when includeSecrets is set', async () => {
    sessionStorage.setItem('sip_sqApiKey', 'sq-secret')
    sessionStorage.setItem('sip_byok_openai', 'sk-secret')
    sessionStorage.setItem('sip_byok_anthropic', '')

    const snap = await buildExportSnapshot({ includeSecrets: true })

    expect(snap.secrets).toEqual({
      sqApiKey: 'sq-secret',
      byok: { openai: 'sk-secret' },
    })
  })

  it('captures shopifyAccessToken and every BYOK provider that has a value', async () => {
    sessionStorage.setItem('sip_shopifyAccessToken', 'shpat')
    sessionStorage.setItem('sip_byok_openai', 'sk-1')
    sessionStorage.setItem('sip_byok_gemini', 'gm-1')
    sessionStorage.setItem('sip_byok_openrouter', 'or-1')
    sessionStorage.setItem('sip_byok_anthropic', 'an-1')

    const snap = await buildExportSnapshot({ includeSecrets: true })

    expect(snap.secrets.shopifyAccessToken).toBe('shpat')
    expect(snap.secrets.byok).toEqual({
      openai: 'sk-1',
      gemini: 'gm-1',
      openrouter: 'or-1',
      anthropic: 'an-1',
    })
    expect(snap.secrets.sqApiKey).toBeUndefined()
  })

  it('returns an empty secrets envelope when opt-in is on but nothing is stored', async () => {
    const snap = await buildExportSnapshot({ includeSecrets: true })
    expect(snap.secrets).toEqual({ byok: {} })
  })
})

describe('snapshotToJson', () => {
  it('emits 2-space-indented JSON that round-trips back to the same object', async () => {
    const snap = await buildExportSnapshot()
    const out = snapshotToJson(snap)
    expect(out.split('\n')[1]).toMatch(/^ {2}"/)
    expect(JSON.parse(out)).toEqual(snap)
  })
})

describe('invoicesToCsv', () => {
  it('emits the canonical header row', () => {
    expect(invoicesToCsv([])).toBe(
      'invoice_number,customer,email,date,due,status,subtotal,tax,total,notes',
    )
  })

  it('renders one row per invoice with computed totals', () => {
    const csv = invoicesToCsv(sampleInvoices)
    const rows = csv.split('\r\n')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toBe('invoice_number,customer,email,date,due,status,subtotal,tax,total,notes')
    expect(rows[1]).toBe(
      'INV-0001,Alice,alice@example.com,2026-04-01,2026-05-01,paid,105.00,21.00,126.00,Paid in full',
    )
  })

  it('quotes and escapes fields containing commas, quotes, and newlines', () => {
    const csv = invoicesToCsv([
      {
        id: 'INV-0002',
        customer: 'Smith, Jane',
        email: 'jane@example.com',
        date: '2026-04-10',
        due: '',
        status: 'pending',
        items: [{ qty: 1, price: 10 }],
        tax: 0,
        notes: 'Said "hi"\nand left',
      },
    ])
    const row = csv.split('\r\n')[1]
    expect(row).toBe(
      'INV-0002,"Smith, Jane",jane@example.com,2026-04-10,,pending,10.00,0.00,10.00,"Said ""hi""\nand left"',
    )
  })

  it('treats null/undefined input as an empty list', () => {
    expect(invoicesToCsv(undefined)).toBe(
      'invoice_number,customer,email,date,due,status,subtotal,tax,total,notes',
    )
    expect(invoicesToCsv(null)).toBe(
      'invoice_number,customer,email,date,due,status,subtotal,tax,total,notes',
    )
  })

  it('coerces missing fields and a missing items array to safe values', () => {
    const csv = invoicesToCsv([{ id: 'INV-0003' }])
    expect(csv.split('\r\n')[1]).toBe('INV-0003,,,,,,0.00,0.00,0.00,')
  })

  it('handles string qty and price values like the editor produces', () => {
    const csv = invoicesToCsv([
      {
        id: 'INV-0004',
        customer: 'Bob',
        items: [{ qty: '3', price: '12.5' }],
        tax: '10',
      },
    ])
    expect(csv.split('\r\n')[1]).toBe('INV-0004,Bob,,,,,37.50,3.75,41.25,')
  })
})

describe('backupFilename', () => {
  it('formats YYYY-MM-DD with zero-padded month and day', () => {
    expect(backupFilename('smart-invoice-pro-backup', new Date(2026, 3, 7))).toBe(
      'smart-invoice-pro-backup-2026-04-07.json',
    )
  })

  it('defaults to "now"', () => {
    expect(backupFilename('foo')).toMatch(/^foo-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
