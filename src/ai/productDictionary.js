/**
 * Product dictionary + typo repair (SMA-117c / SMA-120).
 *
 * `buildDictionary(products)` extracts a Set of canonical tokens from each
 * product's name, description, and matcher-derived keywords (SMA-98). Tokens
 * are bucketed by length so `repairTokens` can run a length-bounded
 * Levenshtein lookup instead of scanning the whole dictionary per query.
 *
 * `repairTokens(queryTokens, dict, opts)` walks each query token and:
 *   - keeps it as-is if the dictionary already contains it
 *   - repairs deterministically when exactly one nearest dictionary token
 *     sits within `maxDistance` (default 2)
 *   - escalates to `runInference` when the lookup is ambiguous AND the
 *     caller passes `aiMode != 'off'` — the AI is constrained to choose
 *     from the candidate list (or NONE)
 *
 * The caller owns AI verdict caching by passing a Map; we key by
 * `${dict.signature}|${token}` so a Squarespace catalog sync invalidates
 * verdicts naturally when the dictionary signature changes.
 *
 * Persistent localStorage cache lets us skip rebuilding the dictionary on
 * cold start; the catalog signature gates reuse so a sync forces a rebuild.
 */

import { logger } from '../utils/logger.js'

// Mirrors matcher.js — same min length and stopword set so the dictionary
// stays aligned with the keywords the Fuse index already derives.
const MIN_TOKEN_LEN = 3
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'set', 'pair', 'pack', 'kit'])

const CACHE_VERSION = 1
const CACHE_KEY = `sip_product_dict_v${CACHE_VERSION}`
const DEFAULT_MAX_DISTANCE = 2
const AI_MAX_CANDIDATES = 5

function tokenize(text) {
  if (!text) return []
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function isDictionaryToken(token) {
  return typeof token === 'string' && token.length >= MIN_TOKEN_LEN && !STOPWORDS.has(token)
}

function bucketByLength(tokens) {
  const byLength = new Map()
  for (const t of tokens) {
    let bucket = byLength.get(t.length)
    if (!bucket) {
      bucket = new Set()
      byLength.set(t.length, bucket)
    }
    bucket.add(t)
  }
  return byLength
}

// Stable FNV-1a over id|name|desc|keywords. Cheap (no crypto), deterministic
// across reloads, and changes whenever any catalog field changes.
export function signatureForProducts(products) {
  const list = Array.isArray(products) ? products : []
  let h = 0x811c9dc5
  for (const p of list) {
    if (!p) continue
    const s = `${p.id ?? ''}|${p.name ?? ''}|${p.desc ?? ''}|${p.keywords ?? ''}\u0001`
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return `v${CACHE_VERSION}-${list.length}-${h.toString(16)}`
}

export function buildDictionary(products, opts = {}) {
  const list = Array.isArray(products) ? products : []
  const tokens = new Set()
  for (const p of list) {
    if (!p) continue
    for (const t of tokenize(p.name)) if (isDictionaryToken(t)) tokens.add(t)
    for (const t of tokenize(p.desc)) if (isDictionaryToken(t)) tokens.add(t)
    if (typeof p.keywords === 'string') {
      // matcher.js space-joins keywords; lowercase them defensively
      for (const t of p.keywords.toLowerCase().split(/\s+/)) {
        if (isDictionaryToken(t)) tokens.add(t)
      }
    }
  }
  const signature = typeof opts.signature === 'string' ? opts.signature : signatureForProducts(list)
  return {
    tokens,
    byLength: bucketByLength(tokens),
    signature,
    size: tokens.size,
  }
}

function resolveStorage(storage) {
  if (storage) return storage
  if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage
  return null
}

export function loadCachedDictionary(signature, storage) {
  const store = resolveStorage(storage)
  if (!store || typeof signature !== 'string' || !signature) return null
  let raw
  try {
    raw = store.getItem(CACHE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || parsed.signature !== signature || !Array.isArray(parsed.tokens)) return null
  const tokens = new Set(parsed.tokens.filter((t) => typeof t === 'string'))
  return {
    tokens,
    byLength: bucketByLength(tokens),
    signature,
    size: tokens.size,
  }
}

export function saveCachedDictionary(dict, storage) {
  const store = resolveStorage(storage)
  if (!store || !dict || !dict.tokens) return false
  try {
    store.setItem(
      CACHE_KEY,
      JSON.stringify({ signature: dict.signature, tokens: Array.from(dict.tokens) }),
    )
    return true
  } catch {
    return false
  }
}

export function invalidateCachedDictionary(storage) {
  const store = resolveStorage(storage)
  if (!store) return
  try {
    store.removeItem(CACHE_KEY)
  } catch {
    /* best-effort cache eviction */
  }
}

// Length-bounded Levenshtein with row-min early exit. Returns `maxDistance+1`
// (rather than the true distance) once it can prove the result exceeds the
// threshold — callers treat that as "too far" without needing the exact value.
export function levenshtein(a, b, maxDistance = Infinity) {
  if (a === b) return 0
  const al = a.length
  const bl = b.length
  if (Math.abs(al - bl) > maxDistance) return maxDistance + 1
  if (al === 0) return bl
  if (bl === 0) return al
  let prev = new Array(bl + 1)
  let curr = new Array(bl + 1)
  for (let j = 0; j <= bl; j++) prev[j] = j
  for (let i = 1; i <= al; i++) {
    curr[0] = i
    let rowMin = curr[0]
    const ac = a.charCodeAt(i - 1)
    for (let j = 1; j <= bl; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1
      const v = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
      curr[j] = v
      if (v < rowMin) rowMin = v
    }
    if (rowMin > maxDistance) return maxDistance + 1
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[bl]
}

function nearestCandidates(token, dict, maxDistance) {
  if (dict.tokens.has(token)) return { exact: true, distance: 0, candidates: [token] }
  let bestDistance = Infinity
  let candidates = []
  const minLen = Math.max(1, token.length - maxDistance)
  const maxLen = token.length + maxDistance
  for (let len = minLen; len <= maxLen; len++) {
    const bucket = dict.byLength.get(len)
    if (!bucket) continue
    for (const candidate of bucket) {
      const d = levenshtein(token, candidate, maxDistance)
      if (d > maxDistance) continue
      if (d < bestDistance) {
        bestDistance = d
        candidates = [candidate]
      } else if (d === bestDistance) {
        candidates.push(candidate)
      }
    }
  }
  if (!candidates.length) return { exact: false, distance: Infinity, candidates: [] }
  return { exact: false, distance: bestDistance, candidates }
}

function repairCacheKey(signature, token) {
  return `${signature || 'no-sig'}|${token}`
}

export async function repairTokens(queryTokens, dict, opts = {}) {
  const tokens = Array.isArray(queryTokens) ? queryTokens : []
  const repairs = []
  const unresolved = []
  if (!dict || !dict.tokens || dict.tokens.size === 0) {
    return { tokens: tokens.slice(), repairs, unresolved }
  }
  const maxDistance = Number.isFinite(opts.maxDistance) ? opts.maxDistance : DEFAULT_MAX_DISTANCE
  const aiMode = typeof opts.aiMode === 'string' ? opts.aiMode : 'off'
  const runInference = typeof opts.runInference === 'function' ? opts.runInference : null
  const cache = opts.cache instanceof Map ? opts.cache : null
  const out = []

  for (const original of tokens) {
    const token = typeof original === 'string' ? original.toLowerCase() : ''
    if (!token || token.length < MIN_TOKEN_LEN || STOPWORDS.has(token)) {
      out.push(original)
      continue
    }
    const cacheKey = cache ? repairCacheKey(dict.signature, token) : null
    if (cacheKey && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)
      if (cached && typeof cached.token === 'string' && cached.token !== token) {
        repairs.push({ from: token, to: cached.token, source: 'cache' })
      }
      out.push(cached?.token || original)
      continue
    }

    const { exact, distance, candidates } = nearestCandidates(token, dict, maxDistance)
    if (exact) {
      if (cacheKey) cache.set(cacheKey, { token })
      out.push(token)
      continue
    }
    if (!candidates.length) {
      unresolved.push(token)
      out.push(original)
      continue
    }
    if (candidates.length === 1) {
      const repaired = candidates[0]
      if (cacheKey) cache.set(cacheKey, { token: repaired })
      repairs.push({ from: token, to: repaired, distance, source: 'dict' })
      out.push(repaired)
      continue
    }
    // Ambiguous lookup — multiple dictionary tokens at the same edit distance.
    if (aiMode !== 'off' && runInference) {
      let chosen = null
      try {
        chosen = await aiPickRepair({
          token,
          candidates,
          runInference,
          context: opts.context,
        })
      } catch (err) {
        logger.warn('productDict.ai_repair_failed', {
          token,
          message: String(err?.message ?? err),
        })
      }
      if (chosen && dict.tokens.has(chosen)) {
        if (cacheKey) cache.set(cacheKey, { token: chosen })
        repairs.push({ from: token, to: chosen, distance, source: 'ai' })
        out.push(chosen)
        continue
      }
    }
    // Ambiguous and no AI verdict — leave the token alone but record the
    // shortlist so the caller can decide whether to widen the search later.
    unresolved.push(token)
    out.push(original)
  }
  return { tokens: out, repairs, unresolved }
}

async function aiPickRepair({ token, candidates, runInference, context }) {
  const shortlist = candidates.slice(0, AI_MAX_CANDIDATES)
  const numbered = shortlist.map((c, i) => `${i + 1}. ${c}`).join('\n')
  const ctxLine = typeof context === 'string' && context.trim() ? `Context: ${context.trim()}` : ''
  const prompt = [
    ctxLine,
    `User typed "${token}" — likely a typo of one of these catalog terms:`,
    numbered,
    "Reply with exactly one of the listed terms in lowercase and nothing else. If none fits the user's intent, reply with the single word NONE.",
  ]
    .filter(Boolean)
    .join('\n')
  const result = await runInference({ prompt, maxTokens: 16 })
  const raw = typeof result === 'string' ? result : result?.text
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().toLowerCase().split(/\s+/)[0] || ''
  if (!cleaned || cleaned === 'none') return null
  return shortlist.find((c) => c === cleaned) || null
}

// Lower-case + strip non-alphanumerics like the matcher does, then drop
// stopwords/short tokens that the dictionary itself would never store.
export function tokenizeQuery(text) {
  return tokenize(text).filter(isDictionaryToken)
}

export const __test__ = { MIN_TOKEN_LEN, STOPWORDS, CACHE_KEY, DEFAULT_MAX_DISTANCE }
