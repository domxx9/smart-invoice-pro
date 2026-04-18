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

  const sections = []
  if (stanza) sections.push(stanza)
  sections.push(
    [
      'Task: extract every line item the customer is asking to order from the message below.',
      'Rules:',
      '- Respond with ONLY a JSON array. Your first character MUST be "[" and your last character MUST be "]".',
      '- No preamble ("Sure,", "Here is..."), no explanation, no markdown, no code fences, no trailing commentary.',
      '- Each element must be {"text": string, "qty": number, "description": string}.',
      '- "text" is the customer\'s own wording for the item (one short phrase).',
      '- "qty" is an integer >= 1. If the customer did not give a number, use 1.',
      '- "description" is any size, colour, variant, or note attached to that item ("" if none).',
      '- Do not invent items. If the message contains zero items, output [].',
    ].join('\n'),
  )
  sections.push(
    [
      'Example',
      'Customer message:',
      'hey can i get 2 front shocks for a lifted tacoma and an oil filter please',
      'Response:',
      '[{"text":"front shocks","qty":2,"description":"lifted tacoma"},{"text":"oil filter","qty":1,"description":""}]',
    ].join('\n'),
  )
  sections.push(['Customer message:', safeText].join('\n'))

  return sections.join('\n\n')
}
