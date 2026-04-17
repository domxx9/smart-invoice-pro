import { useState } from 'react'
import { savePDFToPhone, sharePDF, openPDF, getPDFFilename, pdfFileExists } from '../pdf.js'
import { useToast } from '../contexts/ToastContext.jsx'
import { useSettings } from '../contexts/SettingsContext.jsx'

const WORKFLOW = {
  new: { label: 'Mark as Sent', next: 'pending', danger: false, sendPDF: false },
  pending: { label: 'Fulfil Order', next: 'fulfilled', danger: false, sendPDF: false },
  fulfilled: { label: 'Payment Received', next: 'paid', danger: false, sendPDF: false },
  paid: { label: 'Return', next: 'refunded', danger: true, sendPDF: false },
}

export function InvoiceActions({ inv, onSave, onClose, onDelete }) {
  const { toast: onToast } = useToast()
  const { settings } = useSettings()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pdfToast, setPdfToast] = useState(null)
  const [overwritePending, setOverwritePending] = useState(null)

  const step = WORKFLOW[inv.status]

  const handleSavePDF = async () => {
    const filename = getPDFFilename(inv)
    const exists = await pdfFileExists(filename)
    if (exists) {
      const copyName = filename.replace(/\.pdf$/i, '_COPY.pdf')
      setOverwritePending({ filename, copyName })
    } else {
      const result = await savePDFToPhone(inv, settings)
      setPdfToast(result)
      if (!result.error) onToast?.('PDF saved to phone', 'success', '📄')
    }
  }

  return (
    <>
      {pdfToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 140,
            left: 16,
            right: 16,
            background: 'var(--card)',
            border: `1px solid ${pdfToast.error ? 'var(--danger)' : 'var(--success)'}`,
            borderRadius: 'var(--radius)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 25,
            boxShadow: '0 4px 24px rgba(0,0,0,.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{pdfToast.error ? '❌' : '✅'}</span>
            <div>
              <div
                style={{
                  fontSize: '.88rem',
                  fontWeight: 600,
                  color: pdfToast.error ? 'var(--danger)' : 'var(--text)',
                }}
              >
                {pdfToast.error ? 'Save failed' : 'PDF Saved'}
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
                {pdfToast.error || pdfToast.filename}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!pdfToast.error && (pdfToast.uri || pdfToast.dataUrl) && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--accent)', borderColor: 'rgba(245,166,35,.3)' }}
                onClick={() => {
                  setPdfToast(null)
                  if (pdfToast.uri) {
                    openPDF(pdfToast.uri)
                  } else if (pdfToast.dataUrl) {
                    const a = document.createElement('a')
                    a.href = pdfToast.dataUrl
                    a.download = pdfToast.filename
                    a.click()
                  }
                }}
              >
                Open
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setPdfToast(null)}>
              ✕
            </button>
          </div>
        </div>
      )}

      {overwritePending && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            padding: 24,
          }}
        >
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 24,
              width: '100%',
              maxWidth: 340,
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>
              File already exists
            </h3>
            <p
              style={{
                fontSize: '.85rem',
                color: 'var(--muted)',
                marginBottom: 6,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--text)' }}>{overwritePending.filename}</strong> is
              already saved.
            </p>
            <p
              style={{
                fontSize: '.83rem',
                color: 'var(--muted)',
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              Overwrite it, or save a copy as{' '}
              <strong style={{ color: 'var(--text)' }}>{overwritePending.copyName}</strong>?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className="btn btn-primary btn-full"
                onClick={async () => {
                  const op = overwritePending
                  setOverwritePending(null)
                  const result = await savePDFToPhone(inv, settings, op.filename)
                  setPdfToast(result)
                }}
              >
                Overwrite
              </button>
              <button
                className="btn btn-ghost btn-full"
                onClick={async () => {
                  const op = overwritePending
                  setOverwritePending(null)
                  const result = await savePDFToPhone(inv, settings, op.copyName)
                  setPdfToast(result)
                }}
              >
                Save as Copy
              </button>
              <button
                className="btn btn-ghost btn-full"
                style={{ color: 'var(--muted)' }}
                onClick={() => setOverwritePending(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            padding: 24,
          }}
        >
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 24,
              width: '100%',
              maxWidth: 340,
            }}
          >
            <h3
              style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: 'var(--danger)' }}
            >
              Delete Invoice?
            </h3>
            <p
              style={{
                fontSize: '.88rem',
                color: 'var(--muted)',
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              {inv.id}
              {inv.customer ? ` for ${inv.customer}` : ''} will be permanently deleted and cannot be
              recovered.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-full" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn btn-danger btn-full" onClick={() => onDelete(inv.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0))',
          zIndex: 20,
        }}
      >
        {step && (
          <button
            className={`btn btn-full ${step.danger ? 'btn-danger' : 'btn-primary'}`}
            style={{ fontSize: '1rem', padding: '13px', marginBottom: 8 }}
            onClick={async () => {
              const updated = { ...inv, status: step.next }
              if (step.sendPDF) await sharePDF(inv, settings)
              onSave(updated)
            }}
          >
            {step.label}
          </button>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-ghost"
            style={{
              padding: '12px 14px',
              color: 'var(--danger)',
              borderColor: 'rgba(224,82,82,.3)',
            }}
            onClick={() => setConfirmDelete(true)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
          <button
            className="btn btn-ghost"
            style={{
              flex: 1,
              padding: '12px 8px',
              fontSize: '.85rem',
              color: '#4caf84',
              borderColor: 'rgba(76,175,132,.3)',
            }}
            onClick={async () => {
              await sharePDF(inv, settings)
              onToast?.('Invoice shared', 'success', '↗')
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 4 }}
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            Share
          </button>
          <button
            className="btn btn-ghost"
            style={{
              flex: 1.4,
              padding: '12px 8px',
              fontSize: '.85rem',
              color: 'var(--accent)',
              borderColor: 'rgba(245,166,35,.3)',
            }}
            onClick={handleSavePDF}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 4 }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 18 15 15" />
            </svg>
            Save PDF
          </button>
          <button
            className="btn btn-ghost"
            style={{ flex: 1, padding: '12px 8px', fontSize: '.85rem' }}
            onClick={() => onClose(inv)}
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}
