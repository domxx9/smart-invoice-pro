import { useState } from 'react'
import { cleanWhatsApp, extractItems, matchItems, fmt } from '../helpers.js'
import { runSmartPastePipeline } from '../ai/smartPastePipeline.js'
import { isSmartPasteContextSet } from '../contexts/SettingsContext.jsx'
import { logger } from '../utils/logger.js'
import { Icon } from './Icon.jsx'

const AI_CONFIDENCE_FLOOR = 65
// Mirrors MATCH_BATCH_SIZE in src/ai/smartPastePipeline.js — kept in sync so
// the widget can map `batchIndex` back to row indices for spinners.
const MATCH_BATCH_SIZE = 2

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

function convertPipelineRow(row) {
  const product = row?.product || null
  const confidence = Math.max(0, Math.min(100, Math.round(row?.confidence ?? 0)))
  const aiPicked = row?.source === 'ai' && !!product
  // Pipeline rows surface a single `product` candidate with a confidence score.
  // Treat AI-picked rows at or above the confidence floor as auto-matches;
  // lower-confidence AI picks and fuzzy-only candidates land in `bestGuess` so
  // the user still confirms them explicitly.
  return {
    name: row?.extracted?.text ?? row?.extracted?.description ?? '',
    qty: Math.max(1, Math.floor(row?.extracted?.qty ?? 1)),
    product: aiPicked && confidence >= AI_CONFIDENCE_FLOOR ? product : null,
    bestGuess: aiPicked && confidence >= AI_CONFIDENCE_FLOOR ? null : product,
    confidence,
    aiSuggested: row?.source === 'ai',
  }
}

export function SmartPasteWidget({
  products,
  onAddItems,
  aiMode,
  aiReady,
  runInference,
  toast,
  smartPasteContext,
  onOpenSettings,
}) {
  const [pasteText, setPasteText] = useState('')
  const [pasteResults, setPasteResults] = useState(null)
  const [pasteDecisions, setPasteDecisions] = useState({})
  const [aiPending, setAiPending] = useState({})
  const [batchFailed, setBatchFailed] = useState({})
  const [pipelineStage, setPipelineStage] = useState(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [skipHint, setSkipHint] = useState(null)

  const contextReady = isSmartPasteContextSet({ smartPasteContext })
  const showContextBanner = aiMode === 'byok' && !contextReady && !bannerDismissed

  const decide = (i, val) => setPasteDecisions((d) => ({ ...d, [i]: val }))
  const unmatch = (i) =>
    setPasteResults((prev) => {
      if (!prev) return prev
      const updated = [...prev]
      updated[i] = {
        ...updated[i],
        product: null,
        bestGuess: null,
        confidence: 0,
      }
      return updated
    })

  const handleOpenSettings = (e) => {
    if (typeof onOpenSettings === 'function') {
      e.preventDefault()
      onOpenSettings('smart-paste-ai-context')
    }
  }

  const runParse = async () => {
    if (!pasteText.trim()) return
    setPasteDecisions({})
    setAiPending({})
    setBatchFailed({})
    setPipelineStage(null)
    setSkipHint(null)

    const cleaned = cleanWhatsApp(pasteText)
    const extracted = extractItems(cleaned)
    const results = matchItems(extracted, products)
    setPasteResults(results)

    const lowConfidenceCount = results.filter(
      (r) => !r.product && (r.confidence ?? 0) < AI_CONFIDENCE_FLOOR,
    ).length

    let skipReason = null
    if (aiMode !== 'byok' && aiMode !== 'small') skipReason = 'mode_off'
    else if (aiMode === 'small' && !aiReady) skipReason = 'model_not_loaded'
    else if (aiMode === 'byok' && !contextReady) skipReason = 'context_missing'
    else if (typeof runInference !== 'function') skipReason = 'no_runinference'
    else if (!products?.length) skipReason = 'no_products'
    else if (lowConfidenceCount === 0) skipReason = 'no_low_confidence_rows'

    if (skipReason) {
      logger.info('smartPaste.pipeline_skipped', { reason: skipReason })
      if (
        skipReason === 'context_missing' ||
        skipReason === 'no_products' ||
        skipReason === 'model_not_loaded'
      ) {
        setSkipHint(skipReason)
      }
      return
    }

    logger.info('smartPaste.pipeline_started', { rowCount: results.length, lowConfidenceCount })

    const onStage = ({ stage, batchIndex, error }) => {
      if (stage === 'extract') {
        setPipelineStage('extract')
        return
      }
      if (stage !== 'match') return
      setPipelineStage('match')
      const start = batchIndex * MATCH_BATCH_SIZE
      const indices = []
      for (let k = 0; k < MATCH_BATCH_SIZE; k++) indices.push(start + k)
      if (error) {
        setAiPending((prev) => {
          const next = { ...prev }
          indices.forEach((i) => delete next[i])
          return next
        })
        setBatchFailed((prev) => {
          const next = { ...prev }
          indices.forEach((i) => {
            next[i] = true
          })
          return next
        })
      } else {
        setAiPending(() => {
          const next = {}
          indices.forEach((i) => {
            next[i] = true
          })
          return next
        })
      }
    }

    const invokePipeline = () =>
      runSmartPastePipeline({
        text: cleaned,
        products,
        context: smartPasteContext,
        runInference,
        onStage,
      })

    let pipelineResult
    try {
      pipelineResult = await invokePipeline()
    } catch (err) {
      const message = String(err?.message ?? err)
      // BYOK secret hydrates asynchronously from secure storage on app start.
      // If Parse fires before hydration completes, retry once after a short
      // tick instead of surfacing the generic fallback toast.
      if (aiMode === 'byok' && message.includes('API key not configured')) {
        logger.warn('smartPaste.byok_key_not_hydrated_yet', { message })
        await new Promise((resolve) => setTimeout(resolve, 200))
        try {
          pipelineResult = await invokePipeline()
        } catch (err2) {
          logger.error('smartPaste.pipeline_threw', {
            message: String(err2?.message ?? err2),
          })
          setPipelineStage(null)
          setAiPending({})
          toast?.('AI extract failed — using fallback')
          return
        }
      } else {
        logger.error('smartPaste.pipeline_threw', { message })
        setPipelineStage(null)
        setAiPending({})
        toast?.('AI extract failed — using fallback')
        return
      }
    }

    setPipelineStage(null)
    setAiPending({})

    if (!pipelineResult || pipelineResult.fallback) {
      toast?.('AI extract failed — using fallback')
      return
    }

    const converted = pipelineResult.rows.map(convertPipelineRow)
    setPasteResults(converted)
    setPasteDecisions({})
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

      {showContextBanner && (
        <div
          role="note"
          data-testid="smart-paste-context-banner"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 8,
            marginBottom: 10,
            background: 'rgba(90,140,255,.08)',
            border: '1px solid rgba(90,140,255,.3)',
          }}
        >
          <div style={{ flex: 1, fontSize: '.78rem', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Set up AI context</div>
            <div style={{ color: 'var(--muted)' }}>
              Tell Smart Paste what you sell and who you sell to so AI matching stays accurate.{' '}
              <a
                href="#smart-paste-ai-context"
                onClick={handleOpenSettings}
                style={{ color: 'var(--accent)', fontWeight: 600 }}
              >
                Open Settings
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss AI context banner"
            style={{
              flexShrink: 0,
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '.95rem',
              cursor: 'pointer',
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>
      )}

      <textarea
        aria-label="Smart paste order text"
        value={pasteText}
        onChange={(e) => {
          setPasteText(e.target.value)
          setPasteResults(null)
          setSkipHint(null)
        }}
        placeholder={
          'Paste an order, email, or list here…\n\nExample:\n4 x Blue Molar Extractor\n2 x 10 Instruments Sterilisation Cassette'
        }
        style={{ minHeight: 90, marginBottom: 8, fontSize: '.82rem' }}
      />
      <button
        className="btn btn-primary btn-full"
        onClick={runParse}
        disabled={!pasteText.trim() || pipelineStage !== null}
        style={{ marginBottom: pasteResults ? 12 : 0 }}
      >
        <Icon name="send" /> Parse &amp; Match
      </button>

      {pipelineStage === 'extract' && (
        <div
          role="status"
          aria-live="polite"
          data-testid="smart-paste-parsing"
          style={{ fontSize: '.75rem', color: 'var(--accent)', marginTop: 8 }}
        >
          Parsing…
        </div>
      )}

      {skipHint && (
        <div
          role="note"
          data-testid="smart-paste-skip-hint"
          style={{
            fontSize: '.72rem',
            color: 'var(--muted)',
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          {skipHint === 'context_missing' && (
            <>
              AI context missing —{' '}
              <a
                href="#smart-paste-ai-context"
                onClick={handleOpenSettings}
                style={{ color: 'var(--accent)', fontWeight: 600 }}
              >
                set it up in Settings
              </a>
            </>
          )}
          {skipHint === 'model_not_loaded' && (
            <>
              On-device model isn&rsquo;t loaded —{' '}
              <a
                href="#ai"
                onClick={(e) => {
                  if (typeof onOpenSettings === 'function') {
                    e.preventDefault()
                    onOpenSettings('ai')
                  }
                }}
                style={{ color: 'var(--accent)', fontWeight: 600 }}
              >
                Load into memory in Settings → AI
              </a>
            </>
          )}
          {skipHint === 'no_products' && <>Catalog is empty — sync products first</>}
        </div>
      )}

      {pasteResults && sorted.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {sorted.map(({ r, i, s }) => (
            <PasteResultRow
              key={i}
              r={r}
              i={i}
              status={s}
              pending={!!aiPending[i]}
              failed={!!batchFailed[i]}
              onDecide={decide}
              onUnmatch={unmatch}
            />
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

function PasteResultRow({ r, i, status, pending, failed, onDecide, onUnmatch }) {
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

  const failedMarker = failed ? (
    <span
      data-testid={`batch-failed-${i}`}
      style={{ marginLeft: 6, color: 'var(--danger)', fontSize: '.7rem' }}
    >
      · batch failed
    </span>
  ) : null

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
              {failedMarker}
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
            {pending && (
              <span
                aria-label="AI matching"
                role="status"
                data-testid={`ai-pending-${i}`}
                style={{ marginLeft: 6, color: 'var(--accent)' }}
              >
                · AI matching…
              </span>
            )}
            {failedMarker}
          </div>
          <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: 8 }}>
            {r.aiSuggested ? 'AI suggested: ' : 'Best guess: '}
            {r.bestGuess.name}
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
            {pending && (
              <span
                aria-label="AI matching"
                role="status"
                data-testid={`ai-pending-${i}`}
                style={{ fontSize: '.72rem', color: 'var(--accent)', marginLeft: 6 }}
              >
                · AI matching…
              </span>
            )}
            {failedMarker}
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
