import { describe, it, expect, beforeEach } from 'vitest'
import { buildExtractPrompt } from '../extractPrompt.js'
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

describe('extractPrompt corrections', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCorrections()
  })

  it('includes corrections section when corrections exist', () => {
    saveCorrection({
      originalText: 'blue widget set',
      correctedProductId: 'BW-100',
      correctedProductName: 'Premium Blue Widget',
    })
    const prompt = buildExtractPrompt({ text: 'test message', context: {} })
    expect(prompt).toContain('Known product corrections')
    expect(prompt).toContain('blue widget set')
    expect(prompt).toContain('BW-100')
  })

  it('omits corrections section when no corrections exist', () => {
    const prompt = buildExtractPrompt({ text: 'test message', context: {} })
    expect(prompt).not.toContain('Known product corrections')
  })

  it('caps corrections at 20', () => {
    for (let i = 1; i <= 25; i++) {
      saveCorrection({
        originalText: `term ${i}`,
        correctedProductId: `product-${i}`,
        correctedProductName: `Product ${i}`,
      })
    }
    const prompt = buildExtractPrompt({ text: 'test message', context: {} })
    const lines = prompt.split('\n')
    const correctionLines = lines.filter((l) => l.startsWith('- "term '))
    expect(correctionLines.length).toBe(20)
  })

  it('sorts corrections by count descending', () => {
    saveCorrection({
      originalText: 'low count',
      correctedProductId: 'p1',
      correctedProductName: 'Low Count',
    })
    for (let i = 0; i < 5; i++) {
      saveCorrection({
        originalText: 'high count',
        correctedProductId: 'p2',
        correctedProductName: 'High Count',
      })
    }
    const prompt = buildExtractPrompt({ text: 'test message', context: {} })
    const highIdx = prompt.indexOf('high count')
    const lowIdx = prompt.indexOf('low count')
    expect(highIdx).toBeLessThan(lowIdx)
  })

  it('omits productName parens when correctedProductName is absent', () => {
    saveCorrection({
      originalText: 'mystery sku',
      correctedProductId: 'SKU-X',
      correctedProductName: undefined,
    })
    const prompt = buildExtractPrompt({ text: 'test', context: {} })
    expect(prompt).toContain('SKU-X')
    expect(prompt).not.toContain('SKU-X (')
  })

  it('JSON-encodes special chars in correction originalText', () => {
    saveCorrection({
      originalText: 'widget "deluxe"',
      correctedProductId: 'WD-1',
      correctedProductName: 'Widget Deluxe',
    })
    const prompt = buildExtractPrompt({ text: 'test', context: {} })
    // JSON.stringify wraps with quotes and escapes inner quotes
    expect(prompt).toContain('"widget \\"deluxe\\""')
  })

  it('corrections stanza appears before customer message block', () => {
    saveCorrection({
      originalText: 'anchor term',
      correctedProductId: 'A1',
      correctedProductName: 'Anchor',
    })
    const prompt = buildExtractPrompt({ text: 'buy anchor term', context: {} })
    const corrIdx = prompt.indexOf('Known product corrections')
    const msgIdx = prompt.indexOf('<customer_message>')
    expect(corrIdx).toBeGreaterThanOrEqual(0)
    expect(corrIdx).toBeLessThan(msgIdx)
  })
})
