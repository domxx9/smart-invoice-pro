import { useState, useEffect } from 'react'
import { logger } from '../utils/logger.js'

const LOG_LEVELS = ['debug', 'info', 'warn', 'error']

export function DebugLogsSection({ settings, saveSettings, toast }) {
  const [showLogs, setShowLogs] = useState(false)
  const [logTick, setLogTick] = useState(0)

  useEffect(() => {
    if (!showLogs) return
    const id = setInterval(() => setLogTick((t) => t + 1), 200)
    return () => clearInterval(id)
  }, [showLogs])

  const setDebug = (k, v) =>
    saveSettings((prev) => ({
      ...prev,
      debug: { ...(prev.debug || {}), [k]: v },
    }))

  const downloadLogs = () => {
    const text = logger.toText()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sip-logs-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearLogs = () => {
    logger.clear()
    setLogTick((t) => t + 1)
    toast('Logs cleared', 'success', '🧹')
  }

  const enableInfoLogging = () => {
    const next = {
      ...settings,
      debug: { ...(settings.debug || {}), logLevel: 'info' },
    }
    saveSettings(next)
    toast('Log level set to info — pipeline traces now captured', 'success', '🔎')
  }

  const logLevel = settings.debug?.logLevel || 'error'

  return (
    <>
      {showLogs && (
        <div
          role="dialog"
          aria-label="Log viewer"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.85)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 40,
            paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
            paddingRight: 'calc(env(safe-area-inset-right) + 16px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
            paddingLeft: 'calc(env(safe-area-inset-left) + 16px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              gap: 8,
            }}
          >
            <strong style={{ color: 'var(--text)' }}>
              Logs ({logger.getSnapshot().length}/1000)
              <span hidden>{logTick}</span>
            </strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={downloadLogs}>
                Download
              </button>
              <button className="btn btn-ghost btn-sm" onClick={clearLogs}>
                Clear
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(false)}>
                Close
              </button>
            </div>
          </div>
          {logLevel !== 'debug' && logLevel !== 'info' && (
            <div
              data-testid="log-viewer-info-hint"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 8,
                padding: '8px 10px',
                borderRadius: 8,
                background: 'rgba(90,140,255,.1)',
                border: '1px solid rgba(90,140,255,.3)',
                color: 'var(--text)',
                fontSize: '.75rem',
                lineHeight: 1.4,
              }}
            >
              <span>
                Bump log level to <code>info</code> to capture Smart Paste pipeline traces.
              </span>
              <button className="btn btn-ghost btn-sm" onClick={enableInfoLogging}>
                Enable info logs
              </button>
            </div>
          )}
          <pre
            data-testid="log-viewer-body"
            style={{
              flex: 1,
              overflow: 'auto',
              background: 'var(--card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 12,
              margin: 0,
              fontSize: '.72rem',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {logger.toText() || '(buffer empty)'}
          </pre>
        </div>
      )}

      <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Capture in-app diagnostic logs. Stays in memory only — nothing is uploaded.
      </p>
      <div className="field">
        <label htmlFor="debug-log-level">
          Log level
          <select
            id="debug-log-level"
            value={logLevel}
            onChange={(e) => setDebug('logLevel', e.target.value)}
          >
            {LOG_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </label>
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
          Lower = more entries captured. Default is <code>error</code>. Press Save Settings to
          apply.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(true)}>
          View logs
        </button>
        <button className="btn btn-ghost btn-sm" onClick={downloadLogs}>
          Download logs
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--danger)' }}
          onClick={clearLogs}
        >
          Clear logs
        </button>
      </div>
    </>
  )
}
