/**
 * Vercel Edge Function — error report proxy
 * Receives error reports from the app and creates Paperclip issues.
 */

export const config = { runtime: 'edge' }

const PROJECT_ID = process.env.PAPERCLIP_COMPANY_ID
const PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL
const API_KEY = process.env.PAPERCLIP_ERROR_REPORT_API_KEY

const SENSITIVE_FIELDS = ['apiKey', 'token', 'secret', 'password']

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const result = Array.isArray(obj) ? [] : {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.includes(key)) {
      result[key] = '[REDACTED]'
    } else if (value && typeof value === 'object') {
      result[key] = sanitize(value)
    } else {
      result[key] = value
    }
  }
  return result
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { message, stack, componentStack, tab, userNote, appStateSnapshot, timestamp, userAgent } =
    body

  if (!message || !stack) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing required fields: message, stack' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const title = `[Error Report] ${message}`.slice(0, 120)
  const sanitizedSnapshot = sanitize(appStateSnapshot)

  const description = [
    '## Error Report',
    '',
    '### Stack Trace',
    '```',
    stack,
    '```',
    componentStack ? `\n### Component Stack\n\`\`\`\n${componentStack}\n\`\`\`` : '',
    tab ? `\n### Tab\n${tab}` : '',
    userNote ? `\n### User Note\n${userNote}` : '',
    timestamp ? `\n### Timestamp\n${new Date(timestamp).toISOString()}` : '',
    userAgent ? `\n### User Agent\n${userAgent}` : '',
    sanitizedSnapshot
      ? `\n### App State Snapshot\n\`\`\`json\n${JSON.stringify(sanitizedSnapshot, null, 2)}\n\`\`\``
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const response = await fetch(`${PAPERCLIP_API_URL}/api/companies/${PROJECT_ID}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        description,
        priority: 'low',
        projectId: PROJECT_ID,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Paperclip API error:', response.status, errText)
      return new Response(JSON.stringify({ success: false, error: 'Failed to create issue' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const issue = await response.json()
    return new Response(JSON.stringify({ success: true, issueIdentifier: issue.identifier }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Error creating issue:', err)
    return new Response(JSON.stringify({ success: false, error: 'Internal error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
