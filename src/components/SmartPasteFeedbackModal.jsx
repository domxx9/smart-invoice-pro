import { useState } from 'react'
import { submitPasteFeedback } from '../api/feedbackSubmit.js'

export function SmartPasteFeedbackModal({ corrections, rawText, onClose, toast }) {
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await submitPasteFeedback({
        rawText,
        corrections,
        timestamp: new Date().toISOString(),
      })
      toast?.('Feedback submitted — thank you!')
      onClose()
    } catch {
      toast?.('Failed to submit feedback')
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share smart paste feedback"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 45,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--card)',
          color: 'var(--text)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          maxWidth: 380,
          width: '100%',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Share feedback?</h3>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '.78rem',
              color: 'var(--muted)',
              lineHeight: 1.5,
            }}
          >
            You corrected {corrections.length} match{corrections.length !== 1 ? 'es' : ''}. Send
            this as a test case to help improve Smart Paste accuracy?
          </p>
        </div>

        <div
          style={{
            maxHeight: 160,
            overflow: 'auto',
            fontSize: '.72rem',
            color: 'var(--muted)',
            background: 'rgba(0,0,0,.04)',
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          {corrections.map((c, idx) => (
            <div key={idx} style={{ marginBottom: idx < corrections.length - 1 ? 6 : 0 }}>
              <div>&ldquo;{c.originalText}&rdquo;</div>
              <div style={{ paddingLeft: 8 }}>
                {c.aiMatch ? (
                  <>
                    AI: {c.aiMatch} ({c.confidence}%) → <strong>{c.correctedProduct}</strong>
                  </>
                ) : (
                  <>
                    No match → <strong>{c.correctedProduct}</strong>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-full"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Sending…' : 'Yes, share feedback'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          disabled={submitting}
          style={{ alignSelf: 'center' }}
        >
          No thanks
        </button>
      </div>
    </div>
  )
}
