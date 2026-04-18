import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  parseSnapshot,
  validateSnapshot,
  applySnapshot,
} from '../utils/dataImport.js'
import { EXPORT_KIND, SCHEMA_VERSION } from '../utils/dataExport.js'

const setSecretMock = vi.fn(async () => {})
vi.mock('../secure-storage.js', () => ({
  setSecret: (...args) => setSecretMock(...args),
  getSecret: vi.fn(async () => ''),
  deleteSecret: vi.fn(async () => {}),
  migrateKeysFromLocalStorage: vi.fn(async () => {}),
}))

function goodSnapshot(overrides = {}) {
  return {
    kind: EXPORT_KIND,
    version: SCHEMA_VERSION,
    exportedAt: '2026-04-18T20:00:00.000Z',
    app: { name: 'Smart Invoice Pro', version: '1.0.0' },
    data: {
      invoices: [{ id: 'INV-1', customer: 'Alice' }],
      products: [{ id: 1, name: 'Bolt' }],
      productsSyncedAt: 1700000000000,
      orders: [{ id: 'o1' }],
      ordersSyncedAt: 1700000001000,
      picks: { o1: { 0: 2 } },
      settings: { businessName: 'Acme', currency: 'GBP' },
      onboarded: 'real',
      aiModelId: 'small',
    },
    secrets: null,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  setSecretMock.mockClear()
})

describe('parseSnapshot', () => {
  it('reports an issue for an empty or whitespace-only payload', () => {
    expect(parseSnapshot('').issues).toEqual(['File is empty.'])
    expect(parseSnapshot('   \n\t').issues).toEqual(['File is empty.'])
    expect(parseSnapshot('').snapshot).toBeNull()
  })

  it('reports a human-readable issue when the JSON is invalid', () => {
    const result = parseSnapshot('{ not json')
    expect(result.snapshot).toBeNull()
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatch(/not valid JSON/i)
  })

  it('parses a well-formed snapshot and returns it unchanged', () => {
    const snap = goodSnapshot()
    const result = parseSnapshot(JSON.stringify(snap))
    expect(result.issues).toEqual([])
    expect(result.snapshot).toEqual(snap)
  })
})

describe('validateSnapshot', () => {
  it('rejects non-object inputs', () => {
    expect(validateSnapshot(null).issues[0]).toMatch(/not a JSON object/i)
    expect(validateSnapshot([]).issues[0]).toMatch(/not a JSON object/i)
    expect(validateSnapshot('oops').issues[0]).toMatch(/not a JSON object/i)
  })

  it('rejects a snapshot with the wrong kind', () => {
    const result = validateSnapshot(goodSnapshot({ kind: 'something-else' }))
    expect(result.issues.some((m) => /Unexpected backup kind/.test(m))).toBe(true)
  })

  it('rejects a snapshot with an unsupported schema version', () => {
    const result = validateSnapshot(goodSnapshot({ version: 2 }))
    expect(result.issues.some((m) => /Unsupported schema version/.test(m))).toBe(true)
  })

  it('reports a missing data block', () => {
    const result = validateSnapshot({
      kind: EXPORT_KIND,
      version: SCHEMA_VERSION,
    })
    expect(result.issues).toContain('Backup is missing the "data" block.')
  })

  it('reports every data field whose type is wrong', () => {
    const snap = goodSnapshot({
      data: {
        invoices: 'not-an-array',
        products: {},
        productsSyncedAt: 'nope',
        orders: [],
        ordersSyncedAt: null,
        picks: [],
        settings: null,
        onboarded: 7,
        aiModelId: true,
      },
    })
    const result = validateSnapshot(snap)
    const joined = result.issues.join('\n')
    expect(joined).toMatch(/data\.invoices/)
    expect(joined).toMatch(/data\.products/)
    expect(joined).toMatch(/data\.productsSyncedAt/)
    expect(joined).toMatch(/data\.picks/)
    expect(joined).toMatch(/data\.settings/)
    expect(joined).toMatch(/data\.onboarded/)
    expect(joined).toMatch(/data\.aiModelId/)
    // null is acceptable for numberOrNull/stringOrNull fields
    expect(joined).not.toMatch(/data\.orders\b/)
    expect(joined).not.toMatch(/data\.ordersSyncedAt/)
  })

  it('returns counts from the data block when present', () => {
    const result = validateSnapshot(goodSnapshot())
    expect(result.issues).toEqual([])
    expect(result.counts).toEqual({ invoices: 1, products: 1, orders: 1 })
  })

  it('reports zero counts when the arrays are absent', () => {
    const result = validateSnapshot(goodSnapshot({ data: {} }))
    expect(result.counts).toEqual({ invoices: 0, products: 0, orders: 0 })
  })
})

describe('applySnapshot — merge mode', () => {
  it('upserts invoices by id and keeps current invoices not in the backup', async () => {
    localStorage.setItem(
      'sip_invoices',
      JSON.stringify([
        { id: 'INV-1', customer: 'Stale Alice' },
        { id: 'INV-9', customer: 'Keep me' },
      ]),
    )

    await applySnapshot(goodSnapshot())

    const out = JSON.parse(localStorage.getItem('sip_invoices'))
    expect(out).toEqual(
      expect.arrayContaining([
        { id: 'INV-1', customer: 'Alice' },
        { id: 'INV-9', customer: 'Keep me' },
      ]),
    )
    expect(out).toHaveLength(2)
  })

  it('shallow-merges settings and picks onto existing values', async () => {
    localStorage.setItem(
      'sip_settings',
      JSON.stringify({ businessName: 'Old Co', theme: 'dark' }),
    )
    localStorage.setItem('sip_picks', JSON.stringify({ o0: { 0: 1 } }))

    await applySnapshot(goodSnapshot())

    expect(JSON.parse(localStorage.getItem('sip_settings'))).toEqual({
      businessName: 'Acme',
      currency: 'GBP',
      theme: 'dark',
    })
    expect(JSON.parse(localStorage.getItem('sip_picks'))).toEqual({
      o0: { 0: 1 },
      o1: { 0: 2 },
    })
  })

  it('overwrites scalar keys when the snapshot has a value and leaves them alone on null', async () => {
    localStorage.setItem('sip_onboarded', 'demo')
    localStorage.setItem('sip_ai_model', 'small')

    await applySnapshot(goodSnapshot({ data: { ...goodSnapshot().data, aiModelId: null } }))

    expect(localStorage.getItem('sip_onboarded')).toBe('real')
    // merge mode with null scalar should not clobber the existing value
    expect(localStorage.getItem('sip_ai_model')).toBe('small')
  })

  it('coerces numeric sync timestamps back to their stored string form', async () => {
    await applySnapshot(goodSnapshot())
    expect(localStorage.getItem('sip_products_synced_at')).toBe('1700000000000')
    expect(localStorage.getItem('sip_orders_synced_at')).toBe('1700000001000')
  })

  it('skips a data key that is missing entirely', async () => {
    localStorage.setItem('sip_products', JSON.stringify([{ id: 99, name: 'Kept' }]))
    const snap = goodSnapshot()
    delete snap.data.products

    await applySnapshot(snap)

    expect(JSON.parse(localStorage.getItem('sip_products'))).toEqual([
      { id: 99, name: 'Kept' },
    ])
  })
})

describe('applySnapshot — replace mode', () => {
  it('wipes every known storage key before writing the snapshot', async () => {
    localStorage.setItem('sip_invoices', JSON.stringify([{ id: 'ZZ' }]))
    localStorage.setItem('sip_settings', JSON.stringify({ theme: 'dark' }))
    localStorage.setItem('sip_picks', JSON.stringify({ oZ: { 0: 9 } }))
    localStorage.setItem('sip_onboarded', 'demo')

    await applySnapshot(goodSnapshot(), { mode: 'replace' })

    expect(JSON.parse(localStorage.getItem('sip_invoices'))).toEqual([
      { id: 'INV-1', customer: 'Alice' },
    ])
    expect(JSON.parse(localStorage.getItem('sip_settings'))).toEqual({
      businessName: 'Acme',
      currency: 'GBP',
    })
    expect(JSON.parse(localStorage.getItem('sip_picks'))).toEqual({ o1: { 0: 2 } })
    expect(localStorage.getItem('sip_onboarded')).toBe('real')
  })

  it('leaves a known key unset when the snapshot has null or omits it', async () => {
    localStorage.setItem('sip_onboarded', 'demo')
    localStorage.setItem('sip_ai_model', 'small')

    const snap = goodSnapshot({
      data: {
        ...goodSnapshot().data,
        onboarded: null,
        aiModelId: null,
      },
    })

    await applySnapshot(snap, { mode: 'replace' })

    expect(localStorage.getItem('sip_onboarded')).toBeNull()
    expect(localStorage.getItem('sip_ai_model')).toBeNull()
  })
})

describe('applySnapshot — secrets handoff', () => {
  it('writes every populated secret via setSecret', async () => {
    const snap = goodSnapshot({
      secrets: {
        sqApiKey: 'sq-1',
        shopifyAccessToken: 'shpat-1',
        byok: { openai: 'sk-1', gemini: '', anthropic: 'an-1' },
      },
    })

    await applySnapshot(snap)

    const calls = setSecretMock.mock.calls.map((c) => c.slice(0, 2))
    expect(calls).toEqual(
      expect.arrayContaining([
        ['sip_sqApiKey', 'sq-1'],
        ['sip_shopifyAccessToken', 'shpat-1'],
        ['sip_byok_openai', 'sk-1'],
        ['sip_byok_anthropic', 'an-1'],
      ]),
    )
    // never writes an empty-string secret
    expect(calls.find(([k]) => k === 'sip_byok_gemini')).toBeUndefined()
  })

  it('never touches secure storage when the snapshot has no secrets block', async () => {
    await applySnapshot(goodSnapshot({ secrets: null }))
    expect(setSecretMock).not.toHaveBeenCalled()
  })
})

describe('applySnapshot — invalid input', () => {
  it('rejects an unknown mode', async () => {
    await expect(applySnapshot(goodSnapshot(), { mode: 'delete' })).rejects.toThrow(/mode/)
  })

  it('rejects a missing data block', async () => {
    await expect(
      applySnapshot({ kind: EXPORT_KIND, version: SCHEMA_VERSION }),
    ).rejects.toThrow(/data/)
  })

  it('rejects a non-object snapshot', async () => {
    await expect(applySnapshot(null)).rejects.toThrow()
    await expect(applySnapshot('nope')).rejects.toThrow()
  })
})
