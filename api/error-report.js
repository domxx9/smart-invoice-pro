const PAPERCLIP_URL = process.env.PAPERCLIP_URL || 'http://localhost:3100'
const COMPANY_ID = 'c262e348-7044-4326-80ca-496a018bf1e4'

const MAX_MESSAGE_LEN = 500
const MAX_STACK_LEN = 5000
const MAX_NOTE_LEN = 1000
const MAX_SNAPSHOT_KEYS = 50

function truncate(str, maxLen) {
  if (!str || typeof str !== 'string') return str
  return str.length > maxLen ? str.slice(0, maxLen) : str
}

function formatDescription({ message, stack, componentStack, userNote, appStateSnapshot }) {
  const msg = truncate(message, MAX_MESSAGE_LEN)
  const stk = truncate(stack, MAX_STACK_LEN)
  const compStk = truncate(componentStack, MAX_STACK_LEN)
  const note = truncate(userNote, MAX_NOTE_LEN)

  let snapshot = {}
  if (appStateSnapshot && typeof appStateSnapshot === 'object') {
    const keys = Object.keys(appStateSnapshot).slice(0, MAX_SNAPSHOT_KEYS)
    for (const k of keys) {
      snapshot[k] = appStateSnapshot[k]
    }
  }

  const parts = ['## Error Report']
  if (msg) parts.push(`**Message:** ${msg}`)
  if (stk) parts.push(`**Stack:** \`${stk}\``)
  if (compStk) parts.push(`**Component Stack:** \`${compStk}\``)
  if (note) parts.push(`**User Note:** ${note}`)
  if (Object.keys(snapshot).length > 0) {
    parts.push(`**App State Snapshot:** \`${JSON.stringify(snapshot)}\``)
  }

  return parts.join('\n\n')
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 100_000) {
    return new Response(JSON.stringify({ success: false, error: 'Payload too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const description = formatDescription({
    message: body.message,
    stack: body.stack,
    componentStack: body.componentStack,
    userNote: body.userNote,
    appStateSnapshot: body.appStateSnapshot,
  })

  const payload = {
    title: body.message ? `Error: ${body.message.slice(0, 80)}` : 'Unknown error',
    description,
    status: 'backlog',
    priority: body.priority || 'medium',
    labelIds: [],
  }

  const res = await fetch(`${PAPERCLIP_URL}/api/companies/${COMPANY_ID}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    return new Response(JSON.stringify({ success: false, error: 'Submission failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await res.json()
  return new Response(JSON.stringify({ success: true, issueId: result.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
