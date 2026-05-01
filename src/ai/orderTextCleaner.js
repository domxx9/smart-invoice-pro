/**
 * Order text cleaner — Smart Paste Stage 0 domain logic.
 *
 * Sends raw order text (WhatsApp, email, etc.) to the LLM for cleanup:
 * strips timestamps, contact names, greetings, questions, delivery instructions.
 * Splits combined lines into one item per line.
 * Returns plain text — no JSON, no catalog needed, fast.
 *
 * Backward-compatible API: `cleanOrderText(text, onToken)` where `onToken`
 * is the streaming callback from the active LLM backend. For testability
 * and dependency injection, callers may also pass `runInference` via
 * the options object — it will be used instead of the module-level _llm.
 *
 * @param {string} text           - Raw pasted text (WhatsApp, email, list…)
 * @param {Function} [onToken]    - Streaming callback (partialOutput, done)
 * @param {object}  [options]    - Optional { runInference, maxTokens }
 * @param {Function} [options.runInference] - inference fn ({prompt, maxTokens}) => Promise<{text, stopReason}>
 * @param {number}  [options.maxTokens]     - LLM token budget (default 256)
 * @returns {Promise<string>} cleaned text, or original text on error
 */

import { buildCleanPrompt } from './prompts/cleanPrompt.js'
import { logger } from '../utils/logger.js'

const DEFAULT_MAX_TOKENS = 256

export async function cleanOrderText(text, onToken, options) {
  const { runInference: runInf, maxTokens = DEFAULT_MAX_TOKENS } = options || {}

  const prompt = buildCleanPrompt(text)

  if (runInf) {
    return _cleanViaRunInference(prompt, text, runInf, maxTokens, onToken)
  }

  return _cleanViaLlm(prompt, text, onToken)
}

async function _cleanViaRunInference(prompt, originalText, runInference, maxTokens, onToken) {
  try {
    const result = await runInference({ prompt, maxTokens })
    const out = result.text || ''
    onToken?.(out, true)
    logger.debug('ai', 'cleanOrderText raw:', JSON.stringify(out))
    return out.trim() || originalText
  } catch (e) {
    logger.error('ai', 'cleanOrderText error:', e)
    return originalText
  }
}

let _llm = null

export function _setLlmForTest(llm) {
  _llm = llm
}

async function _cleanViaLlm(prompt, originalText, onToken) {
  if (!_llm) throw new Error('Model not loaded')

  return new Promise((resolve) => {
    let out = ''
    try {
      _llm.generateResponse(prompt, (chunk, done) => {
        out += chunk
        onToken?.(out, done)
        if (done) {
          logger.debug('ai', 'cleanOrderText raw:', JSON.stringify(out))
          resolve(out.trim() || originalText)
        }
      })
    } catch (e) {
      logger.error('ai', 'cleanOrderText error:', e)
      try {
        _llm?.cancelProcessing?.()
      } catch {
        /* ignore */
      }
      resolve(originalText)
    }
  })
}
