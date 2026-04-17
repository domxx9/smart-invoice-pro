/**
 * Smart Paste pipeline (SMA-56 Stages 1-3) — framework-free orchestrator.
 *
 * The widget owns the React/UI state; this module only owns the data flow:
 *   Stage 1 (extract)  - one LLM call to parse the raw paste into line items
 *   Stage 2 (filter)   - local fuzzy search to pick top-N catalogue candidates
 *   Stage 3 (match)    - batched LLM calls (<=2 lines each) that pick a product
 *
 * Caller passes `runInference` so the pipeline stays decoupled from the AI
 * backend (BYOK vs. on-device Gemma vs. test stub). All stages are pure async
 * functions; the orchestrator wires them together and reports per-stage events
 * via `onStage` for the widget's spinners.
 */

import { getTopCandidates } from '../matcher.js'
import { buildExtractPrompt } from './prompts/extractPrompt.js'
import { buildMatchPrompt } from './prompts/matchPrompt.js'

const MATCH_BATCH_SIZE = 2

export function safeParseJsonArray(text, { schema } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'empty response' }
  }
  const stripped = stripCodeFences(text)
  const start = stripped.indexOf('[')
  const end = stripped.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, error: 'no JSON array found' }
  }
  let parsed
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1))
  } catch (e) {
    return { ok: false, error: `JSON parse failed: ${e.message}` }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'parsed value is not an array' }
  }
  if (typeof schema === 'function') {
    for (let i = 0; i < parsed.length; i++) {
      const result = schema(parsed[i], i)
      if (result !== true) {
        return { ok: false, error: typeof result === 'string' ? result : `bad shape at index ${i}` }
      }
    }
  }
  return { ok: true, value: parsed }
}

function stripCodeFences(text) {
  return text
    .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
    .replace(/```/g, '')
    .trim()
}

function isExtractedLine(item) {
  if (!item || typeof item !== 'object') return 'item is not an object'
  if (typeof item.text !== 'string') return 'text is not a string'
  if (typeof item.qty !== 'number' || !Number.isFinite(item.qty))
    return 'qty is not a finite number'
  if (typeof item.description !== 'string') return 'description is not a string'
  return true
}

function isMatchResult(item) {
  if (!item || typeof item !== 'object') return 'item is not an object'
  if (typeof item.lineIndex !== 'number' || !Number.isInteger(item.lineIndex)) {
    return 'lineIndex is not an integer'
  }
  if (item.productId !== null && typeof item.productId !== 'string') {
    return 'productId is not string|null'
  }
  if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence)) {
    return 'confidence is not a finite number'
  }
  return true
}

export async function extractLineItems({ text, context, runInference, maxTokens = 1024 } = {}) {
  if (typeof runInference !== 'function') {
    throw new Error('extractLineItems: runInference is required')
  }
  if (typeof text !== 'string' || !text.trim()) return []
  const prompt = buildExtractPrompt({ text, context })
  let result
  try {
    result = await runInference({ prompt, maxTokens })
  } catch {
    return []
  }
  const raw = typeof result === 'string' ? result : result?.text
  const parsed = safeParseJsonArray(raw, { schema: isExtractedLine })
  if (!parsed.ok) return []
  return parsed.value.map((item) => ({
    text: item.text,
    qty: Math.max(1, Math.floor(item.qty)),
    description: item.description,
  }))
}

export function filterCandidates({ extracted, products, topN = 50 } = {}) {
  const lines = Array.isArray(extracted) ? extracted : []
  const catalogue = Array.isArray(products) ? products : []
  return lines.map((line) => ({
    extracted: line,
    candidates: getTopCandidates(line?.text || '', catalogue, topN),
  }))
}

export async function matchBatch({ batch, context, runInference, maxTokens = 512 } = {}) {
  if (typeof runInference !== 'function') {
    throw new Error('matchBatch: runInference is required')
  }
  const lines = Array.isArray(batch) ? batch : []
  if (!lines.length) return []
  const prompt = buildMatchPrompt({ batch: lines, context })
  const result = await runInference({ prompt, maxTokens })
  const raw = typeof result === 'string' ? result : result?.text
  const parsed = safeParseJsonArray(raw, { schema: isMatchResult })
  if (!parsed.ok) {
    throw new Error(`matchBatch: ${parsed.error}`)
  }
  return parsed.value
}

function chunk(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function findCandidate(candidates, productId) {
  if (!productId || !Array.isArray(candidates)) return null
  return candidates.find((c) => String(c?.id) === String(productId)) || null
}

export async function runSmartPastePipeline({
  text,
  products,
  context,
  runInference,
  onStage,
} = {}) {
  if (typeof runInference !== 'function') {
    throw new Error('runSmartPastePipeline: runInference is required')
  }
  const emit = typeof onStage === 'function' ? onStage : () => {}

  emit({ stage: 'extract' })
  let extracted
  try {
    extracted = await extractLineItems({ text, context, runInference })
  } catch (error) {
    emit({ stage: 'extract', error })
    return { extracted: [], rows: [], callCount: 1, fallback: true }
  }

  if (!extracted.length) {
    return { extracted: [], rows: [], callCount: 1, fallback: true }
  }

  const filtered = filterCandidates({ extracted, products })
  const batches = chunk(filtered, MATCH_BATCH_SIZE)

  const rows = filtered.map((entry) => ({
    extracted: entry.extracted,
    product: null,
    confidence: 0,
    source: 'fuzzy',
  }))
  let callCount = 1

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const offset = batchIndex * MATCH_BATCH_SIZE
    callCount += 1
    emit({ stage: 'match', batchIndex, totalBatches: batches.length })
    let matches
    try {
      matches = await matchBatch({ batch, context, runInference })
    } catch (error) {
      emit({ stage: 'match', batchIndex, totalBatches: batches.length, error })
      continue
    }
    for (const m of matches) {
      const localIdx = m.lineIndex
      if (!Number.isInteger(localIdx) || localIdx < 0 || localIdx >= batch.length) continue
      const targetIdx = offset + localIdx
      const candidates = batch[localIdx]?.candidates
      const product = findCandidate(candidates, m.productId)
      if (product) {
        rows[targetIdx] = {
          extracted: batch[localIdx].extracted,
          product,
          confidence: Math.max(0, Math.min(100, Math.round(m.confidence))),
          source: 'ai',
        }
      } else {
        rows[targetIdx] = {
          extracted: batch[localIdx].extracted,
          product: null,
          confidence: Math.max(0, Math.min(100, Math.round(m.confidence))),
          source: 'none',
        }
      }
    }
  }

  return { extracted, rows, callCount, fallback: false }
}
