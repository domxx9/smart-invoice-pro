import Fuse from 'fuse.js'
import { normalizeText, EXTENDED_STOPWORDS } from './helpers.js'
import {
  getCorrectionMap,
  normalizeText as correctionNormalize,
} from './services/correctionStore.js'

const FUSE_OPTIONS = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'keywords', weight: 0.2 },
    { name: 'desc', weight: 0.1 },
  ],
  includeScore: true,
  threshold: 0.5,
  ignoreLocation: true,
  minMatchCharLength: 2,
}

// Kept narrow (+ container-ish words) for the Fuse-facing `keywords` field so
// SMA-98 indexing behaviour is unchanged.
const KEYWORD_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'set', 'pair', 'pack', 'kit'])
// Union of SMA-118 EXTENDED_STOPWORDS + the old container words — used for
// bag-of-words tokenization so permutation-invariant scoring ignores the same
// filler the smart-paste pipeline already strips. Built lazily to avoid a
// TDZ in the helpers.js ↔ matcher.js re-export cycle.
let _bagStopwordsCache = null
function getBagStopwords() {
  if (_bagStopwordsCache) return _bagStopwordsCache
  _bagStopwordsCache = new Set([...EXTENDED_STOPWORDS, 'set', 'pair', 'pack', 'kit'])
  return _bagStopwordsCache
}

// Fuse returns 0 (perfect) … 1 (worst). Invert to a 0–100 confidence.
const scoreToConfidence = (score) => Math.round((1 - score) * 100)

// Per-token Fuse score must be at least this good for the token to count as
// matched in the bag scorer. Sits just under Fuse's own 0.5 cutoff so 1-char
// typos on short tokens (widget/wrench) still count.
const PER_TOKEN_FUSE_THRESHOLD = 0.45

function tokenize(s) {
  if (s == null) return []
  const stop = getBagStopwords()
  return normalizeText(String(s))
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !stop.has(t))
}

// Keywords are stored as a single space-joined string (not an array) so Fuse
// does one bitap scan per product per key instead of one per token. That keeps
// the 500-item perf smoke test close to the 1-key baseline.
function deriveKeywords(name, desc) {
  const source = `${name || ''} ${desc || ''}`.toLowerCase()
  const seen = new Set()
  for (const token of source.split(/[^a-z0-9]+/)) {
    if (token.length < 3 || KEYWORD_STOPWORDS.has(token)) continue
    seen.add(token)
  }
  return Array.from(seen).join(' ')
}

let _cachedProducts = null
let _cachedFuse = null
let _cachedTokenSets = null
let _indexedOriginals = null

function getIndex(products) {
  if (products === _cachedProducts && _cachedFuse) {
    return { fuse: _cachedFuse, originals: _indexedOriginals, tokenSets: _cachedTokenSets }
  }
  const originals = products || []
  const indexed = originals.map((p) => ({
    ...p,
    keywords: deriveKeywords(p.name, p.desc),
  }))
  const tokenSets = originals.map((p) => new Set([...tokenize(p.name), ...tokenize(p.desc)]))
  _cachedProducts = products
  _cachedFuse = new Fuse(indexed, FUSE_OPTIONS)
  _indexedOriginals = originals
  _cachedTokenSets = tokenSets
  return { fuse: _cachedFuse, originals, tokenSets }
}

// Forces a rebuild on the next call — use after catalogue sync.
export function invalidateProductIndex() {
  _cachedProducts = null
  _cachedFuse = null
  _cachedTokenSets = null
  _indexedOriginals = null
}

// Bag-of-words rank: matched-token-count / query-token-count is the displayed
// confidence; ties break by summed (1 - per-token Fuse score). Exact set-hit
// first (cheap), then per-token Fuse pass picks up typos against the same
// weighted index the whole-query Fuse uses.
function bagRank(queryTokens, ctx, limit) {
  const { fuse, originals, tokenSets } = ctx
  const matchCounts = new Array(originals.length).fill(0)
  const subScoreSums = new Array(originals.length).fill(0)
  for (const qt of queryTokens) {
    const matchedThisToken = new Set()
    for (let i = 0; i < tokenSets.length; i++) {
      if (tokenSets[i].has(qt)) {
        matchedThisToken.add(i)
        matchCounts[i] += 1
        subScoreSums[i] += 1
      }
    }
    const hits = fuse.search(qt, { limit: originals.length })
    for (const hit of hits) {
      if (matchedThisToken.has(hit.refIndex)) continue
      if (hit.score > PER_TOKEN_FUSE_THRESHOLD) continue
      matchedThisToken.add(hit.refIndex)
      matchCounts[hit.refIndex] += 1
      subScoreSums[hit.refIndex] += 1 - hit.score
    }
  }
  const ranked = []
  for (let i = 0; i < originals.length; i++) {
    if (matchCounts[i] === 0) continue
    ranked.push({ refIndex: i, matched: matchCounts[i], sub: subScoreSums[i] })
  }
  ranked.sort((a, b) => b.matched - a.matched || b.sub - a.sub)
  return ranked.slice(0, limit)
}

const confFromBag = (matched, qTokenCount) => Math.round((matched / Math.max(qTokenCount, 1)) * 100)

function singleTokenFuseHit(query, ctx) {
  const [hit] = ctx.fuse.search(query, { limit: 1 })
  if (!hit) return null
  return { refIndex: hit.refIndex, confidence: scoreToConfidence(hit.score) }
}

export function matchProduct(name, products) {
  const query = (name || '').trim()
  if (!query || !products || !products.length) return null
  const ctx = getIndex(products)
  const qTokens = tokenize(query)
  if (qTokens.length <= 1) {
    const hit = singleTokenFuseHit(query, ctx)
    if (!hit) return null
    const original = ctx.originals[hit.refIndex]
    return { id: original.id ?? null, name: original.name, score: hit.confidence }
  }
  const [top] = bagRank(qTokens, ctx, 1)
  if (!top) return null
  const original = ctx.originals[top.refIndex]
  return {
    id: original.id ?? null,
    name: original.name,
    score: confFromBag(top.matched, qTokens.length),
  }
}

export function getTopCandidates(name, products, n = 5, context) {
  const query = (name || '').trim()
  if (!query || !products || !products.length) return []
  const ctx = getIndex(products)
  const qTokens = tokenize(query)
  if (qTokens.length <= 1) {
    const hits = ctx.fuse.search(query, { limit: n })
    if (!context) return hits.map((r) => ctx.originals[r.refIndex])
    return contextRerank(
      hits.map((r) => ({ product: ctx.originals[r.refIndex], tier: Math.round(r.score * 20) })),
      context,
    )
  }
  const ranked = bagRank(qTokens, ctx, n)
  if (!context) return ranked.map((r) => ctx.originals[r.refIndex])
  return contextRerank(
    ranked.map((r) => ({ product: ctx.originals[r.refIndex], tier: -r.matched })),
    context,
  )
}

function contextRerank(items, { productType, vocabulary }) {
  const vocabTokens = vocabulary ? tokenize(vocabulary) : []
  return items
    .map((item, i) => {
      let boost = 0
      const p = item.product
      if (productType && p.category === productType) boost += 1
      if (vocabTokens.length > 0) {
        const pTokens = new Set(tokenize(`${p.name || ''} ${p.desc || ''}`))
        boost += vocabTokens.filter((t) => pTokens.has(t)).length
      }
      return { product: p, tier: item.tier, boost, i }
    })
    .sort((a, b) => a.tier - b.tier || b.boost - a.boost || a.i - b.i)
    .map(({ product }) => product)
}

export function matchItems(extracted, products) {
  const correctionMap = getCorrectionMap()
  const ctx = products && products.length ? getIndex(products) : null
  return extracted.map(({ raw, name, qty }) => {
    const query = (name || '').trim()
    if (!query) return { raw, name, qty, product: null, bestGuess: null, confidence: 0 }

    const normalized = correctionNormalize(query)
    const correction = correctionMap.get(normalized)
    if (correction) {
      const product = products.find((p) => p.id === correction.productId)
      if (product) {
        return {
          raw,
          name,
          qty,
          product,
          bestGuess: null,
          confidence: Math.min(95, 80 + correction.count * 3),
          source: 'correction',
        }
      }
    }

    if (!ctx) return { raw, name, qty, product: null, bestGuess: null, confidence: 0 }
    const qTokens = tokenize(query)
    let pct = 0
    let original = null
    if (qTokens.length <= 1) {
      const hit = singleTokenFuseHit(query, ctx)
      if (hit) {
        pct = hit.confidence
        original = ctx.originals[hit.refIndex]
      }
    } else {
      const [top] = bagRank(qTokens, ctx, 1)
      if (top) {
        pct = confFromBag(top.matched, qTokens.length)
        original = ctx.originals[top.refIndex]
      }
    }
    if (!original) return { raw, name, qty, product: null, bestGuess: null, confidence: 0 }
    return {
      raw,
      name,
      qty,
      product: pct >= 80 ? original : null,
      bestGuess: pct >= 30 && pct < 80 ? original : null,
      confidence: pct,
    }
  })
}
