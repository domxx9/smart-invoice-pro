/**
 * Product dictionary + typo repair tests (SMA-120).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  buildDictionary,
  signatureForProducts,
  loadCachedDictionary,
  saveCachedDictionary,
  invalidateCachedDictionary,
  repairTokens,
  levenshtein,
  tokenizeQuery,
} from '../productDictionary.js'

const PRODUCTS = [
  {
    id: 'p1',
    name: 'Blue Widget',
    desc: 'Standard size widget in blue',
    keywords: 'blue widget standard size',
  },
  {
    id: 'p2',
    name: 'Red Widget',
    desc: 'Standard size widget in red',
    keywords: 'red widget standard size',
  },
  {
    id: 'p3',
    name: 'Steel Scissors',
    desc: 'Heavy duty scissors',
    keywords: 'steel scissors heavy duty',
  },
  {
    id: 'p4',
    name: 'Hammer Pro',
    desc: 'Pro-grade carpentry hammer',
    keywords: 'hammer carpentry',
  },
]

describe('buildDictionary', () => {
  it('extracts tokens from name, desc, and keywords (lowercased)', () => {
    const dict = buildDictionary(PRODUCTS)
    expect(dict.tokens.has('blue')).toBe(true)
    expect(dict.tokens.has('widget')).toBe(true)
    expect(dict.tokens.has('scissors')).toBe(true)
    expect(dict.tokens.has('carpentry')).toBe(true)
    expect(dict.tokens.has('hammer')).toBe(true)
  })

  it('drops stopwords and tokens shorter than 3 chars', () => {
    const dict = buildDictionary([{ id: 'p1', name: 'a the and big PI', desc: 'kit pack of x' }])
    expect(dict.tokens.has('the')).toBe(false)
    expect(dict.tokens.has('and')).toBe(false)
    expect(dict.tokens.has('kit')).toBe(false)
    expect(dict.tokens.has('pack')).toBe(false)
    expect(dict.tokens.has('big')).toBe(true)
    // 2-char tokens excluded
    expect(dict.tokens.has('pi')).toBe(false)
    expect(dict.tokens.has('a')).toBe(false)
  })

  it('buckets tokens by length for fast lookup', () => {
    const dict = buildDictionary(PRODUCTS)
    const fourLen = dict.byLength.get(4)
    expect(fourLen).toBeInstanceOf(Set)
    expect(fourLen.has('blue')).toBe(true)
    expect(dict.byLength.get(8).has('scissors')).toBe(true)
  })

  it('handles empty / non-array / null inputs', () => {
    expect(buildDictionary(null).size).toBe(0)
    expect(buildDictionary([]).size).toBe(0)
    expect(buildDictionary([null, undefined, {}]).size).toBe(0)
  })

  it('produces a stable signature that changes when catalog content changes', () => {
    const a = buildDictionary(PRODUCTS).signature
    const b = buildDictionary(PRODUCTS).signature
    expect(a).toBe(b)
    const mutated = [...PRODUCTS, { id: 'p5', name: 'Green Widget' }]
    expect(buildDictionary(mutated).signature).not.toBe(a)
  })
})

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('blue', 'blue')).toBe(0)
  })
  it('counts single char substitution', () => {
    expect(levenshtein('bleu', 'blue')).toBe(2) // swap is 2 ops in Levenshtein
  })
  it('counts deletions and insertions', () => {
    expect(levenshtein('scisors', 'scissors')).toBe(1)
    expect(levenshtein('hammr', 'hammer')).toBe(1)
  })
  it('returns maxDistance+1 once row min exceeds the threshold', () => {
    const d = levenshtein('aaaa', 'zzzzzzzz', 2)
    expect(d).toBeGreaterThan(2)
  })
})

describe('tokenizeQuery', () => {
  it('lowercases, splits on non-alnum, drops short and stopword tokens', () => {
    expect(tokenizeQuery('5 BLUE Widgets, please!')).toEqual(['blue', 'widgets', 'please'])
    expect(tokenizeQuery('a the and')).toEqual([])
  })
})

describe('repairTokens', () => {
  let dict
  beforeEach(() => {
    dict = buildDictionary(PRODUCTS)
  })

  it('passes through tokens that are already in the dictionary', async () => {
    const result = await repairTokens(['blue', 'widget'], dict)
    expect(result.tokens).toEqual(['blue', 'widget'])
    expect(result.repairs).toEqual([])
    expect(result.unresolved).toEqual([])
  })

  it("repairs 'bleu' → 'blue' deterministically (no AI)", async () => {
    const result = await repairTokens(['bleu', 'widget'], dict)
    expect(result.tokens).toEqual(['blue', 'widget'])
    expect(result.repairs).toEqual([
      expect.objectContaining({ from: 'bleu', to: 'blue', source: 'dict' }),
    ])
  })

  it("repairs 'scisors' → 'scissors' deterministically (no AI)", async () => {
    const result = await repairTokens(['scisors'], dict)
    expect(result.tokens).toEqual(['scissors'])
    expect(result.repairs[0]).toMatchObject({ from: 'scisors', to: 'scissors', source: 'dict' })
  })

  it('leaves unrelated tokens alone and reports them as unresolved', async () => {
    const result = await repairTokens(['quantumcompiler'], dict)
    expect(result.tokens).toEqual(['quantumcompiler'])
    expect(result.unresolved).toEqual(['quantumcompiler'])
    expect(result.repairs).toEqual([])
  })

  it('skips tokens shorter than the dictionary minimum and stopwords', async () => {
    const result = await repairTokens(['xy', 'the', 'blue'], dict)
    expect(result.tokens).toEqual(['xy', 'the', 'blue'])
    expect(result.repairs).toEqual([])
    expect(result.unresolved).toEqual([])
  })

  it('respects maxDistance to avoid loose matches', async () => {
    // 'cra' → no token within 2 edits of 'red'/'blue'/etc — leave unresolved
    const result = await repairTokens(['cra'], dict, { maxDistance: 1 })
    expect(result.repairs).toEqual([])
    expect(result.unresolved).toContain('cra')
  })

  it('keeps original casing intact for tokens that pass through', async () => {
    const result = await repairTokens(['Blue', 'WIDGET'], dict)
    expect(result.tokens).toEqual(['blue', 'widget'])
  })

  it('does NOT call runInference when unique repair is available', async () => {
    const runInference = vi.fn()
    const result = await repairTokens(['bleu'], dict, { aiMode: 'small', runInference })
    expect(result.tokens).toEqual(['blue'])
    expect(runInference).not.toHaveBeenCalled()
  })

  describe('AI escalation', () => {
    let ambigDict
    beforeEach(() => {
      // Two equidistant candidates: 'red' and 'rid' both 1 edit from 'rad'.
      ambigDict = buildDictionary([
        { id: 'a', name: 'Red Token Name' },
        { id: 'b', name: 'Rid Token Name' },
      ])
    })

    it('does not escalate when aiMode === "off"', async () => {
      const runInference = vi.fn()
      const result = await repairTokens(['rad'], ambigDict, { aiMode: 'off', runInference })
      expect(runInference).not.toHaveBeenCalled()
      expect(result.unresolved).toContain('rad')
      expect(result.tokens).toEqual(['rad'])
    })

    it('escalates ambiguous repairs when aiMode != "off" and uses the model verdict', async () => {
      const runInference = vi.fn().mockResolvedValue({ text: 'red', source: 'test' })
      const result = await repairTokens(['rad'], ambigDict, {
        aiMode: 'small',
        runInference,
      })
      expect(runInference).toHaveBeenCalledTimes(1)
      const promptArg = runInference.mock.calls[0][0]?.prompt
      expect(promptArg).toContain('rad')
      expect(promptArg).toMatch(/red/)
      expect(promptArg).toMatch(/rid/)
      expect(result.tokens).toEqual(['red'])
      expect(result.repairs[0]).toMatchObject({ from: 'rad', to: 'red', source: 'ai' })
    })

    it('falls back to unresolved when AI replies NONE', async () => {
      const runInference = vi.fn().mockResolvedValue({ text: 'NONE' })
      const result = await repairTokens(['rad'], ambigDict, {
        aiMode: 'small',
        runInference,
      })
      expect(result.tokens).toEqual(['rad'])
      expect(result.unresolved).toContain('rad')
      expect(result.repairs).toEqual([])
    })

    it('falls back to unresolved when AI returns a token outside the candidate list', async () => {
      const runInference = vi.fn().mockResolvedValue({ text: 'blue' })
      const result = await repairTokens(['rad'], ambigDict, {
        aiMode: 'small',
        runInference,
      })
      expect(result.tokens).toEqual(['rad'])
      expect(result.repairs).toEqual([])
    })

    it('caches AI verdicts when caller passes a Map', async () => {
      const runInference = vi.fn().mockResolvedValue({ text: 'red' })
      const cache = new Map()
      const first = await repairTokens(['rad'], ambigDict, {
        aiMode: 'small',
        runInference,
        cache,
      })
      expect(first.repairs[0].source).toBe('ai')
      const second = await repairTokens(['rad'], ambigDict, {
        aiMode: 'small',
        runInference,
        cache,
      })
      expect(runInference).toHaveBeenCalledTimes(1)
      expect(second.tokens).toEqual(['red'])
      expect(second.repairs[0].source).toBe('cache')
    })

    it('swallows runInference errors and leaves token unresolved', async () => {
      const runInference = vi.fn().mockRejectedValue(new Error('boom'))
      const result = await repairTokens(['rad'], ambigDict, {
        aiMode: 'small',
        runInference,
      })
      expect(result.tokens).toEqual(['rad'])
      expect(result.unresolved).toContain('rad')
    })
  })
})

describe('localStorage cache round-trip', () => {
  let store

  beforeEach(() => {
    const data = new Map()
    store = {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
    }
  })

  it('saves + restores dictionary tokens when signature matches', () => {
    const dict = buildDictionary(PRODUCTS)
    expect(saveCachedDictionary(dict, store)).toBe(true)
    const restored = loadCachedDictionary(dict.signature, store)
    expect(restored).not.toBeNull()
    expect(restored.size).toBe(dict.size)
    expect(restored.tokens.has('blue')).toBe(true)
    expect(restored.byLength.get(8)?.has('scissors')).toBe(true)
  })

  it('returns null when signature mismatches (catalog drift)', () => {
    const dict = buildDictionary(PRODUCTS)
    saveCachedDictionary(dict, store)
    expect(loadCachedDictionary('different-signature', store)).toBeNull()
  })

  it('invalidate clears the cache', () => {
    const dict = buildDictionary(PRODUCTS)
    saveCachedDictionary(dict, store)
    invalidateCachedDictionary(store)
    expect(loadCachedDictionary(dict.signature, store)).toBeNull()
  })

  it('returns null on load when getItem throws (storage corrupted/locked)', () => {
    const throwingStore = {
      getItem: () => {
        throw new Error('locked')
      },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(loadCachedDictionary('sig', throwingStore)).toBeNull()
  })

  it('survives storage exceptions on save (quota etc.)', () => {
    const throwingStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    expect(saveCachedDictionary(buildDictionary(PRODUCTS), throwingStore)).toBe(false)
  })

  it('uses globalThis.localStorage when no storage is passed (jsdom)', () => {
    const dict = buildDictionary(PRODUCTS)
    invalidateCachedDictionary()
    saveCachedDictionary(dict)
    const restored = loadCachedDictionary(dict.signature)
    expect(restored).not.toBeNull()
    expect(restored.size).toBe(dict.size)
    invalidateCachedDictionary()
  })
})

describe('signatureForProducts', () => {
  it('is empty-product safe', () => {
    expect(typeof signatureForProducts([])).toBe('string')
    expect(typeof signatureForProducts(null)).toBe('string')
  })
})
