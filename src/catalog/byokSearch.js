/**
 * `byok`-tier catalog search (SMA-123).
 *
 * Used when the synced catalog exceeds `LOCAL_TIER_MAX_PARENTS` and a BYOK
 * API key is configured. Unlike the SMA-117 hybrid pipeline — which leans
 * on the on-device Fuse index — this path skips local indexing and sends
 * catalog references straight to the user's BYOK LLM. Acceptable for large
 * catalogs because the per-call prompt stays bounded by chunking, and
 * avoiding an on-device vector index is the whole reason we push this tier
 * to the cloud.
 *
 * Kept intentionally thin: Stage 1 reuses `extractLineItems` from the
 * shared pipeline, then each extracted line gets a single LLM call with a
 * chunk of catalog refs. Upstream widget code treats the returned row
 * shape the same as `runSmartPastePipeline`.
 */

import { extractLineItems, safeParseJsonArray } from '../ai/smartPastePipeline.js'
import { logger } from '../utils/logger.js'
import { getCorrectionMap } from '../services/correctionStore.js'

export const BYOK_CATALOG_CHUNK_SIZE = 200
const STAGE_MATCH_MAX_TOKENS = 256
const MAX_CORRECTIONS = 20

function projectProductRef(p) {
  return {
    id: String(p?.id ?? ''),
    name: p?.name ?? '',
    sku: p?.sku ?? '',
    price: p?.price ?? 0,
  }
}

function buildByokMatchPrompt({ line, catalogChunk, context }) {
  const ctx = context ? `Business context: ${JSON.stringify(context)}\n` : ''
  const correctionMap = getCorrectionMap()
  let correctionsBlock = ''
  if (correctionMap.size) {
    const sorted = [...correctionMap.entries()].sort(
      (a, b) => (b[1].count ?? 0) - (a[1].count ?? 0),
    )
    const top = sorted.slice(0, MAX_CORRECTIONS)
    const lines = top.map(([originalText, { productId, productName }]) => {
      const name = productName ? ` (${productName})` : ''
      return `- "${originalText}" → "${productId}"${name}`
    })
    correctionsBlock =
      '## Known product corrections (user-verified mappings)\n' + lines.join('\n') + '\n\n'
  }
  return [
    `${ctx}${correctionsBlock}You are matching a customer order line to a product catalog.`,
    `Order line: "${line.text}" (quantity ${line.qty}).`,
    `Candidates (id, name, sku, price):`,
    JSON.stringify(catalogChunk),
    `Return a single JSON array with one object: [{"productId": "<id or null>", "confidence": <0-100>}]`,
    `If no candidate matches, use null for productId.`,
  ].join('\n')
}

function chunk(items, size) {
  if (size <= 0) return [items.slice()]
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function findProduct(products, productId) {
  if (!productId) return null
  return products.find((p) => String(p.id) === String(productId)) || null
}

async function matchLineAgainstCatalog({ line, products, runInference, context, chunkSize }) {
  const chunks = chunk(products, chunkSize)
  let best = { productId: null, confidence: 0 }
  for (let i = 0; i < chunks.length; i++) {
    const prompt = buildByokMatchPrompt({
      line,
      catalogChunk: chunks[i].map(projectProductRef),
      context,
    })
    let raw
    try {
      const result = await runInference({ prompt, maxTokens: STAGE_MATCH_MAX_TOKENS })
      raw = typeof result === 'string' ? result : result?.text
    } catch (err) {
      logger.warn('catalogSearch.byok_chunk_failed', {
        message: String(err?.message ?? err),
        chunkIndex: i,
      })
      continue
    }
    const parsed = safeParseJsonArray(raw)
    if (!parsed.ok) continue
    const candidate = parsed.value[0]
    if (!candidate || typeof candidate !== 'object') continue
    const confidence = Number.isFinite(candidate.confidence) ? Number(candidate.confidence) : 0
    if (confidence > best.confidence) {
      best = { productId: candidate.productId ?? null, confidence }
    }
  }
  return best
}

export async function runByokCatalogSearch({
  text,
  products,
  context,
  runInference,
  onStage,
  chunkSize = BYOK_CATALOG_CHUNK_SIZE,
} = {}) {
  if (typeof runInference !== 'function') {
    throw new Error('runByokCatalogSearch: runInference is required')
  }
  const emit = typeof onStage === 'function' ? onStage : () => {}
  const catalogue = Array.isArray(products) ? products : []

  emit({ stage: 'extract' })
  const extractResult = await extractLineItems({ text, context, runInference })
  const extracted = extractResult.items
  if (!extracted.length) {
    const fallbackReason = extractResult.timedOut ? 'stage1_timeout' : null
    return {
      extracted: [],
      rows: [],
      fallback: true,
      mode: 'byok',
      ...(fallbackReason ? { fallbackReason } : {}),
    }
  }

  const rows = []
  for (let i = 0; i < extracted.length; i++) {
    const line = extracted[i]
    emit({ stage: 'match', batchIndex: i, totalBatches: extracted.length })
    const best = await matchLineAgainstCatalog({
      line,
      products: catalogue,
      runInference,
      context,
      chunkSize,
    })
    const product = findProduct(catalogue, best.productId)
    rows.push({
      extracted: line,
      product,
      confidence: Math.max(0, Math.min(100, Math.round(best.confidence))),
      source: product ? 'ai' : 'none',
    })
  }

  return { extracted, rows, mode: 'byok' }
}
