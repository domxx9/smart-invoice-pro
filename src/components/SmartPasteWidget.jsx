import { useRef, useState } from 'react'
import { cleanWhatsApp, extractItems, matchItems, fmt } from '../helpers.js'
import { isSmartPasteContextSet } from '../contexts/SettingsContext.jsx'
import { runCatalogSearch } from '../catalog/search.js'
import { SEARCH_TIER_BYOK } from '../catalog/tier.js'
import { getSecret } from '../secure-storage.js'
import { logger } from '../utils/logger.js'
import { saveCorrection } from '../services/correctionStore.js'
import { Icon } from './Icon.jsx'
import { SmartPasteFeedbackModal } from './SmartPasteFeedbackModal.jsx'

const AI_CONFIDENCE_FLOOR = 65
// Mirrors MATCH_BATCH_SIZE in src/ai/smartPastePipeline.js — kept in sync so
// the widget can compute row ranges from a batchIndex when the pipeline only
// emits a start event (error path).
const MATCH_BATCH_SIZE = 2

function getPasteStatus(r, i, decisions) {
  const d = decisions[i]
  if (d === 'dismissed') return 'dismissed'
  // SMA-100: `saved` marks rows already committed to the invoice by
  // autoAddMatches. Shown like auto_match but with a "Saved" badge and
  // excluded from the "Add N matched" button count.
  if (d === 'saved') return 'saved'
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
  saved: 2,
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
  searchTier,
  byokProvider,
}) {
  const [pasteText, setPasteText] = useState('')
  const [pasteResults, setPasteResults] = useState(null)
  const [pasteDecisions, setPasteDecisions] = useState({})
  const [visibleRowCount, setVisibleRowCount] = useState(0)
  const [batchFailed, setBatchFailed] = useState({})
  // SMA-99: processing state drives the spinner/progress card that replaces
  // the textarea during AI work. Shape: { phase, completedSteps, totalSteps }.
  // `totalSteps === 0` while the extract phase is running (indeterminate);
  // once Stage 1 completes we know `1 + totalBatches` and render a bar.
  const [processing, setProcessing] = useState(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [skipHint, setSkipHint] = useState(null)
  // SMA-123: shown when tier=byok but no BYOK key is configured. Search
  // falls back to BM25 so the user still gets results, but they need to
  // finish setup for accurate AI matching on large catalogs.
  const [byokKeyBannerVisible, setByokKeyBannerVisible] = useState(false)
  // SMA-100: row indices already auto-added to the invoice this parse session.
  // Used to dedupe when a batch's data flows into `setPasteResults` more than
  // once (progressive stream + final replace), or if onStage double-fires.
  const autoAddedRef = useRef(new Set())
  // SMA-173: track corrections for feedback loop
  const [corrections, setCorrections] = useState({})
  const [feedbackModal, setFeedbackModal] = useState(null)
  const rawPasteRef = useRef('')

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

  const resetForNextPaste = () => {
    setPasteText('')
    setPasteResults(null)
    setPasteDecisions({})
    setVisibleRowCount(0)
    setBatchFailed({})
    setProcessing(null)
    setSkipHint(null)
    setCorrections({})
    autoAddedRef.current = new Set()
    rawPasteRef.current = ''
  }

  // SMA-173: user picks the correct product for a row
  const correctRow = (i, product) => {
    const row = pasteResults?.[i]
    if (!row || !product) return
    setCorrections((prev) => ({
      ...prev,
      [i]: {
        originalText: row.name,
        aiMatch: row.product?.name ?? row.bestGuess?.name ?? null,
        confidence: row.confidence,
        correctedProduct: product.name,
        correctedProductId: product.id,
      },
    }))
    setPasteResults((prev) => {
      if (!prev) return prev
      const updated = [...prev]
      updated[i] = { ...updated[i], product, bestGuess: null, confidence: 100 }
      return updated
    })
    decide(i, 'confirmed')
  }

  // SMA-100: commit any auto_match rows in `rows` to the invoice via
  // `onAddItems` and mark them `saved` so the "Add N matched" button excludes
  // them and they no longer offer an ✕ unmatch action.
  // `offset` maps local indices in `rows` to the corresponding pasteResults
  // indices (batches arrive at an offset; full sweeps start at 0).
  const autoAddMatches = (rows, offset = 0) => {
    if (!Array.isArray(rows) || rows.length === 0) return
    const toAdd = []
    const savedIdx = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r || !r.product) continue
      const idx = offset + i
      if (autoAddedRef.current.has(idx)) continue
      autoAddedRef.current.add(idx)
      toAdd.push({ desc: r.product.name, qty: r.qty, price: r.product.price })
      savedIdx.push(idx)
    }
    if (!toAdd.length) return
    onAddItems?.(toAdd)
    setPasteDecisions((prev) => {
      const next = { ...prev }
      savedIdx.forEach((i) => {
        next[i] = 'saved'
      })
      return next
    })
  }

  const runParse = async () => {
    if (!pasteText.trim()) return
    setPasteDecisions({})
    setBatchFailed({})
    setSkipHint(null)
    setCorrections({})
    rawPasteRef.current = pasteText.trim()
    // SMA-100: fresh parse session → drop prior auto-add bookkeeping before
    // any row flows into the invoice below.
    autoAddedRef.current = new Set()

    const cleaned = cleanWhatsApp(pasteText)
    const extracted = extractItems(cleaned)
    const fuzzyRows = matchItems(extracted, products)
    setPasteResults(fuzzyRows)

    const lowConfidenceCount = fuzzyRows.filter(
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
      // No AI work to do — reveal fuzzy rows immediately, stay idle.
      setProcessing(null)
      setVisibleRowCount(fuzzyRows.length)
      // SMA-100: no pipeline will run, so commit fuzzy auto_matches now.
      autoAddMatches(fuzzyRows, 0)
      return
    }

    logger.info('smartPaste.pipeline_started', {
      rowCount: fuzzyRows.length,
      lowConfidenceCount,
    })

    // Kick off the processing UX: hide rows + textarea, show the spinner card.
    setVisibleRowCount(0)
    setProcessing({ phase: 'extract', completedSteps: 0, totalSteps: 0 })

    const onStage = (event) => {
      if (!event || typeof event !== 'object') return
      const { stage, status, batchIndex, totalBatches, error } = event
      if (stage === 'extract') {
        if (status === 'complete') {
          const total = 1 + (Number(totalBatches) || 0)
          setProcessing({ phase: 'matching', completedSteps: 1, totalSteps: total })
        }
        return
      }
      if (stage !== 'match') return

      if (error) {
        // SMA-99: a failed batch still "finished" — advance progress, reveal
        // those rows (they stay as fuzzy fallbacks), and flag them so the user
        // sees a `· batch failed` marker on each.
        const start = (Number(batchIndex) || 0) * MATCH_BATCH_SIZE
        setBatchFailed((prev) => {
          const next = { ...prev }
          for (let k = 0; k < MATCH_BATCH_SIZE; k++) next[start + k] = true
          return next
        })
        setVisibleRowCount((prev) => Math.max(prev, start + MATCH_BATCH_SIZE))
        setProcessing((prev) =>
          prev ? { ...prev, completedSteps: prev.completedSteps + 1 } : prev,
        )
        return
      }

      if (status !== 'complete') return
      const offset = Number(event.offset) || 0
      const batchRows = Array.isArray(event.batchRows) ? event.batchRows : []
      const convertedBatch = batchRows.map(convertPipelineRow)
      setPasteResults((prev) => {
        const next = prev ? [...prev] : []
        convertedBatch.forEach((row, i) => {
          next[offset + i] = row
        })
        return next
      })
      setVisibleRowCount((prev) => Math.max(prev, offset + convertedBatch.length))
      setProcessing((prev) => (prev ? { ...prev, completedSteps: prev.completedSteps + 1 } : prev))
      // SMA-100: commit this batch's auto_matches to the invoice so a
      // mid-pipeline navigation does not drop them.
      autoAddMatches(convertedBatch, offset)
    }

    // SMA-123: dispatch through the tier router. `runCatalogSearch` picks
    // between the SMA-117 local pipeline, a BYOK LLM call, or a BM25
    // fallback when the tier is `byok` but no key is configured.
    const byokApiKeyConfigured =
      searchTier === SEARCH_TIER_BYOK && aiMode === 'byok' && !!byokProvider
        ? !!(await getSecret(`sip_byok_${byokProvider}`))
        : false

    const invokePipeline = () =>
      runCatalogSearch({
        tier: searchTier,
        byok: { aiMode, byokProvider, byokApiKeyConfigured },
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
          setProcessing(null)
          setVisibleRowCount(fuzzyRows.length)
          toast?.('AI extract failed — using fallback')
          return
        }
      } else {
        logger.error('smartPaste.pipeline_threw', { message })
        setProcessing(null)
        setVisibleRowCount(fuzzyRows.length)
        toast?.('AI extract failed — using fallback')
        return
      }
    }

    if (!pipelineResult || pipelineResult.fallback) {
      // SMA-78: the on-device small model can hang indefinitely on
      // pathological pastes. When the pipeline aborts via the wall-clock
      // guard, route the user toward BYOK instead of silently blaming "AI".
      setProcessing(null)
      setVisibleRowCount(fuzzyRows.length)
      if (pipelineResult?.fallbackReason === 'stage1_timeout') {
        toast?.('On-device model taking too long — try cloud (BYOK)')
      } else {
        toast?.('AI extract failed — using fallback')
      }
      return
    }

    if (pipelineResult.mode === 'bm25_fallback') {
      // SMA-123: tier=byok + no BYOK key → surface the banner and show
      // lexical-only rows. Rows already match the pipeline shape, so the
      // widget renders them through the same conversion pathway.
      setByokKeyBannerVisible(true)
    } else {
      setByokKeyBannerVisible(false)
    }

    const converted = pipelineResult.rows.map(convertPipelineRow)
    setPasteResults(converted)
    // SMA-100: pasteDecisions is NOT reset here — per-batch auto-add already
    // wrote `saved` markers for committed rows, and resetting would let them
    // reappear as auto_match (and double-add on the final sweep below).
    setBatchFailed({})
    setVisibleRowCount(converted.length)
    setProcessing(null)
    // SMA-100: defensive final sweep — picks up any auto_match rows whose
    // batch-complete event was dropped (test mocks, partial stream paths).
    autoAddMatches(converted, 0)
  }

  const addMatched = () => {
    if (!pasteResults) return
    const newDecisions = { ...pasteDecisions }
    const toAdd = []
    pasteResults.forEach((r, i) => {
      if (!r) return
      const s = getPasteStatus(r, i, pasteDecisions)
      if (s === 'auto_match' || s === 'confirmed') {
        const prod = r.product ?? r.bestGuess
        toAdd.push({ desc: prod.name, qty: r.qty, price: prod.price })
        newDecisions[i] = 'dismissed'
      }
    })
    if (!toAdd.length) return
    onAddItems(toAdd)

    const correctionList = Object.values(corrections)
    correctionList.forEach((c) => {
      saveCorrection({
        originalText: c.originalText,
        correctedProductId: c.correctedProductId,
        correctedProductName: c.correctedProduct,
      })
    })

    if (correctionList.length > 0) {
      setFeedbackModal({ corrections: correctionList, rawText: rawPasteRef.current })
    }

    const allGone = pasteResults.every((r, i) => !r || newDecisions[i] === 'dismissed')
    if (allGone && !correctionList.length) resetForNextPaste()
    else setPasteDecisions(newDecisions)
  }

  const sorted = pasteResults
    ? pasteResults
        .map((r, i) =>
          r && i < visibleRowCount ? { r, i, s: getPasteStatus(r, i, pasteDecisions) } : null,
        )
        .filter(Boolean)
        .filter(({ s }) => s !== 'dismissed')
        .sort((a, b) => PASTE_SORT[a.s] - PASTE_SORT[b.s])
    : []
  const matchCount = sorted.filter(({ s }) => s === 'auto_match' || s === 'confirmed').length

  const showIdleInput = !processing && !pasteResults
  const showResults = !!pasteResults && visibleRowCount > 0 && sorted.length > 0

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

      {byokKeyBannerVisible && (
        <div
          role="note"
          data-testid="smart-paste-byok-key-banner"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 8,
            marginBottom: 10,
            background: 'rgba(245,166,35,.08)',
            border: '1px solid rgba(245,166,35,.3)',
          }}
        >
          <div style={{ flex: 1, fontSize: '.78rem', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>BYOK key required</div>
            <div style={{ color: 'var(--muted)' }}>
              This catalog is too large for on-device search. Matches shown now use a lexical
              fallback. Add a BYOK key for accurate AI matching —{' '}
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
                open Settings → AI
              </a>
              .
            </div>
          </div>
          <button
            type="button"
            onClick={() => setByokKeyBannerVisible(false)}
            aria-label="Dismiss BYOK key banner"
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

      {showIdleInput && (
        <>
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
            disabled={!pasteText.trim()}
          >
            <Icon name="send" /> Parse &amp; Match
          </button>
        </>
      )}

      {processing && <SmartPasteProcessingCard processing={processing} />}

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

      {!processing && pasteResults && <PasteMoreBar onClick={resetForNextPaste} />}

      {showResults && (
        <div style={{ marginTop: 8 }}>
          {sorted.map(({ r, i, s }) => (
            <PasteResultRow
              key={i}
              r={r}
              i={i}
              status={s}
              failed={!!batchFailed[i]}
              products={products}
              onDecide={decide}
              onUnmatch={unmatch}
              onCorrect={correctRow}
            />
          ))}

          {!processing && matchCount > 0 && (
            <button className="btn btn-primary btn-full mt-8" onClick={addMatched}>
              Add {matchCount} matched item{matchCount !== 1 ? 's' : ''} to invoice
            </button>
          )}
        </div>
      )}

      {feedbackModal && (
        <SmartPasteFeedbackModal
          corrections={feedbackModal.corrections}
          rawText={feedbackModal.rawText}
          toast={toast}
          onClose={() => {
            setFeedbackModal(null)
            resetForNextPaste()
          }}
        />
      )}
    </div>
  )
}

function SmartPasteProcessingCard({ processing }) {
  const { phase, completedSteps, totalSteps } = processing
  const indeterminate = !totalSteps || totalSteps <= 0
  const pct = indeterminate ? 0 : Math.min(100, Math.round((completedSteps / totalSteps) * 100))
  const label =
    phase === 'extract'
      ? 'Reading your paste…'
      : indeterminate
        ? 'Matching items…'
        : completedSteps >= totalSteps
          ? 'Finalizing…'
          : `Matching items — ${completedSteps} of ${totalSteps}`
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="smart-paste-processing"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 14px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'rgba(245,166,35,.04)',
      }}
    >
      <span
        className="ptr-spinner"
        data-testid="smart-paste-spinner"
        style={{ animation: 'spin 0.9s linear infinite' }}
        aria-hidden="true"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          data-testid="smart-paste-processing-label"
          style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--accent)' }}
        >
          {label}
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          data-testid="smart-paste-progress"
          style={{
            marginTop: 8,
            height: 4,
            borderRadius: 2,
            background: 'var(--border)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {indeterminate ? (
            <div
              className="sip-progress-indeterminate"
              style={{
                position: 'absolute',
                inset: 0,
                width: '40%',
                background: 'var(--accent)',
                borderRadius: 2,
              }}
            />
          ) : (
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width .25s ease',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function PasteMoreBar({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="smart-paste-more-bar"
      className="btn btn-full"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '8px 12px',
        fontSize: '.78rem',
        color: 'var(--muted)',
        background: 'transparent',
        border: '1px dashed var(--border)',
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      + Paste more text
    </button>
  )
}

function PasteResultRow({ r, i, status, failed, products, onDecide, onUnmatch, onCorrect }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')
  // SMA-100: `saved` rows render in the same green band as auto_match but
  // display a "Saved to invoice" badge and hide the ✕ unmatch action — the
  // line item is already in the invoice below and the user edits it there.
  const isSaved = status === 'saved'
  const isGreen = isSaved || status === 'auto_match' || status === 'confirmed'
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
              {isSaved && (
                <span
                  data-testid={`saved-badge-${i}`}
                  style={{ color: 'var(--success)', marginLeft: 6 }}
                >
                  · Saved to invoice
                </span>
              )}
              {failedMarker}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.85rem' }}>
              {fmt(r.qty * prod.price)}
            </span>
            {!isSaved && (
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
            )}
          </div>
        </div>
      )}

      {isAmber && (
        <div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 2 }}>
            &ldquo;{r.name}&rdquo; — {r.confidence}% match
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
            <button
              className="btn btn-sm"
              onClick={() => {
                setPickerOpen(!pickerOpen)
                setPickerFilter('')
              }}
              style={{
                flex: 1,
                fontSize: '.75rem',
                background: 'rgba(90,140,255,.08)',
                color: 'var(--accent)',
                border: '1px solid rgba(90,140,255,.25)',
              }}
            >
              Pick
            </button>
          </div>
          {pickerOpen && (
            <ProductPicker
              products={products}
              filter={pickerFilter}
              onFilter={setPickerFilter}
              onSelect={(p) => {
                onCorrect(i, p)
                setPickerOpen(false)
              }}
            />
          )}
        </div>
      )}

      {isRed && (
        <div>
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
              {failedMarker}
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
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                setPickerOpen(!pickerOpen)
                setPickerFilter('')
              }}
              style={{
                flex: 1,
                fontSize: '.75rem',
                background: 'rgba(90,140,255,.08)',
                color: 'var(--accent)',
                border: '1px solid rgba(90,140,255,.25)',
              }}
            >
              {pickerOpen ? 'Cancel' : 'Pick correct product'}
            </button>
          </div>
          {pickerOpen && (
            <ProductPicker
              products={products}
              filter={pickerFilter}
              onFilter={setPickerFilter}
              onSelect={(p) => {
                onCorrect(i, p)
                setPickerOpen(false)
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

function ProductPicker({ products, filter, onFilter, onSelect }) {
  const lc = filter.toLowerCase()
  const filtered = (products || [])
    .filter((p) => !lc || p.name.toLowerCase().includes(lc))
    .slice(0, 8)

  return (
    <div
      style={{
        marginTop: 6,
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: 'var(--card)',
        maxHeight: 180,
        overflow: 'auto',
      }}
    >
      <input
        type="text"
        placeholder="Search products…"
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '.75rem',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {filtered.length === 0 && (
        <div style={{ padding: '8px 10px', fontSize: '.72rem', color: 'var(--muted)' }}>
          No products found
        </div>
      )}
      {filtered.map((p) => (
        <button
          key={p.id ?? p.name}
          type="button"
          onClick={() => onSelect(p)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 10px',
            fontSize: '.75rem',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          {p.name}
          {p.price != null && (
            <span style={{ float: 'right', color: 'var(--muted)' }}>{fmt(p.price)}</span>
          )}
        </button>
      ))}
    </div>
  )
}
