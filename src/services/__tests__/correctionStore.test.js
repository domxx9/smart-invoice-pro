import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveCorrection,
  getCorrections,
  getCorrectionMap,
  clearCorrections,
  getStats,
  normalizeText,
} from '../correctionStore.js'

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

describe('correctionStore', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCorrections()
  })

  describe('normalizeText', () => {
    it('lowercases input', () => {
      expect(normalizeText('RED WIDGET')).toBe('red widget')
    })

    it('trims whitespace', () => {
      expect(normalizeText('  blue widget  ')).toBe('blue widget')
    })

    it('collapses whitespace', () => {
      expect(normalizeText('blue   widget')).toBe('blue widget')
    })

    it('handles null/undefined', () => {
      expect(normalizeText(null)).toBe('')
      expect(normalizeText(undefined)).toBe('')
    })
  })

  describe('saveCorrection', () => {
    it('saves a new correction entry', () => {
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      const entries = getCorrections()
      expect(entries.length).toBe(1)
      expect(entries[0].originalText).toBe('Red Widget')
      expect(entries[0].normalizedText).toBe('red widget')
      expect(entries[0].correctedProductId).toBe('p1')
      expect(entries[0].count).toBe(1)
    })

    it('increments count when same text corrected to same product', () => {
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      const entries = getCorrections()
      expect(entries.length).toBe(1)
      expect(entries[0].count).toBe(2)
    })

    it('creates new entry when same text corrected to different product', () => {
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p2',
        correctedProductName: 'Blue Widget',
      })
      const entries = getCorrections()
      expect(entries.length).toBe(2)
    })

    it('normalizes text before saving', () => {
      saveCorrection({
        originalText: '  RED   widget  ',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      const entries = getCorrections()
      expect(entries[0].normalizedText).toBe('red widget')
      expect(entries[0].originalText).toBe('  RED   widget  ')
    })

    it('ignores entries without originalText or correctedProductId', () => {
      saveCorrection({
        originalText: '',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      expect(getCorrections().length).toBe(0)

      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: '',
        correctedProductName: 'Red Widget',
      })
      expect(getCorrections().length).toBe(0)
    })
  })

  describe('getCorrectionMap', () => {
    it('returns a Map with normalized keys', () => {
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      const map = getCorrectionMap()
      expect(map).toBeInstanceOf(Map)
      expect(map.get('red widget')).toEqual({
        productId: 'p1',
        productName: 'Red Widget',
        count: 1,
      })
    })

    it('returns empty Map when no corrections exist', () => {
      const map = getCorrectionMap()
      expect(map.size).toBe(0)
    })

    it('returns latest correction per normalized text when same text maps to different products', () => {
      const store = {}
      const mockLs = {
        getItem: (key) => store[key] ?? null,
        setItem: (key, value) => {
          store[key] = value
        },
        removeItem: (key) => {
          delete store[key]
        },
        clear: () => {
          Object.keys(store).forEach((k) => delete store[k])
        },
      }
      Object.defineProperty(globalThis, 'localStorage', { value: mockLs })

      const entries = [
        {
          originalText: 'Red Widget',
          normalizedText: 'red widget',
          correctedProductId: 'p1',
          correctedProductName: 'Red Widget',
          timestamp: '2024-01-01T10:00:00.000Z',
          count: 1,
        },
        {
          originalText: 'Red Widget',
          normalizedText: 'red widget',
          correctedProductId: 'p2',
          correctedProductName: 'Blue Widget',
          timestamp: '2024-01-01T12:00:00.000Z',
          count: 1,
        },
        {
          originalText: 'Red Widget',
          normalizedText: 'red widget',
          correctedProductId: 'p3',
          correctedProductName: 'Green Widget',
          timestamp: '2024-01-01T11:00:00.000Z',
          count: 2,
        },
      ]
      mockLs.setItem('sip_correction_history_v1', JSON.stringify(entries))

      const map = getCorrectionMap()
      const entry = map.get('red widget')
      expect(entry.productId).toBe('p2')
      expect(entry.productName).toBe('Blue Widget')
    })
  })

  describe('clearCorrections', () => {
    it('removes all corrections from storage', () => {
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      clearCorrections()
      expect(getCorrections().length).toBe(0)
      expect(getCorrectionMap().size).toBe(0)
    })
  })

  describe('getStats', () => {
    it('returns correct stats for empty store', () => {
      const stats = getStats()
      expect(stats.totalCorrections).toBe(0)
      expect(stats.uniqueMappings).toBe(0)
      expect(stats.lastCorrectionAt).toBeNull()
    })

    it('counts total corrections including repeats', () => {
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      saveCorrection({
        originalText: 'Red Widget',
        correctedProductId: 'p1',
        correctedProductName: 'Red Widget',
      })
      saveCorrection({
        originalText: 'Blue Bolt',
        correctedProductId: 'p2',
        correctedProductName: 'Blue Bolt',
      })
      const stats = getStats()
      expect(stats.totalCorrections).toBe(3)
      expect(stats.uniqueMappings).toBe(2)
      expect(stats.lastCorrectionAt).not.toBeNull()
    })
  })
})
