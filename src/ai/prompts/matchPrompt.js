/**
 * Stage 3 prompt — picks the best catalogue product for each extracted line.
 *
 * batch is a list of <= 2 lines, each shaped:
 *   { extracted: { text, qty, description }, candidates: [{ id, name }, ...] }
 *
 * Only `id` and `name` are emitted for each candidate — the catalogue itself
 * may carry prices, SKUs, etc. but those would balloon the prompt without
 * helping the match decision.
 *
 * Output contract: a single JSON array, no prose, no fences:
 *   [{ "lineIndex": number, "productId": string|null, "confidence": number }, ...]
 */

import { getCorrectionMap } from '../../services/correctionStore.js'

const CONTEXT_FIELDS = [
  ['productType', 'Product type'],
  ['shopType', 'Shop type'],
  ['customerType', 'Customer type'],
  ['vocabulary', 'Vocabulary'],
  ['locale', 'Locale'],
]

function buildContextStanza(context) {
  if (!context) return ''
  const lines = []
  for (const [key, label] of CONTEXT_FIELDS) {
    const value = typeof context[key] === 'string' ? context[key].trim() : ''
    if (!value) continue
    lines.push(`- ${label}: ${value}`)
  }
  if (!lines.length) return ''
  return ['Business context:', ...lines].join('\n')
}

function renderCandidates(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return '  (no candidates)'
  return candidates
    .map(
      (c) =>
        `  - {"id": ${JSON.stringify(String(c?.id ?? ''))}, "name": ${JSON.stringify(String(c?.name ?? ''))}}`,
    )
    .join('\n')
}

function renderLine(entry, index) {
  const extracted = entry?.extracted || {}
  const text = typeof extracted.text === 'string' ? extracted.text : ''
  const qty = Number.isFinite(extracted.qty) ? extracted.qty : 1
  const description = typeof extracted.description === 'string' ? extracted.description : ''
  const header = `Line ${index} — text: ${JSON.stringify(text)}, qty: ${qty}, description: ${JSON.stringify(description)}`
  return [header, 'Candidates:', renderCandidates(entry?.candidates)].join('\n')
}

function buildCorrectionHints(batch) {
  const map = getCorrectionMap()
  if (!map.size || !Array.isArray(batch)) return null
  const hints = []
  for (const entry of batch) {
    const extracted = entry?.extracted || {}
    const normalized = (extracted.text || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (normalized && map.has(normalized)) {
      const { productId, productName } = map.get(normalized)
      const name = productName ? ` "${productName}"` : ''
      hints.push(
        `Line ${batch.indexOf(entry)}: "${normalized}" → product ID "${productId}"${name}. Weight this mapping higher.`,
      )
    }
  }
  if (!hints.length) return null
  return [
    'Note: The user has previously confirmed the following product mappings. Weight these higher:',
    ...hints,
  ].join('\n')
}

export function buildMatchPrompt({ batch, context } = {}) {
  const lines = Array.isArray(batch) ? batch : []
  const stanza = buildContextStanza(context)
  const correctionHints = buildCorrectionHints(lines)

  const sections = []
  if (stanza) sections.push(stanza)
  if (correctionHints) sections.push(correctionHints)
  sections.push(
    [
      'Task: for each line below, pick the single best product id from its candidate list.',
      'Rules:',
      '- Output a single JSON array and nothing else. No prose, no markdown, no code fences.',
      '- Each element must be {"lineIndex": number, "productId": string|null, "confidence": number}.',
      '- "lineIndex" must match the "Line N" headers in the input (0-based).',
      '- "productId" must be one of the candidate ids for that line, or null if none fit.',
      '- "confidence" is an integer 0-100 reflecting how sure you are.',
      '- Output exactly one element per line, in the same order.',
    ].join('\n'),
  )
  sections.push(['Lines:', lines.map((entry, i) => renderLine(entry, i)).join('\n\n')].join('\n'))

  return sections.join('\n\n')
}
