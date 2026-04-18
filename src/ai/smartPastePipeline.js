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
import { logger } from '../utils/logger.js'

const MATCH_BATCH_SIZE = 2

export function safeParseJsonArray(text, { schema } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'empty response' }
  }
  const stripped = stripCodeFences(text)
  const start = stripped.indexOf('[')
  if (start === -1) return { ok: false, error: 'no JSON array found' }

  const end = stripped.lastIndexOf(']')
  if (end !== -1 && end > start) {
    const direct = parseAndValidate(stripped.slice(start, end + 1), schema)
    if (direct.ok) return direct
    // Fall through to salvage — the closing `]` might belong to a truncated
    // object that JSON.parse can't handle.
  }

  // Salvage: walk from `[` char-by-char, string- and brace-aware, tracking
  // the position of the last fully closed top-level `}`. If we find at least
  // one, slice up to there and append `]` so JSON.parse can handle the tail.
  const sliceEnd = findLastCompleteObjectEnd(stripped, start)
  if (sliceEnd === -1) return { ok: false, error: 'no JSON array found' }

  const salvaged = parseAndValidate(`${stripped.slice(start, sliceEnd + 1)}]`, schema)
  if (!salvaged.ok) return salvaged
  return { ...salvaged, salvaged: true }
}

function parseAndValidate(slice, schema) {
  let parsed
  try {
    parsed = JSON.parse(slice)
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

// Walks the response char-by-char starting after `[`, tracking string state
// (so a `}` inside a quoted value can't close an object) and brace depth.
// Returns the index of the last `}` that dropped depth back to 0 at the top
// level, or -1 if no object has closed yet.
function findLastCompleteObjectEnd(text, arrayStart) {
  let depth = 0
  let inString = false
  let escaped = false
  let lastComplete = -1
  for (let i = arrayStart + 1; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (c === '\\') {
        escaped = true
        continue
      }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') {
      depth++
      continue
    }
    if (c === '}') {
      depth--
      if (depth === 0) lastComplete = i
    }
  }
  return lastComplete
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

function describeRawResponse(raw) {
  const str = typeof raw === 'string' ? raw : ''
  return {
    rawLength: str.length,
    head: str.slice(0, 60),
    tail: str.length > 60 ? str.slice(-60) : '',
  }
}

function normalizeExtracted(items) {
  return items.map((item) => ({
    text: item.text,
    qty: Math.max(1, Math.floor(item.qty)),
    description: item.description,
  }))
}

// Length-cap stop reasons across the BYOK providers we support. Matches are
// case-insensitive so OpenAI's 'length', Gemini's 'MAX_TOKENS', and
// Anthropic's 'max_tokens' all count.
const LENGTH_CAP_STOP_REASONS = new Set(['length', 'max_tokens', 'max-tokens'])

function isLengthCapStopReason(reason) {
  return typeof reason === 'string' && LENGTH_CAP_STOP_REASONS.has(reason.toLowerCase())
}

async function invokeExtract({ prompt, maxTokens, runInference }) {
  let result
  try {
    result = await runInference({ prompt, maxTokens })
  } catch (err) {
    const message = String(err?.message ?? err)
    logger.warn('smartPaste.stage1_runtime_error', { message })
    return { kind: 'runtime', message }
  }
  const raw = typeof result === 'string' ? result : result?.text
  const stopReason = typeof result === 'object' && result ? (result.stopReason ?? null) : null
  const parsed = safeParseJsonArray(raw, { schema: isExtractedLine })
  if (!parsed.ok) return { kind: 'parse_failed', reason: parsed.error, raw, stopReason }
  return {
    kind: 'parsed',
    value: parsed.value,
    salvaged: !!parsed.salvaged,
    raw,
    stopReason,
  }
}

function emitTruncationLogIfNeeded(extractResult) {
  if (!extractResult.salvaged) return
  if (!isLengthCapStopReason(extractResult.stopReason)) return
  logger.warn('smartPaste.stage1_truncated', {
    stopReason: extractResult.stopReason,
    rawLength: (extractResult.raw ?? '').length,
    salvagedItems: extractResult.value.length,
  })
}

export async function extractLineItems({ text, context, runInference, maxTokens = 1024 } = {}) {
  if (typeof runInference !== 'function') {
    throw new Error('extractLineItems: runInference is required')
  }
  if (typeof text !== 'string' || !text.trim()) return { items: [], callCount: 0 }
  const prompt = buildExtractPrompt({ text, context })

  const first = await invokeExtract({ prompt, maxTokens, runInference })
  if (first.kind === 'runtime') return { items: [], callCount: 1 }
  if (first.kind === 'parsed') {
    emitTruncationLogIfNeeded(first)
    return { items: normalizeExtracted(first.value), callCount: 1 }
  }

  logger.warn('smartPaste.stage1_parse_failed', { reason: first.reason })
  logger.debug('smartPaste.stage1_parse_failed_shape', describeRawResponse(first.raw))
  logger.info('smartPaste.stage1_retry_attempt')

  const second = await invokeExtract({ prompt, maxTokens, runInference })
  if (second.kind === 'runtime') {
    logger.warn('smartPaste.stage1_retry_failed', { reason: `runtime: ${second.message}` })
    return { items: [], callCount: 2 }
  }
  if (second.kind === 'parsed') {
    logger.info('smartPaste.stage1_retry_succeeded')
    emitTruncationLogIfNeeded(second)
    return { items: normalizeExtracted(second.value), callCount: 2 }
  }

  logger.warn('smartPaste.stage1_retry_failed', { reason: second.reason })
  logger.debug('smartPaste.stage1_parse_failed_shape', describeRawResponse(second.raw))
  return { items: [], callCount: 2 }
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

  logger.info('smartPaste.stage1_start')
  emit({ stage: 'extract' })
  let extractResult
  try {
    extractResult = await extractLineItems({ text, context, runInference })
  } catch (error) {
    logger.warn('smartPaste.stage1_runtime_error', { message: String(error?.message ?? error) })
    emit({ stage: 'extract', error })
    logger.info('smartPaste.pipeline_complete', { fallback: true, callCount: 1 })
    return { extracted: [], rows: [], callCount: 1, fallback: true }
  }

  const extracted = extractResult.items
  const stage1CallCount = Math.max(extractResult.callCount, 1)

  if (!extracted.length) {
    logger.warn('smartPaste.stage1_empty')
    logger.info('smartPaste.pipeline_complete', { fallback: true, callCount: stage1CallCount })
    return { extracted: [], rows: [], callCount: stage1CallCount, fallback: true }
  }
  logger.info('smartPaste.stage1_complete', {
    extracted: extracted.length,
    callCount: stage1CallCount,
  })

  const filtered = filterCandidates({ extracted, products })
  const batches = chunk(filtered, MATCH_BATCH_SIZE)

  const rows = filtered.map((entry) => ({
    extracted: entry.extracted,
    product: null,
    confidence: 0,
    source: 'fuzzy',
  }))
  let callCount = stage1CallCount

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const offset = batchIndex * MATCH_BATCH_SIZE
    callCount += 1
    logger.info('smartPaste.stage3_batch_start', { batchIndex, totalBatches: batches.length })
    emit({ stage: 'match', batchIndex, totalBatches: batches.length })
    let matches
    try {
      matches = await matchBatch({ batch, context, runInference })
    } catch (error) {
      logger.warn('smartPaste.stage3_batch_failed', {
        batchIndex,
        message: String(error?.message ?? error),
      })
      emit({ stage: 'match', batchIndex, totalBatches: batches.length, error })
      continue
    }
    logger.info('smartPaste.stage3_batch_complete', {
      batchIndex,
      totalBatches: batches.length,
      matched: matches.length,
    })
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

  logger.info('smartPaste.pipeline_complete', { fallback: false, callCount })
  return { extracted, rows, callCount, fallback: false }
}
