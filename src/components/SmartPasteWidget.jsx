import { useState } from 'react'
import { cleanWhatsApp, extractItems, matchItems, fmt } from '../helpers.js'
import { Icon } from './Icon.jsx'

function getPasteStatus(r, i, decisions) {
  const d = decisions[i]
  if (d === 'dismissed') return 'dismissed'
  if (d === 'confirmed') return 'confirmed'
  if (d === 'discarded') return 'discarded'
  if (r.product) return 'auto_match'
  if (r.bestGuess) return 'best_guess'
  return 'no_match'
}

const PASTE_SORT = {
  no_match: 0,
  discarded: 0,
  best_guess: 1,
  auto_match: 2,
  confirmed: 2,
  dismissed: 3,
}

export function SmartPasteWidget({ products, onAddItems }) {
  const [pasteText, setPasteText] = useState('')
  const [pasteResults, setPasteResults] = useState(null)
  const [pasteDecisions, setPasteDecisions] = useState({})

  const decide = (i, val) => setPasteDecisions((d) => ({ ...d, [i]: val }))
  const unmatch = (i) =>
    setPasteResults((prev) => {
      const updated = [...prev]
      updated[i] = {
        ...updated[i],
        product: null,
        bestGuess: null,
        confidence: 0,
      }
      return updated
    })

  const runParse = () => {
    if (!pasteText.trim()) return
    setPasteDecisions({})
    const cleaned = cleanWhatsApp(pasteText)
    const extracted = extractItems(cleaned)
    setPasteResults(matchItems(extracted, products))
  }

  const addMatched = () => {
    if (!pasteResults) return
    const newDecisions = { ...pasteDecisions }
    const toAdd = []
    pasteResults.forEach((r, i) => {
      const s = getPasteStatus(r, i, pasteDecisions)
      if (s === 'auto_match' || s === 'confirmed') {
        const prod = r.product ?? r.bestGuess
        toAdd.push({ desc: prod.name, qty: r.qty, price: prod.price })
        newDecisions[i] = 'dismissed'
      }
    })
    if (!toAdd.length) return
    onAddItems(toAdd)
    const allGone = pasteResults.every((_, i) => newDecisions[i] === 'dismissed')
    if (allGone) {
      setPasteResults(null)
      setPasteDecisions({})
      setPasteText('')
    } else setPasteDecisions(newDecisions)
  }

  const sorted = pasteResults
    ? pasteResults
        .map((r, i) => ({ r, i, s: getPasteStatus(r, i, pasteDecisions) }))
        .filter(({ s }) => s !== 'dismissed')
        .sort((a, b) => PASTE_SORT[a.s] - PASTE_SORT[b.s])
    : []
  const matchCount = sorted.filter(({ s }) => s === 'auto_match' || s === 'confirmed').length

  return (
    <div className="ai-box">
      <div className="flex-between mb-8">
        <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--accent)' }}>
          Smart Paste
        </span>
        <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
          Paste order text · auto-match catalog
        </span>
      </div>
      <textarea
        aria-label="Smart paste order text"
        value={pasteText}
        onChange={(e) => {
          setPasteText(e.target.value)
          setPasteResults(null)
        }}
        placeholder={
          'Paste an order, email, or list here…\n\nExample:\n4 x Blue Molar Extractor\n2 x 10 Instruments Sterilisation Cassette'
        }
        style={{ minHeight: 90, marginBottom: 8, fontSize: '.82rem' }}
      />
      <button
        className="btn btn-primary btn-full"
        onClick={runParse}
        disabled={!pasteText.trim()}
        style={{ marginBottom: pasteResults ? 12 : 0 }}
      >
        <Icon name="send" /> Parse &amp; Match
      </button>

      {pasteResults && sorted.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {sorted.map(({ r, i, s }) => (
            <PasteResultRow key={i} r={r} i={i} status={s} onDecide={decide} onUnmatch={unmatch} />
          ))}

          {matchCount > 0 && (
            <button className="btn btn-primary btn-full mt-8" onClick={addMatched}>
              Add {matchCount} matched item{matchCount !== 1 ? 's' : ''} to invoice
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PasteResultRow({ r, i, status, onDecide, onUnmatch }) {
  const isGreen = status === 'auto_match' || status === 'confirmed'
  const isAmber = status === 'best_guess'
  const isRed = status === 'no_match' || status === 'discarded'
  const bg = isGreen
    ? 'rgba(76,175,132,.1)'
    : isAmber
      ? 'rgba(245,166,35,.08)'
      : 'rgba(224,82,82,.08)'
  const border = isGreen
    ? 'rgba(76,175,132,.3)'
    : isAmber
      ? 'rgba(245,166,35,.25)'
      : 'rgba(224,82,82,.3)'
  const prod = r.product ?? r.bestGuess

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        marginBottom: 6,
        background: bg,
        border: `1px solid ${border}`,
      }}
    >
      {isGreen && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--success)' }}>
              ✓ {r.qty} × {prod.name}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
              {r.confidence}% match · {fmt(prod.price)} each
              {status === 'confirmed' && (
                <span style={{ color: 'var(--success)', marginLeft: 6 }}>· Confirmed</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.85rem' }}>
              {fmt(r.qty * prod.price)}
            </span>
            <button
              className="btn btn-sm"
              title="Wrong match — remove"
              style={{
                padding: '3px 7px',
                fontSize: '.75rem',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                background: 'transparent',
              }}
              onClick={() => onUnmatch(i)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {isAmber && (
        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 2 }}>
            &ldquo;{r.name}&rdquo; — {r.confidence}% match
          </div>
          <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: 8 }}>
            Best guess: {r.bestGuess.name}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-sm"
              style={{
                flex: 1,
                background: 'rgba(76,175,132,.15)',
                color: 'var(--success)',
                border: '1px solid rgba(76,175,132,.3)',
                fontSize: '.78rem',
              }}
              onClick={() => onDecide(i, 'confirmed')}
            >
              ✓ Confirm
            </button>
            <button
              className="btn btn-sm"
              style={{
                flex: 1,
                background: 'rgba(224,82,82,.1)',
                color: 'var(--danger)',
                border: '1px solid rgba(224,82,82,.25)',
                fontSize: '.78rem',
              }}
              onClick={() => onDecide(i, 'discarded')}
            >
              ✗ Discard
            </button>
          </div>
        </div>
      )}

      {isRed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ fontSize: '.82rem', color: 'var(--danger)' }}>
            ✗ No match — &ldquo;{r.name}&rdquo;
            {status === 'discarded' && (
              <span style={{ fontSize: '.72rem', color: 'var(--muted)', marginLeft: 6 }}>
                Discarded
              </span>
            )}
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
              Add manually then tap Handled
            </div>
          </div>
          <button
            onClick={() => onDecide(i, 'dismissed')}
            style={{
              flexShrink: 0,
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--muted)',
              fontSize: '.72rem',
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            Handled
          </button>
        </div>
      )}
    </div>
  )
}
