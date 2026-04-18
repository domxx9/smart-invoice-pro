import { useRef, useState } from 'react'
import { parseSnapshot, validateSnapshot, applySnapshot } from '../utils/dataImport.js'
import { useToast } from '../contexts/ToastContext.jsx'

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read file'))
    reader.readAsText(file)
  })
}

export function RestoreBackupModal({ onClose, onApplied }) {
  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [counts, setCounts] = useState(null)
  const [issues, setIssues] = useState([])
  const [mode, setMode] = useState('merge')
  const [applying, setApplying] = useState(false)
  const { toast } = useToast()

  const reset = () => {
    setSnapshot(null)
    setCounts(null)
    setIssues([])
  }

  const handleFile = async (file) => {
    reset()
    if (!file) {
      setFileName('')
      return
    }
    setFileName(file.name)

    let text
    try {
      text = await readFileAsText(file)
    } catch (e) {
      setIssues([`Could not read file: ${e.message}`])
      return
    }

    const parsed = parseSnapshot(text)
    if (parsed.issues.length) {
      setIssues(parsed.issues)
      return
    }

    const validated = validateSnapshot(parsed.snapshot)
    setCounts(validated.counts)
    if (validated.issues.length) {
      setIssues(validated.issues)
      return
    }

    setSnapshot(parsed.snapshot)
  }

  const handleApply = async () => {
    if (!snapshot || applying) return
    setApplying(true)
    try {
      await applySnapshot(snapshot, { mode })
      toast(
        mode === 'replace' ? 'Backup restored (replaced)' : 'Backup restored (merged)',
        'success',
        '✓',
      )
      onApplied?.()
      // Give the toast a chance to render, then reload so every hook
      // rehydrates from the freshly written storage.
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload()
      }, 300)
    } catch (e) {
      setIssues([`Restore failed: ${e.message}`])
      setApplying(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Restore from backup"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.6)',
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
          maxWidth: 440,
          width: '100%',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Restore from backup</h3>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
          Pick a backup JSON file exported from Smart Invoice Pro. We will validate it before
          touching your data.
        </p>

        <label
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: 'flex-start', cursor: 'pointer' }}
        >
          {fileName ? `Selected: ${fileName}` : 'Choose backup file…'}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>

        {issues.length > 0 && (
          <ul
            role="alert"
            aria-live="polite"
            style={{
              margin: 0,
              padding: '8px 12px 8px 28px',
              borderRadius: 8,
              background: 'rgba(239,68,68,.10)',
              color: '#f87171',
              fontSize: '.78rem',
              lineHeight: 1.5,
            }}
          >
            {issues.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        )}

        {snapshot && counts && (
          <>
            <div
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: '.8rem',
              }}
            >
              <strong style={{ display: 'block', marginBottom: 4 }}>Preview</strong>
              <div style={{ color: 'var(--muted)' }}>
                {counts.invoices} invoices · {counts.products} products · {counts.orders} orders
              </div>
            </div>

            <fieldset
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 12px',
                margin: 0,
              }}
            >
              <legend style={{ fontSize: '.76rem', padding: '0 6px', color: 'var(--muted)' }}>
                Restore mode
              </legend>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  fontSize: '.82rem',
                  alignItems: 'flex-start',
                  marginBottom: 8,
                }}
              >
                <input
                  type="radio"
                  name="restore-mode"
                  value="merge"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                />
                <span>
                  <strong>Merge by id</strong> — upsert invoices/products/orders; keep current data
                  not in the backup.
                </span>
              </label>
              <label
                style={{ display: 'flex', gap: 8, fontSize: '.82rem', alignItems: 'flex-start' }}
              >
                <input
                  type="radio"
                  name="restore-mode"
                  value="replace"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />
                <span>
                  <strong>Replace all</strong> — wipe current invoices, products, orders, picks,
                  settings first.
                </span>
              </label>
            </fieldset>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={applying}
            type="button"
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleApply}
            disabled={!snapshot || applying}
            type="button"
          >
            {applying ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  )
}
