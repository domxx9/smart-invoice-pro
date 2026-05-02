import { logger } from '../utils/logger.js'

const PAPERCLIP_URL = import.meta.env.VITE_PAPERCLIP_URL || 'http://localhost:3100'
const COMPANY_ID = 'c262e348-7044-4326-80ca-496a018bf1e4'

export async function submitPasteFeedback({ rawText, corrections, timestamp }) {
  if (!import.meta.env.VITE_PAPERCLIP_URL) {
    logger.info('feedback.skip', { reason: 'VITE_PAPERCLIP_URL not configured' })
    return
  }

  const rows = corrections.map((c) => {
    const line = [`- **"${c.originalText}"**`]
    if (c.aiMatch) line.push(`  - AI matched: ${c.aiMatch} (${c.confidence}%)`)
    else line.push('  - AI matched: *(no match)*')
    line.push(`  - Correct product: ${c.correctedProduct}`)
    return line.join('\n')
  })

  const body = [
    '## Smart Paste Test Case',
    '',
    `**Timestamp:** ${timestamp}`,
    '',
    '### Raw Input',
    '```',
    rawText,
    '```',
    '',
    '### Corrections',
    ...rows,
  ].join('\n')

  const payload = {
    title: `Smart Paste test case — ${corrections.length} correction${corrections.length !== 1 ? 's' : ''}`,
    description: body,
    status: 'backlog',
    priority: 'low',
    labelIds: [],
  }

  logger.info('feedback.submitting', { correctionCount: corrections.length })

  const res = await fetch(`${PAPERCLIP_URL}/api/companies/${COMPANY_ID}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    logger.error('feedback.submit_failed', { status: res.status, body: text })
    throw new Error(`Feedback submit failed: ${res.status}`)
  }

  const result = await res.json()
  logger.info('feedback.submitted', { issueId: result.id, identifier: result.identifier })
  return result
}
