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
})
