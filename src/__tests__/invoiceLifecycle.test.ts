import { describe, it, expect } from 'vitest'
import {
  STATUSES,
  TRANSITIONS,
  canTransition,
  assertTransition,
  isStatus,
  type InvoiceStatus,
} from '../invoiceLifecycle'

const VALID_EDGES: Array<[InvoiceStatus, InvoiceStatus]> = [
  ['new', 'pending'],
  ['new', 'cancelled'],
  ['pending', 'fulfilled'],
  ['pending', 'cancelled'],
  ['fulfilled', 'paid'],
  ['fulfilled', 'cancelled'],
  ['paid', 'refunded'],
]

function allPairs(): Array<[InvoiceStatus, InvoiceStatus]> {
  const out: Array<[InvoiceStatus, InvoiceStatus]> = []
  for (const a of STATUSES) for (const b of STATUSES) out.push([a, b])
  return out
}

function isValidEdge(from: InvoiceStatus, to: InvoiceStatus) {
  return VALID_EDGES.some(([a, b]) => a === from && b === to)
}

describe('invoiceLifecycle.STATUSES', () => {
  it('contains exactly the six canonical statuses', () => {
    expect([...STATUSES].sort()).toEqual(
      ['cancelled', 'fulfilled', 'new', 'paid', 'pending', 'refunded'].sort(),
    )
  })
})

describe('invoiceLifecycle.TRANSITIONS', () => {
  it('declares an entry for every status', () => {
    for (const s of STATUSES) {
      expect(TRANSITIONS).toHaveProperty(s)
      expect(Array.isArray(TRANSITIONS[s])).toBe(true)
    }
  })

  it('has terminal states refunded and cancelled with no outgoing transitions', () => {
    expect(TRANSITIONS.refunded).toEqual([])
    expect(TRANSITIONS.cancelled).toEqual([])
  })

  it('never targets a non-canonical status', () => {
    for (const s of STATUSES) {
      for (const target of TRANSITIONS[s]) {
        expect(STATUSES).toContain(target)
      }
    }
  })
})

describe('canTransition — valid transitions', () => {
  it.each(VALID_EDGES)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true)
  })

  it('allows no-op self-transitions for every status', () => {
    for (const s of STATUSES) expect(canTransition(s, s)).toBe(true)
  })
})

describe('canTransition — invalid transitions', () => {
  const invalid = allPairs().filter(([f, t]) => f !== t && !isValidEdge(f, t))

  it.each(invalid)('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false)
  })

  it('rejects transitions out of terminal refunded', () => {
    for (const s of STATUSES) if (s !== 'refunded') expect(canTransition('refunded', s)).toBe(false)
  })

  it('rejects transitions out of terminal cancelled', () => {
    for (const s of STATUSES) if (s !== 'cancelled') expect(canTransition('cancelled', s)).toBe(false)
  })

  it('rejects unknown or malformed statuses', () => {
    expect(canTransition('draft', 'new')).toBe(false)
    expect(canTransition('new', 'draft')).toBe(false)
    expect(canTransition(undefined, 'new')).toBe(false)
    expect(canTransition('new', null)).toBe(false)
    expect(canTransition(42, 'paid')).toBe(false)
  })
})

describe('isStatus', () => {
  it('accepts every canonical status', () => {
    for (const s of STATUSES) expect(isStatus(s)).toBe(true)
  })

  it('rejects non-canonical values', () => {
    expect(isStatus('draft')).toBe(false)
    expect(isStatus('')).toBe(false)
    expect(isStatus(undefined)).toBe(false)
    expect(isStatus(null)).toBe(false)
    expect(isStatus(7)).toBe(false)
  })
})

describe('assertTransition', () => {
  it('returns void for valid edges', () => {
    for (const [from, to] of VALID_EDGES) {
      expect(() => assertTransition(from, to)).not.toThrow()
    }
  })

  it('throws with a descriptive message for invalid edges', () => {
    expect(() => assertTransition('paid', 'new')).toThrow(
      /Invalid invoice status transition: paid → new/,
    )
    expect(() => assertTransition('refunded', 'paid')).toThrow(
      /Invalid invoice status transition: refunded → paid/,
    )
  })

  it('throws for unknown statuses', () => {
    expect(() => assertTransition('draft', 'new')).toThrow(/Invalid invoice status transition/)
  })
})
