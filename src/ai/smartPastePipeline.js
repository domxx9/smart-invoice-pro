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
import { repairTokens, tokenizeQuery } from './productDictionary.js'
import { logger } from '../utils/logger.js'

const MATCH_BATCH_SIZE = 2

// Parse a JSON array out of a possibly-noisy model response. Tries a clean
// parse first, then falls through to truncation salvage when the response
// is cut off before its closing `]` (or a `]` is present but the tail
// doesn't parse — some providers emit a stray bracket after a truncated
// object). On salvage, the result is marked `salvaged: true` so callers
// can log or react differently (e.g. SMA-71 `stage1_truncated`).
export function safeParseJsonArray(text, { schema } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'empty response' }
  }
  const stripped = stripCodeFences(text)
  const start = stripped.indexOf('[')
  if (start === -1) {
    return { ok: false, error: 'no JSON array found' }
  }
  const end = stripped.lastIndexOf(']')
  if (end !== -1 && end >= start) {
    const clean = parseAndValidateArray(stripped.slice(start, end + 1), schema)
    if (clean.ok) return { ok: true, value: clean.value }
    // A schema failure on a cleanly-parsed array is the final word — salvage
    // would only drop items the caller has already rejected. Only truncation-
    // style parse errors fall through.
    if (!clean.parseError) return { ok: false, error: clean.error }
  }
  const salvage = salvagePartialJsonArray(stripped, { schema })
  if (salvage.ok) {
    return {
      ok: true,
      value: salvage.value,
      salvaged: true,
      salvagedCount: salvage.salvagedCount,
      attemptedCount: salvage.attemptedCount,
    }
  }
  return { ok: false, error: end === -1 ? 'no JSON array found' : salvage.error }
}

function parseAndValidateArray(slice, schema) {
  let parsed
  try {
    parsed = JSON.parse(slice)
  } catch (e) {
    return { ok: false, error: `JSON parse failed: ${e.message}`, parseError: true }
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

// Recover complete objects from a JSON array that was cut off before its
// closing `]`. Walks the response char-by-char (string- and brace-aware),
// slices up to the last fully closed top-level object, then appends `]` so
// JSON.parse succeeds. Schema-invalid items are dropped rather than failing
// the whole salvage.
function salvagePartialJsonArray(text, { schema } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'empty response' }
  }
  const start = text.indexOf('[')
  if (start === -1) return { ok: false, error: 'no array start' }

  let depth = 0
  let inString = false
  let escaped = false
  let lastCompleteEnd = -1

  for (let i = start + 1; i < text.length; i++) {
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
      if (depth === 0) lastCompleteEnd = i
      continue
    }
    // A top-level `]` after a completed object means the array closed
    // cleanly — the caller's clean-parse path already handled that case,
    // so salvage refuses to run.
    if (c === ']' && depth === 0 && lastCompleteEnd !== -1) {
      return { ok: false, error: 'array already closed' }
    }
  }

  if (lastCompleteEnd === -1) return { ok: false, error: 'no complete object to salvage' }

  const candidate = `${text.slice(start, lastCompleteEnd + 1)}]`
  let parsed
  try {
    parsed = JSON.parse(candidate)
  } catch (e) {
    return { ok: false, error: `salvage parse failed: ${e.message}` }
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'salvage value is not an array' }

  const validated =
    typeof schema === 'function' ? parsed.filter((item) => schema(item) === true) : parsed
  if (!validated.length) return { ok: false, error: 'salvage yielded zero valid items' }

  return {
    ok: true,
    value: validated,
    salvagedCount: validated.length,
    attemptedCount: parsed.length,
  }
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

async function invokeExtract({ prompt, maxTokens, runInference }) {
  let result
  try {
    result = await runInference({ prompt, maxTokens })
  } catch (err) {
    const message = String(err?.message ?? err)
    // SMA-78: wall-clock timeout surfaces as a distinct kind so the
    // orchestrator can skip retry (no point burning another 60s) and
    // surface a fallbackReason the widget can hand to the user.
    if (err?.code === 'stage1_timeout') {
      logger.warn('smartPaste.stage1_timeout', {
        message,
        timeoutMs: err?.timeoutMs ?? null,
      })
      return { kind: 'timeout', message, timeoutMs: err?.timeoutMs ?? null }
    }
    logger.warn('smartPaste.stage1_runtime_error', { message })
    return { kind: 'runtime', message }
  }
  const raw = typeof result === 'string' ? result : result?.text
  const stopReason =
    result && typeof result === 'object' && 'stopReason' in result ? result.stopReason : null
  const parsed = safeParseJsonArray(raw, { schema: isExtractedLine })
  if (!parsed.ok) return { kind: 'parse_failed', reason: parsed.error, raw, stopReason }
  return {
    kind: 'parsed',
    value: parsed.value,
    raw,
    stopReason,
    salvaged: parsed.salvaged === true,
    salvagedCount: parsed.salvagedCount,
    attemptedCount: parsed.attemptedCount,
  }
}

// Provider-reported stop reasons that mean the generation hit its token cap
// mid-response. OpenAI → 'length', Anthropic → 'max_tokens', Gemini →
// 'MAX_TOKENS'. Compared case-insensitively so casing differences across
// providers/models don't silently bypass the check.
const LENGTH_CAP_STOP_REASONS = new Set(['length', 'max_tokens', 'max-tokens'])

function isLengthCapStopReason(stopReason) {
  if (typeof stopReason !== 'string' || !stopReason) return false
  return LENGTH_CAP_STOP_REASONS.has(stopReason.toLowerCase())
}

function reportSalvaged(attempt, parsed) {
  logger.info('smartPaste.stage1_salvaged', {
    attempt,
    salvagedCount: parsed.salvagedCount,
    attemptedCount: parsed.attemptedCount,
  })
  if (isLengthCapStopReason(parsed.stopReason)) {
    logger.warn('smartPaste.stage1_truncated', {
      stopReason: parsed.stopReason,
      rawLength: typeof parsed.raw === 'string' ? parsed.raw.length : 0,
      salvagedItems: parsed.value.length,
    })
  }
}

// Stage 1 LLM budget. 2048 tokens gives ~8 KB of JSON room — comfortable
// for a 20-item paste — and salvage recovers complete items if the model
// truncates anyway.
const STAGE1_DEFAULT_MAX_TOKENS = 2048

export async function extractLineItems({
  text,
  context,
  runInference,
  maxTokens = STAGE1_DEFAULT_MAX_TOKENS,
} = {}) {
  if (typeof runInference !== 'function') {
    throw new Error('extractLineItems: runInference is required')
  }
  if (typeof text !== 'string' || !text.trim()) return { items: [], callCount: 0 }
  const prompt = buildExtractPrompt({ text, context })

  const first = await invokeExtract({ prompt, maxTokens, runInference })
  if (first.kind === 'runtime') return { items: [], callCount: 1 }
  // Fail-fast on timeout: a second 60s budget on a model that just hung
  // helps no one, and the UI needs to offer BYOK immediately (SMA-78).
  if (first.kind === 'timeout') {
    return { items: [], callCount: 1, timedOut: true, timeoutMs: first.timeoutMs }
  }
  if (first.kind === 'parsed') {
    if (first.salvaged) reportSalvaged('first', first)
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
  if (second.kind === 'timeout') {
    logger.warn('smartPaste.stage1_retry_failed', { reason: `timeout: ${second.message}` })
    return { items: [], callCount: 2, timedOut: true, timeoutMs: second.timeoutMs }
  }
  if (second.kind === 'parsed') {
    if (second.salvaged) reportSalvaged('retry', second)
    logger.info('smartPaste.stage1_retry_succeeded')
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

// SMA-120: when Stage 2 returns zero candidates for a line, retry with
// dictionary-repaired tokens before paying for an LLM call. Mutates
// `entry.candidates` in place when a repair surfaces new hits and records
// the repair on `entry.repairs` so the orchestrator can log/audit it.
async function repairFilteredEntry({ entry, products, topN, productDictionary, repairOpts }) {
  if (!entry || !productDictionary || !Array.isArray(products) || !products.length) return null
  if (entry.candidates && entry.candidates.length) return null
  const text = entry.extracted?.text || ''
  const queryTokens = tokenizeQuery(text)
  if (!queryTokens.length) return null
  const result = await repairTokens(queryTokens, productDictionary, repairOpts)
  if (!result.repairs.length) return null
  const repairedQuery = result.tokens.filter(Boolean).join(' ').trim()
  if (!repairedQuery || repairedQuery === queryTokens.join(' ')) return null
  const candidates = getTopCandidates(repairedQuery, products, topN)
  if (!candidates.length) return null
  entry.candidates = candidates
  entry.repairs = result.repairs
  entry.repairedQuery = repairedQuery
  return result
}

// Stage 3 LLM budget. 512 tokens covers a 2-line match-batch comfortably;
// the response shape is small (one object per line). Salvage still kicks
// in via safeParseJsonArray if a provider truncates anyway.
const STAGE3_DEFAULT_MAX_TOKENS = 512

export async function matchBatch({
  batch,
  context,
  runInference,
  maxTokens = STAGE3_DEFAULT_MAX_TOKENS,
} = {}) {
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

async function invokeMatch({ prompt, maxTokens, runInference }) {
  let result
  try {
    result = await runInference({ prompt, maxTokens })
  } catch (err) {
    const message = String(err?.message ?? err)
    return { kind: 'runtime', message }
  }
  const raw = typeof result === 'string' ? result : result?.text
  const stopReason =
    result && typeof result === 'object' && 'stopReason' in result ? result.stopReason : null
  const parsed = safeParseJsonArray(raw, { schema: isMatchResult })
  if (!parsed.ok) return { kind: 'parse_failed', reason: parsed.error, raw, stopReason }
  return { kind: 'parsed', value: parsed.value, raw, stopReason }
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
  productDictionary,
  repairOpts,
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
    const fallbackReason = extractResult.timedOut ? 'stage1_timeout' : null
    if (!extractResult.timedOut) logger.warn('smartPaste.stage1_empty')
    logger.info('smartPaste.pipeline_complete', {
      fallback: true,
      callCount: stage1CallCount,
      ...(fallbackReason ? { fallbackReason } : {}),
    })
    return {
      extracted: [],
      rows: [],
      callCount: stage1CallCount,
      fallback: true,
      ...(fallbackReason ? { fallbackReason } : {}),
    }
  }
  logger.info('smartPaste.stage1_complete', {
    extracted: extracted.length,
    callCount: stage1CallCount,
  })

  const filtered = filterCandidates({ extracted, products })

  let dictionaryRepairs = 0
  if (productDictionary) {
    for (const entry of filtered) {
      const repaired = await repairFilteredEntry({
        entry,
        products,
        topN: 50,
        productDictionary,
        repairOpts,
      })
      if (repaired) {
        dictionaryRepairs += repaired.repairs.length
        logger.info('smartPaste.dictionary_repair', {
          original: entry.extracted?.text,
          repairs: repaired.repairs,
          repairedQuery: entry.repairedQuery,
        })
      }
    }
  }

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
    const totalBatches = batches.length
    callCount += 1
    logger.info('smartPaste.stage3_batch_start', { batchIndex, totalBatches })
    emit({ stage: 'match', batchIndex, totalBatches })

    const prompt = buildMatchPrompt({ batch, context })
    const first = await invokeMatch({ prompt, maxTokens: STAGE3_DEFAULT_MAX_TOKENS, runInference })

    let matches = null
    if (first.kind === 'parsed') {
      matches = first.value
    } else if (first.kind === 'runtime') {
      // Runtime errors (rate limit, network) skip retry — Stage 1 follows the
      // same rule. The orchestrator surfaces them via stage3_batch_failed.
      logger.warn('smartPaste.stage3_batch_failed', { batchIndex, message: first.message })
      emit({
        stage: 'match',
        batchIndex,
        totalBatches,
        error: new Error(first.message),
      })
      continue
    } else {
      // parse_failed: log the response shape (SMA-70 stage1 mirror) and one
      // paraphrased retry. Same rule as Stage 1: stopReason lets us tell
      // truncation, refusal, and shape errors apart in the trace.
      logger.warn('smartPaste.stage3_parse_failed', { batchIndex, reason: first.reason })
      logger.debug('smartPaste.stage3_parse_failed_shape', {
        batchIndex,
        stopReason: first.stopReason,
        ...describeRawResponse(first.raw),
      })
      logger.info('smartPaste.stage3_retry_attempt', { batchIndex })

      callCount += 1
      const second = await invokeMatch({
        prompt,
        maxTokens: STAGE3_DEFAULT_MAX_TOKENS,
        runInference,
      })
      if (second.kind === 'parsed') {
        logger.info('smartPaste.stage3_retry_succeeded', { batchIndex })
        matches = second.value
      } else if (second.kind === 'runtime') {
        logger.warn('smartPaste.stage3_batch_failed', {
          batchIndex,
          message: `runtime: ${second.message}`,
        })
        emit({
          stage: 'match',
          batchIndex,
          totalBatches,
          error: new Error(second.message),
        })
        continue
      } else {
        logger.warn('smartPaste.stage3_batch_failed', {
          batchIndex,
          message: `matchBatch: ${second.reason}`,
        })
        logger.debug('smartPaste.stage3_parse_failed_shape', {
          batchIndex,
          stopReason: second.stopReason,
          ...describeRawResponse(second.raw),
        })
        emit({
          stage: 'match',
          batchIndex,
          totalBatches,
          error: new Error(`matchBatch: ${second.reason}`),
        })
        continue
      }
    }

    logger.info('smartPaste.stage3_batch_complete', {
      batchIndex,
      totalBatches,
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

  logger.info('smartPaste.pipeline_complete', {
    fallback: false,
    callCount,
    ...(dictionaryRepairs ? { dictionaryRepairs } : {}),
  })
  return {
    extracted,
    rows,
    callCount,
    fallback: false,
    ...(dictionaryRepairs ? { dictionaryRepairs } : {}),
  }
}
