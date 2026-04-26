/**
 * AI-powered product categorization (SMA-129).
 *
 * Takes a product's name + description, runs it through the Stage 1 extraction
 * prompt logic repurposed for categorization, and returns suggested category
 * and tags. Falls back to null values on inference failure so the sync path
 * never throws.
 */

import { safeParseJsonArray } from './smartPastePipeline.js'
import { logger } from '../utils/logger.js'

const CATEGORIZE_MAX_TOKENS = 256

const INFERENCE_TIMEOUT_MS = 30_000

/**
 * @param {{ name: string, desc: string, category?: string }} product
 * @param {Function} runInference  — pipeline entry point (runInference from ai/pipeline.js)
 * @returns {Promise<{ category: string, tags: string[] }>}
 */
export async function categorizeProduct(product, runInference) {
  if (!product?.name) return { category: null, tags: [] }

  const text = `${product.name} ${product.desc || ''}`.trim()
  if (!text) return { category: null, tags: [] }

  const prompt = buildCategorizePrompt(text)

  let result
  try {
    result = await Promise.race([
      runInference({ prompt, maxTokens: CATEGORIZE_MAX_TOKENS }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('categorize timeout')), INFERENCE_TIMEOUT_MS),
      ),
    ])
  } catch (e) {
    logger.warn('categorize', 'inference failed:', e?.message)
    return { category: null, tags: [] }
  }

  const rawText = result?.text ?? ''
  const parsed = safeParseJsonArray(rawText, { schema: validateCategoryItem })

  if (!parsed.ok) {
    logger.warn('categorize', 'parse failed:', parsed.error, '| raw:', rawText.slice(0, 100))
    return { category: null, tags: [] }
  }

  const items = parsed.value
  if (!Array.isArray(items) || items.length === 0) return { category: null, tags: [] }

  const first = items[0]
  const category =
    typeof first.category === 'string' && first.category.trim() ? first.category.trim() : null
  const tags = Array.isArray(first.tags)
    ? first.tags.filter((t) => typeof t === 'string' && t.trim())
    : []

  return { category, tags }
}

function validateCategoryItem(item, index) {
  if (index > 0) return 'only one object expected'
  if (typeof item !== 'object' || item === null) return 'must be object'
  if (typeof item.category !== 'string') return '"category" field required'
  return true
}

function buildCategorizePrompt(text) {
  const sections = [
    [
      'Task: analyze the product description below and suggest a category and tags.',
      'Rules:',
      '- Respond with ONLY a JSON array with exactly one object.',
      '- Output: [{"category": "string", "tags": ["string", ...]}]',
      '- "category" is one short noun or phrase (e.g. "Electronics", "Plumbing", "Office Supplies").',
      '- "tags" is an array of 0-5 lowercase keyword strings that describe the product.',
      '- Do not invent information not present in the description.',
      '- If classification is unclear, use "General" as category.',
      'Response:',
    ].join('\n'),
    '',
    `Product description:\n${text.slice(0, 500)}`,
  ]
  return sections.join('\n\n')
}
