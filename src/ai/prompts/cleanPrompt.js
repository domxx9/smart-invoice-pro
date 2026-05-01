/**
 * Clean prompt — strips WhatsApp timestamps, contact names, greetings,
 * questions, and delivery instructions from a raw customer order message.
 * Split combined lines ("scissors and probe") into one item per line.
 *
 * Output contract: plain text, one cleaned line per order item, no JSON,
 * no fences, no preamble.
 */

export function buildCleanPrompt(text) {
  const safeText = typeof text === 'string' ? text : ''
  const clipped = safeText.slice(0, 800)
  return (
    `Clean up this order message. Your job:` +
    '\n' +
    `- Remove timestamps (e.g. [12:00, 11/04/2026]), contact names, phone numbers` +
    '\n' +
    `- Remove greetings, questions, delivery instructions, anything not an item order` +
    '\n' +
    `- If a line mentions multiple items, split them onto separate lines` +
    '\n' +
    `- Keep any quantities (numbers) next to their item` +
    '\n' +
    `- Return ONLY the cleaned order lines, one item per line, nothing else` +
    '\n' +
    '\n' +
    `Message:` +
    '\n' +
    clipped +
    '\n' +
    '\n' +
    `Cleaned lines:`
  )
}
