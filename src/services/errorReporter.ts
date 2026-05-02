export interface ErrorReportPayload {
  message: string
  stack: string
  componentStack?: string
  tab?: string
  userNote?: string
  appStateSnapshot?: Record<string, unknown>
}

export interface ErrorReportResult {
  success: boolean
  issueIdentifier?: string
  error?: string
}

const SECRET_KEYS = ['key', 'token', 'secret', 'password']

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SECRET_KEYS.some((s) => lower.includes(s))
}

export function captureAppState(): Record<string, unknown> {
  const tab = localStorage.getItem('tab') || undefined
  const snapshot: Record<string, unknown> = { tab }
  for (let i = 0; i < localStorage.length; i++) {
    try {
      let key
      try { key = localStorage.key(i) } catch { continue }
      if (key && !isSecretKey(key)) {
        let val
        try { val = localStorage.getItem(key) } catch { val = null }
        snapshot[key] = val
      }
    } catch {
      continue
    }
  }
  return snapshot
}

export async function reportError(payload: ErrorReportPayload): Promise<ErrorReportResult> {
  const body = {
    ...payload,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  }
  try {
    const res = await fetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown error')
      return { success: false, error: `HTTP ${res.status}: ${errText}` }
    }
    const data = (await res.json().catch(() => ({}))) as { issueIdentifier?: string }
    return { success: true, issueIdentifier: data.issueIdentifier }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}