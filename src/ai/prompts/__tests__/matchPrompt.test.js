import { describe, it, expect, beforeEach } from 'vitest'
import { buildMatchPrompt } from '../matchPrompt.js'
import { saveCorrection, clearCorrections } from '../../../services/correctionStore.js'

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value
    },
    removeItem: (key) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('matchPrompt corrections', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCorrections()
  })

  it('injects hint when correction exists for a batch line', () => {
    saveCorrection({
      originalText: 'blue widget set',
      correctedProductId: 'BW-100',
      correctedProductName: 'Premium Blue Widget',
    })
    const batch = [
      {
        extracted: { text: 'blue widget set', qty: 1, description: '' },
        candidates: [{ id: 'BW-100', name: 'Premium Blue Widget' }],
      },
    ]
    const prompt = buildMatchPrompt({ batch, context: {} })
    expect(prompt).toContain('blue widget set')
    expect(prompt).toContain('BW-100')
    expect(prompt).toContain('previously confirmed')
  })

  it('omits hint when no relevant corrections exist', () => {
    const batch = [
      {
        extracted: { text: 'some random item', qty: 1, description: '' },
        candidates: [{ id: 'X', name: 'Product X' }],
      },
    ]
    const prompt = buildMatchPrompt({ batch, context: {} })
    expect(prompt).not.toContain('previously confirmed')
  })

  it('does not inject hint when correction exists but line does not match', () => {
    saveCorrection({
      originalText: 'blue widget set',
      correctedProductId: 'BW-100',
      correctedProductName: 'Premium Blue Widget',
    })
    const batch = [
      {
        extracted: { text: 'red sprocket', qty: 1, description: '' },
        candidates: [{ id: 'RS-200', name: 'Red Sprocket' }],
      },
    ]
    const prompt = buildMatchPrompt({ batch, context: {} })
    expect(prompt).not.toContain('previously confirmed')
  })

  it('injects hints only for lines that match — not for non-matching lines in same batch', () => {
    saveCorrection({
      originalText: 'blue widget set',
      correctedProductId: 'BW-100',
      correctedProductName: 'Premium Blue Widget',
    })
    const batch = [
      {
        extracted: { text: 'blue widget set', qty: 1, description: '' },
        candidates: [{ id: 'BW-100', name: 'Premium Blue Widget' }],
      },
      {
        extracted: { text: 'red sprocket', qty: 1, description: '' },
        candidates: [{ id: 'RS-200', name: 'Red Sprocket' }],
      },
    ]
    const prompt = buildMatchPrompt({ batch, context: {} })
    expect(prompt).toContain('previously confirmed')
    // Hint should name line 0 (matched), not line 1
    expect(prompt).toContain('Line 0:')
    expect(prompt).not.toContain('Line 1: "red sprocket"')
  })

  it('omits productName from hint when correctedProductName is absent', () => {
    saveCorrection({
      originalText: 'mystery part',
      correctedProductId: 'MP-99',
      correctedProductName: undefined,
    })
    const batch = [
      {
        extracted: { text: 'mystery part', qty: 1, description: '' },
        candidates: [{ id: 'MP-99', name: 'Mystery Part' }],
      },
    ]
    const prompt = buildMatchPrompt({ batch, context: {} })
    expect(prompt).toContain('MP-99')
    // No product name → no quoted name in hint
    expect(prompt).not.toMatch(/"MP-99"\s+"/)
  })

  it('matches correction case-insensitively and after whitespace collapse', () => {
    saveCorrection({
      originalText: 'Blue Widget Set',
      correctedProductId: 'BW-100',
      correctedProductName: 'Premium Blue Widget',
    })
    const batch = [
      {
        extracted: { text: '  blue   widget  set  ', qty: 1, description: '' },
        candidates: [{ id: 'BW-100', name: 'Premium Blue Widget' }],
      },
    ]
    const prompt = buildMatchPrompt({ batch, context: {} })
    expect(prompt).toContain('previously confirmed')
    expect(prompt).toContain('BW-100')
  })
})
