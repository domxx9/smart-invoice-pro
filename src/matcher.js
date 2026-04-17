import Fuse from 'fuse.js'

const FUSE_OPTIONS = {
  keys: ['name'],
  includeScore: true,
  threshold: 0.5,
  ignoreLocation: true,
  minMatchCharLength: 2,
}

// Fuse returns 0 (perfect) … 1 (worst). Invert to a 0–100 confidence.
const scoreToConfidence = (score) => Math.round((1 - score) * 100)

let _cachedProducts = null
let _cachedFuse = null

function getIndex(products) {
  if (products === _cachedProducts && _cachedFuse) return _cachedFuse
  _cachedProducts = products
  _cachedFuse = new Fuse(products || [], FUSE_OPTIONS)
  return _cachedFuse
}

// Forces a rebuild on the next call — use after catalogue sync.
export function invalidateProductIndex() {
  _cachedProducts = null
  _cachedFuse = null
}

export function matchProduct(name, products) {
  const query = (name || '').trim()
  if (!query || !products || !products.length) return null
  const [hit] = getIndex(products).search(query, { limit: 1 })
  if (!hit) return null
  return {
    id: hit.item.id ?? null,
    name: hit.item.name,
    score: scoreToConfidence(hit.score),
  }
}

export function getTopCandidates(name, products, n = 5) {
  const query = (name || '').trim()
  if (!query || !products || !products.length) return []
  return getIndex(products)
    .search(query, { limit: n })
    .map((r) => r.item)
}

export function matchItems(extracted, products) {
  const index = products && products.length ? getIndex(products) : null
  return extracted.map(({ raw, name, qty }) => {
    const query = (name || '').trim()
    const [hit] = index && query ? index.search(query, { limit: 1 }) : []
    if (!hit) return { raw, name, qty, product: null, bestGuess: null, confidence: 0 }
    const pct = scoreToConfidence(hit.score)
    return {
      raw,
      name,
      qty,
      product: pct >= 80 ? hit.item : null,
      bestGuess: pct >= 30 && pct < 80 ? hit.item : null,
      confidence: pct,
    }
  })
}
