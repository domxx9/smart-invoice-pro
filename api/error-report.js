/**
 * Vercel Edge Function — error report proxy
 * Receives error reports from the app and creates Paperclip issues.
 */

export const config = { runtime: 'edge' }

const PROJECT_ID = 'c2d1e1a5-c7e5-4ba8-bb49-debc7ef53f24'
const MAX_BODY_SIZE = 100 * 1024
const MAX_MESSAGE_LEN = 500
const MAX_STACK_LEN = 5000
const MAX_NOTE_LEN = 1000
const MAX_SNAPSHOT_KEYS = 50
const SANITIZE_FIELDS = ['apiKey', 'token', 'password', 'secret', 'authorization', 'cookie']

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = Array.isArray(obj) ? [...obj] : { ...obj }
  for (const key of Object.keys(result)) {
    if (SANITIZE_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      result[key] = '[REDACTED]'
    } else if (typeof result[key] === 'object') {
      result[key] = sanitize(result[key])
    }
  }
  return result
}

function buildTitle(message) {
  const full = `[Error Report] ${message || 'Unknown'}`
  return full.length > 120 ? full.slice(0, 120) : full
}

function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…[truncated]'
}

function formatDescription(body) {
  const parts = []
  if (body.message) parts.push(`## Message\n${truncate(body.message, MAX_MESSAGE_LEN)}`)
  if (body.stack) parts.push(`## Stack\n\`\`\`\n${truncate(body.stack, MAX_STACK_LEN)}\n\`\`\``)
  if (body.componentStack)
    parts.push(
      `## Component Stack\n\`\`\`\n${truncate(body.componentStack, MAX_STACK_LEN)}\n\`\`\``,
    )
  if (body.tab) parts.push(`## Tab\n${body.tab}`)
  if (body.userNote) parts.push(`## User Note\n${truncate(body.userNote, MAX_NOTE_LEN)}`)
  if (body.userAgent) parts.push(`## User Agent\n${body.userAgent}`)
  if (body.timestamp) parts.push(`## Timestamp\n${body.timestamp}`)
  if (body.appStateSnapshot) {
    const sanitized = sanitize(body.appStateSnapshot)
    const keys = Object.keys(sanitized)
    const limited =
      keys.length > MAX_SNAPSHOT_KEYS
        ? Object.fromEntries(keys.slice(0, MAX_SNAPSHOT_KEYS).map((k) => [k, sanitized[k]]))
        : sanitized
    parts.push(`## App State Snapshot\n\`\`\`json\n${JSON.stringify(limited, null, 2)}\n\`\`\``)
  }
  return parts.join('\n\n')
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
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

  if (JSON.stringify(body).length > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({ success: false, error: 'Request body too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { message, stack } = body
  if (!message || !stack) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing required fields: message, stack' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const apiUrl = process.env.PAPERCLIP_API_URL
  const companyId = process.env.PAPERCLIP_COMPANY_ID || 'c262e348-7044-4326-80ca-496a018bf1e4'
  const apiKey = process.env.PAPERCLIP_ERROR_REPORT_API_KEY

  if (!apiUrl || !apiKey) {
    console.error('error-report: missing required env vars')
    return new Response(JSON.stringify({ success: false, error: 'Server misconfiguration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const url = `${apiUrl}/api/companies/${companyId}/issues`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Paperclip-Run-Id': 'error-report',
      },
      body: JSON.stringify({
        title: buildTitle(message),
        description: formatDescription(body),
        priority: 'low',
        projectId: PROJECT_ID,
        labelIds: [],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error(`error-report: Paperclip API ${res.status}: ${text}`)
      return new Response(
        JSON.stringify({ success: false, error: `Upstream error ${res.status}` }),
        {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const result = await res.json()
    return new Response(
      JSON.stringify({ success: true, issueIdentifier: result.identifier || result.id }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    console.error('error-report: fetch failed', err)
    return new Response(JSON.stringify({ success: false, error: 'Upstream request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
