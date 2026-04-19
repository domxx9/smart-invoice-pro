import Fuse from 'fuse.js'

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

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'set', 'pair', 'pack', 'kit'])

// Keywords are stored as a single space-joined string (not an array) so Fuse
// does one bitap scan per product per key instead of one per token. That keeps
// the 500-item perf smoke test close to the 1-key baseline.
function deriveKeywords(name, desc) {
  const source = `${name || ''} ${desc || ''}`.toLowerCase()
  const seen = new Set()
  for (const token of source.split(/[^a-z0-9]+/)) {
    if (token.length < 3 || STOPWORDS.has(token)) continue
    seen.add(token)
  }
  return Array.from(seen).join(' ')
}

// Fuse returns 0 (perfect) … 1 (worst). Invert to a 0–100 confidence.
const scoreToConfidence = (score) => Math.round((1 - score) * 100)

let _cachedProducts = null
let _cachedFuse = null
let _indexedOriginals = null

function getIndex(products) {
  if (products === _cachedProducts && _cachedFuse) {
    return { fuse: _cachedFuse, originals: _indexedOriginals }
  }
  const originals = products || []
  const indexed = originals.map((p) => ({
    ...p,
    keywords: deriveKeywords(p.name, p.desc),
  }))
  _cachedProducts = products
  _cachedFuse = new Fuse(indexed, FUSE_OPTIONS)
  _indexedOriginals = originals
  return { fuse: _cachedFuse, originals }
}

// Forces a rebuild on the next call — use after catalogue sync.
export function invalidateProductIndex() {
  _cachedProducts = null
  _cachedFuse = null
  _indexedOriginals = null
}

export function matchProduct(name, products) {
  const query = (name || '').trim()
  if (!query || !products || !products.length) return null
  const { fuse, originals } = getIndex(products)
  const [hit] = fuse.search(query, { limit: 1 })
  if (!hit) return null
  const original = originals[hit.refIndex]
  return {
    id: original.id ?? null,
    name: original.name,
    score: scoreToConfidence(hit.score),
  }
}

export function getTopCandidates(name, products, n = 5) {
  const query = (name || '').trim()
  if (!query || !products || !products.length) return []
  const { fuse, originals } = getIndex(products)
  return fuse.search(query, { limit: n }).map((r) => originals[r.refIndex])
}

export function matchItems(extracted, products) {
  const ctx = products && products.length ? getIndex(products) : null
  return extracted.map(({ raw, name, qty }) => {
    const query = (name || '').trim()
    const [hit] = ctx && query ? ctx.fuse.search(query, { limit: 1 }) : []
    if (!hit) return { raw, name, qty, product: null, bestGuess: null, confidence: 0 }
    const pct = scoreToConfidence(hit.score)
    const original = ctx.originals[hit.refIndex]
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
