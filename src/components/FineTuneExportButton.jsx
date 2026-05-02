import { useState } from 'react'
import { getStats, clearCorrections, getCorrections } from '../services/correctionStore.js'
import { STORAGE_KEYS } from '../constants/storageKeys.js'

const FINETUNE_STORAGE_KEY = STORAGE_KEYS.SIP_FINETUNE_EXPORT_V1

function buildJsonl(corrections) {
  return corrections
    .map((c) => {
      const prompt = `Match: '${c.originalText}'`
      const completion = c.correctedProductName || c.correctedProductId
      return JSON.stringify({ prompt, completion })
    })
    .join('\n')
}

export function FineTuneExportButton() {
  const [showConfirm, setShowConfirm] = useState(false)
  const stats = getStats()

  const handleExport = () => {
    const corrections = getCorrections()
    const jsonl = buildJsonl(corrections)
    const d = new Date()
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const filename = `sip-finetune-${stamp}.jsonl`
    const blob = new Blob([jsonl], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    clearCorrections()
    localStorage.removeItem(FINETUNE_STORAGE_KEY)
    setShowConfirm(false)
  }

  if (!stats.totalCorrections) {
    return (
      <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 8 }}>
        No correction history yet.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8 }}>
        {stats.totalCorrections} total correction{stats.totalCorrections !== 1 ? 's' : ''} ·{' '}
        {stats.uniqueMappings} unique mapping{stats.uniqueMappings !== 1 ? 's' : ''}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleExport}>
          Export training data
        </button>
        {!showConfirm ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--danger)' }}
            onClick={() => setShowConfirm(true)}
          >
            Clear correction history
          </button>
        ) : (
          <>
            <span style={{ fontSize: '.72rem', color: 'var(--danger)', alignSelf: 'center' }}>
              Confirm?
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger)' }}
              onClick={handleClear}
            >
              Yes, clear
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
