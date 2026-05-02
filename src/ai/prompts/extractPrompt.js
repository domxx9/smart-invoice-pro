/**
 * Stage 1 prompt — extracts line items from a customer paste.
 *
 * Output contract: a single JSON array, no prose, no fences:
 *   [{ "text": string, "qty": number, "description": string }, ...]
 *
 * The 5 business-context phrases are emitted as a labelled stanza so the
 * model can see *which* dimension each phrase describes. Empty phrases are
 * skipped — the stanza simply gets shorter and the rest of the prompt is
 * unchanged. With all five blank, the stanza collapses to an empty block
 * and the prompt still builds.
 */

import { getCorrectionMap } from '../../services/correctionStore.js'

const MAX_CORRECTIONS = 20

function buildCorrectionsStanza() {
  const map = getCorrectionMap()
  if (!map.size) return null
  const sorted = [...map.entries()].sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0))
  const top = sorted.slice(0, MAX_CORRECTIONS)
  const lines = top.map(([originalText, { productId, productName }]) => {
    const safe = JSON.stringify(originalText)
    const name = productName ? ` (${productName})` : ''
    return `- ${safe} → "${productId}"${name}`
  })
  return [
    '## Known product corrections (user-verified mappings)',
    'When you see these terms, the user means the corresponding product:',
    ...lines,
  ].join('\n')
}

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

export function buildExtractPrompt({ text, context } = {}) {
  const safeText = typeof text === 'string' ? text : ''
  const stanza = buildContextStanza(context)
  const correctionsStanza = buildCorrectionsStanza()

  // Order follows small-model (Gemma 3 1B) prompting guidance: context and
  // examples at the head to anchor the task shape, customer input next
  // wrapped in explicit delimiters so the paste can't collide with the
  // rules, and the Task/Rules block LAST so the instructions are the
  // closest thing to the generation boundary. SMA-78 dogfood showed the
  // small model ignoring head-of-prompt rules when the paste contained
  // repetitive phrasing and parroting the input for ~22k chars.
  const sections = []
  if (stanza) sections.push(stanza)
  if (correctionsStanza) sections.push(correctionsStanza)

  sections.push(
    [
      'Example 1',
      'Customer message:',
      '<customer_message>',
      'hey can i get 2 front shocks for a lifted tacoma and an oil filter please',
      '</customer_message>',
      'Response:',
      '[{"text":"front shocks","qty":2,"description":"lifted tacoma"},{"text":"oil filter","qty":1,"description":""}]',
    ].join('\n'),
  )

  // Example 2 anchors the model against parrot-loop failure: a paste with
  // repetitive phrasing (same noun echoed) must still collapse to distinct
  // items rather than being copied back verbatim.
  sections.push(
    [
      'Example 2',
      'Customer message:',
      '<customer_message>',
      '1 x 10 wire cassette',
      '1 x 15 wire cassette',
      '1 x 10 and 15 wire cassette',
      '</customer_message>',
      'Response:',
      '[{"text":"wire cassette","qty":1,"description":"10"},{"text":"wire cassette","qty":1,"description":"15"},{"text":"wire cassette","qty":1,"description":"10 and 15"}]',
    ].join('\n'),
  )

  sections.push(
    ['Customer message:', '<customer_message>', safeText, '</customer_message>'].join('\n'),
  )

  sections.push(
    [
      'Task: extract every line item the customer is asking to order from the <customer_message> block above.',
      'Rules:',
      '- Respond with ONLY a JSON array. Your first character MUST be "[" and your last character MUST be "]".',
      '- Do NOT copy the customer message back. Do NOT repeat lines. Emit one JSON object per distinct item.',
      '- No preamble ("Sure,", "Here is..."), no explanation, no markdown, no code fences, no trailing commentary.',
      '- Each element must be {"text": string, "qty": number, "description": string}.',
      '- "text" is the customer\'s own wording for the item (one short phrase).',
      '- "qty" is an integer >= 1. If the customer did not give a number, use 1.',
      '- "description" is any size, colour, variant, or note attached to that item ("" if none).',
      '- Do not invent items. If the message contains zero items, output [].',
      'Response:',
    ].join('\n'),
  )

  return sections.join('\n\n')
}
