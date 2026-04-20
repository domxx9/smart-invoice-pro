/**
 * BM25-style lexical fallback for `byok`-tier catalogs with no BYOK key
 * configured (SMA-123). A real BM25 ranker is overkill for a fallback that
 * only exists to give the user something useful while they paste in an API
 * key, so this module runs a pared-down tokenize + tf-idf-lite scorer over
 * the product name and description.
 *
 * The output row shape mirrors `runSmartPastePipeline` so callers can
 * surface either backend through the same widget code.
 */

import { cleanWhatsApp, extractItems } from '../helpers.js'

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'set',
  'pair',
  'pack',
  'kit',
  'box',
  'of',
  'to',
  'a',
  'an',
])

const BM25_K1 = 1.2
const BM25_B = 0.75

function tokenize(text) {
  if (!text) return []
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

function buildIndex(products) {
  const docs = products.map((p) => {
    const tokens = tokenize(`${p.name || ''} ${p.desc || ''}`)
    const tf = Object.create(null)
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1
    return { tf, length: tokens.length }
  })
  const df = Object.create(null)
  for (const { tf } of docs) {
    for (const term of Object.keys(tf)) df[term] = (df[term] || 0) + 1
  }
  const avgDocLength =
    docs.length === 0 ? 0 : docs.reduce((sum, d) => sum + d.length, 0) / docs.length
  return { docs, df, avgDocLength, N: docs.length }
}

function scoreDoc(queryTokens, doc, index) {
  if (!doc.length) return 0
  let score = 0
  for (const term of queryTokens) {
    const freq = doc.tf[term]
    if (!freq) continue
    const df = index.df[term] || 0
    const idf = Math.log(1 + (index.N - df + 0.5) / (df + 0.5))
    const norm = 1 - BM25_B + BM25_B * (doc.length / (index.avgDocLength || 1))
    score += idf * ((freq * (BM25_K1 + 1)) / (freq + BM25_K1 * norm))
  }
  return score
}

function bestMatch(line, products, index) {
  const q = tokenize(line?.text || line?.description || '')
  if (!q.length || !products.length) return { product: null, score: 0 }
  let bestIdx = -1
  let bestScore = 0
  for (let i = 0; i < products.length; i++) {
    const s = scoreDoc(q, index.docs[i], index)
    if (s > bestScore) {
      bestScore = s
      bestIdx = i
    }
  }
  return { product: bestIdx === -1 ? null : products[bestIdx], score: bestScore }
}

function scoreToConfidence(score) {
  if (!score) return 0
  const clamped = Math.min(1, score / 10)
  return Math.round(clamped * 100)
}

/**
 * Run the BM25 fallback over a paste.
 *
 * Returns pipeline-shaped rows so callers can render results through the
 * same widget paths used by the SMA-117 stack.
 */
export function runBm25Fallback({ text, products } = {}) {
  const cleaned = cleanWhatsApp(text || '')
  const extracted = extractItems(cleaned)
  const catalogue = Array.isArray(products) ? products : []
  if (!extracted.length) return { extracted: [], rows: [] }
  const index = buildIndex(catalogue)
  const rows = extracted.map((line) => {
    const { product, score } = bestMatch(
      { text: line.name, description: line.raw },
      catalogue,
      index,
    )
    return {
      extracted: {
        text: line.name,
        qty: Math.max(1, Math.floor(line.qty ?? 1)),
        description: line.raw,
      },
      product: product || null,
      confidence: scoreToConfidence(score),
      source: product ? 'bm25' : 'none',
    }
  })
  return { extracted, rows }
}

export const __test = { tokenize, buildIndex, scoreDoc }
