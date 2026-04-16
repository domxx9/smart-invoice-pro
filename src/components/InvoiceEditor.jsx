import { useState, useEffect } from 'react'
import { calcTotals, fmt, cleanWhatsApp, extractItems, matchItems, searchGroups, groupProducts, getTopCandidates } from '../helpers.js'
import { savePDFToPhone, sharePDF, openPDF, getPDFFilename, pdfFileExists } from '../pdf.js'
import { matchWithGemma } from '../gemma.js'
import { Icon } from './Icon.jsx'

function getPasteStatus(r, i, decisions) {
  const d = decisions[i]
  if (d === 'dismissed') return 'dismissed'
  if (d === 'confirmed') return 'confirmed'
  if (d === 'discarded') return 'discarded'
  if (r.product)   return 'auto_match'
  if (r.bestGuess) return 'best_guess'
  return 'no_match'
}

const PASTE_SORT = { no_match: 0, discarded: 0, best_guess: 1, auto_match: 2, confirmed: 2, dismissed: 3 }

const WORKFLOW = {
  new:       { label: 'Mark as Sent',     next: 'pending',   danger: false, sendPDF: false },
  pending:   { label: 'Fulfil Order',     next: 'fulfilled', danger: false, sendPDF: false },
  fulfilled: { label: 'Payment Received', next: 'paid',      danger: false, sendPDF: false },
  paid:      { label: 'Return',           next: 'refunded',  danger: true,  sendPDF: false },
}

export function InvoiceEditor({ invoice, products, onSave, onClose, onDelete, onDraftChange, aiReady, settings, onToast }) {
  const [inv, setInv] = useState(invoice)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pdfToast, setPdfToast] = useState(null)
  const [overwritePending, setOverwritePending] = useState(null) // { filename, copyName } | null
  const [pasteText, setPasteText] = useState('')
  const [pasteResults, setPasteResults] = useState(null)
  const [pasteDecisions, setPasteDecisions] = useState({})
  const [pasteAiLoading, setPasteAiLoading] = useState(false)
  const [, setPasteAiTokens] = useState('')
  const [pasteAiStage, setPasteAiStage] = useState('')
  const [search, setSearch] = useState('')

  const setField = (k, v) => setInv(p => ({ ...p, [k]: v }))
  const setItem  = (idx, k, v) => setInv(p => {
    const items = [...p.items]
    items[idx] = { ...items[idx], [k]: v }
    return { ...p, items }
  })
  const addItem    = () => setInv(p => ({ ...p, items: [...p.items, { desc: '', qty: 1, price: '' }] }))
  const removeItem = (idx) => setInv(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
  const addProduct = (prod) => {
    setInv(p => ({ ...p, items: [...p.items, { desc: prod.name, qty: 1, price: prod.price }] }))
    setSearch('')
  }

  const decide = (i, val) => setPasteDecisions(d => ({ ...d, [i]: val }))
  const unmatch = (i) => setPasteResults(prev => {
    const updated = [...prev]
    updated[i] = { ...updated[i], product: null, bestGuess: null, confidence: 0, aiEnhanced: false }
    return updated
  })

  useEffect(() => {
    localStorage.setItem('sip_draft_edit', JSON.stringify(inv))
    onDraftChange?.(inv)
  }, [inv]) // eslint-disable-line react-hooks/exhaustive-deps

  const { sub, tax, total } = calcTotals(inv.items, inv.tax)

  const filteredGroups = search.trim() ? searchGroups(groupProducts(products), search) : []

  const runParse = async () => {
    if (!pasteText.trim()) return
    setPasteDecisions({})

    // Step 1: regex parse — always runs, results shown immediately
    const cleaned = cleanWhatsApp(pasteText)
    const extracted = extractItems(cleaned)
    const initial = matchItems(extracted, products)
    setPasteResults(initial)

    // Step 2: AI enhancement — only for low-confidence items, non-blocking
    if (!aiReady) return
    const lowConf = initial.filter(r => r.confidence < 65)
    if (!lowConf.length) return

    setPasteAiLoading(true)
    setPasteAiStage(`Resolving ${lowConf.length} uncertain item${lowConf.length > 1 ? 's' : ''}…`)
    try {
      const updated = [...initial]
      for (let i = 0; i < initial.length; i++) {
        if (initial[i].confidence >= 65) continue
        const candidates = getTopCandidates(initial[i].name, products, 5)
        if (!candidates.length) continue
        const match = await matchWithGemma(initial[i].name, candidates)
        if (match) {
          updated[i] = { ...updated[i], product: match, bestGuess: null, confidence: 90, aiEnhanced: true }
          setPasteResults([...updated])
        }
      }
    } catch (e) {
      console.warn('[SIP] AI enhancement failed:', e?.message)
      onToast?.(`AI match failed: ${e?.message || 'timed out'}`, 'error')
      // regex results already visible — just hide the spinner
    } finally {
      setPasteAiLoading(false)
      setPasteAiTokens('')
      setPasteAiStage('')
    }
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
    setInv(p => ({ ...p, items: [...p.items, ...toAdd] }))
    const allGone = pasteResults.every((_, i) => newDecisions[i] === 'dismissed')
    if (allGone) { setPasteResults(null); setPasteDecisions({}); setPasteText('') }
    else setPasteDecisions(newDecisions)
  }

  return (
    <div style={{ paddingBottom: 140 }}>
      <div className="flex-between mb-16">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{inv.id}</h2>
        <span className={`badge badge-${inv.status}`}>{inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span>
      </div>

      {/* Smart Paste */}
      <div className="ai-box">
        <div className="flex-between mb-8">
          <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--accent)' }}>Smart Paste</span>
          <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Paste order text · auto-match catalog</span>
        </div>
        {pasteAiLoading ? (
          <div style={{
            minHeight: 90, marginBottom: 8, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            padding: '20px 16px',
          }}>
            <span className="ptr-spinner" style={{ width: 28, height: 28, borderWidth: 3, animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '.8rem', color: 'var(--accent)', fontWeight: 600, textAlign: 'center' }}>
              {pasteAiStage || 'Thinking…'}
            </span>
          </div>
        ) : (
          <textarea
            value={pasteText}
            onChange={e => { setPasteText(e.target.value); setPasteResults(null) }}
            placeholder={'Paste an order, email, or list here…\n\nExample:\n4 x Blue Molar Extractor\n2 x 10 Instruments Sterilisation Cassette'}
            style={{ minHeight: 90, marginBottom: 8, fontSize: '.82rem' }}
          />
        )}
        <button
          className="btn btn-primary btn-full"
          onClick={runParse}
          disabled={!pasteText.trim() || pasteAiLoading}
          style={{ marginBottom: pasteResults ? 12 : 0 }}
        >
          <Icon name="send" /> Parse &amp; Match
        </button>

        {pasteResults && (() => {
          const sorted = pasteResults
            .map((r, i) => ({ r, i, s: getPasteStatus(r, i, pasteDecisions) }))
            .filter(({ s }) => s !== 'dismissed')
            .sort((a, b) => PASTE_SORT[a.s] - PASTE_SORT[b.s])
          const matchCount = sorted.filter(({ s }) => s === 'auto_match' || s === 'confirmed').length
          if (!sorted.length) return null
          return (
            <div style={{ marginTop: 8 }}>
              {sorted.map(({ r, i, s }) => {
                const isGreen  = s === 'auto_match' || s === 'confirmed'
                const isAmber  = s === 'best_guess'
                const isRed    = s === 'no_match' || s === 'discarded'
                const bg     = isGreen ? 'rgba(76,175,132,.1)'  : isAmber ? 'rgba(245,166,35,.08)' : 'rgba(224,82,82,.08)'
                const border = isGreen ? 'rgba(76,175,132,.3)'  : isAmber ? 'rgba(245,166,35,.25)' : 'rgba(224,82,82,.3)'
                const prod   = r.product ?? r.bestGuess

                return (
                  <div key={i} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 6, background: bg, border: `1px solid ${border}` }}>
                    {isGreen && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--success)' }}>✓ {r.qty} × {prod.name}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                            {r.aiEnhanced ? '🤖 AI matched' : `${r.confidence}% match`} · {fmt(prod.price)} each
                            {s === 'confirmed' && <span style={{ color: 'var(--success)', marginLeft: 6 }}>· Confirmed</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.85rem' }}>{fmt(r.qty * prod.price)}</span>
                          <button
                            className="btn btn-sm"
                            title="Wrong match — remove"
                            style={{ padding: '3px 7px', fontSize: '.75rem', color: 'var(--muted)', border: '1px solid var(--border)', background: 'transparent' }}
                            onClick={() => unmatch(i)}
                          >✕</button>
                        </div>
                      </div>
                    )}

                    {isAmber && (
                      <div>
                        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 2 }}>&ldquo;{r.name}&rdquo; — {r.confidence}% match</div>
                        <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: 8 }}>Best guess: {r.bestGuess.name}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            style={{ flex: 1, background: 'rgba(76,175,132,.15)', color: 'var(--success)', border: '1px solid rgba(76,175,132,.3)', fontSize: '.78rem' }}
                            onClick={() => decide(i, 'confirmed')}
                          >
                            ✓ Confirm
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ flex: 1, background: 'rgba(224,82,82,.1)', color: 'var(--danger)', border: '1px solid rgba(224,82,82,.25)', fontSize: '.78rem' }}
                            onClick={() => decide(i, 'discarded')}
                          >
                            ✗ Discard
                          </button>
                        </div>
                      </div>
                    )}

                    {isRed && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: '.82rem', color: 'var(--danger)' }}>
                          ✗ No match — &ldquo;{r.name}&rdquo;
                          {s === 'discarded' && <span style={{ fontSize: '.72rem', color: 'var(--muted)', marginLeft: 6 }}>Discarded</span>}
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Add manually then tap Handled</div>
                        </div>
                        <button
                          onClick={() => decide(i, 'dismissed')}
                          style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: '.72rem', padding: '4px 8px', cursor: 'pointer' }}
                        >
                          Handled
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {matchCount > 0 && (
                <button className="btn btn-primary btn-full mt-8" onClick={addMatched}>
                  Add {matchCount} matched item{matchCount !== 1 ? 's' : ''} to invoice
                </button>
              )}
            </div>
          )
        })()}
      </div>

      {/* Customer details */}
      <div className="card">
        <div className="invoice-meta">
          <div className="field">
            <label>Customer Name</label>
            <input value={inv.customer || ''} onChange={e => setField('customer', e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="field">
            <label>Business Name</label>
            <input value={inv.customerBusiness || ''} onChange={e => setField('customerBusiness', e.target.value)} placeholder="Acme Corp (optional)" />
          </div>
          <div className="field">
            <label>Email</label>
            <input value={inv.email || ''} onChange={e => setField('email', e.target.value)} placeholder="billing@acme.com" type="email" />
          </div>
          <div className="field">
            <label>Address Line 1</label>
            <input value={inv.address1 || ''} onChange={e => setField('address1', e.target.value)} placeholder="123 High Street" />
          </div>
          <div className="field">
            <label>Address Line 2</label>
            <input value={inv.address2 || ''} onChange={e => setField('address2', e.target.value)} placeholder="Suite / Unit (optional)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>City</label>
              <input value={inv.city || ''} onChange={e => setField('city', e.target.value)} placeholder="London" />
            </div>
            <div className="field">
              <label>Postcode / ZIP</label>
              <input value={inv.postcode || ''} onChange={e => setField('postcode', e.target.value)} placeholder="SW1A 1AA" />
            </div>
          </div>
          <div className="field">
            <label>Country</label>
            <input value={inv.country || ''} onChange={e => setField('country', e.target.value)} placeholder="United Kingdom" />
          </div>
          <div className="field">
            <label>Invoice Date</label>
            <input value={inv.date} onChange={e => setField('date', e.target.value)} type="date" />
          </div>
          <div className="field">
            <label>Due Date</label>
            <input value={inv.due} onChange={e => setField('due', e.target.value)} type="date" />
          </div>
          <div className="field">
            <label>Tax %</label>
            <input value={inv.tax} onChange={e => setField('tax', e.target.value)} type="number" min="0" max="100" />
          </div>
        </div>

        {/* Product search */}
        <div className="field">
          <label>Add from catalog</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" />
          {filteredGroups.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
              {filteredGroups.map((g, gi) => {
                const single = g.variants.length === 1 && !g.variants[0].name.includes(' — ')
                return (
                  <div key={g.name} style={{ borderBottom: gi < filteredGroups.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {single && (
                      <div onClick={() => addProduct(g.variants[0])}
                        style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '.88rem' }}>{g.name}</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '.85rem' }}>{fmt(g.variants[0].price)}</span>
                      </div>
                    )}
                    {!single && (
                      <>
                        <div style={{ padding: '8px 12px 4px', fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600, letterSpacing: .3 }}>{g.name}</div>
                        {g.variants.map((v, vi) => {
                          const label = v.name.includes(' — ') ? v.name.split(' — ').slice(1).join(' — ') : v.name
                          return (
                            <div key={v.id} onClick={() => addProduct(v)}
                              style={{
                                padding: '8px 12px 8px 22px', cursor: 'pointer', display: 'flex',
                                justifyContent: 'space-between', alignItems: 'center',
                                borderTop: vi === 0 ? '1px solid var(--border)' : 'none',
                                background: 'var(--card)',
                              }}>
                              <span style={{ fontSize: '.85rem' }}>{label}</span>
                              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '.85rem' }}>{fmt(v.price)}</span>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Line items */}
        <div>
          {inv.items.map((item, idx) => (
            <div key={idx} className="line-item">
              <div className="field" style={{ marginBottom: 0 }}>
                {idx === 0 && <label>Description</label>}
                <input value={item.desc} onChange={e => setItem(idx, 'desc', e.target.value)} placeholder="Service or product description" />
              </div>
              <div className="li-row2">
                <div className="li-qty field" style={{ marginBottom: 0 }}>
                  {idx === 0 && <label>Qty</label>}
                  <input value={item.qty} onChange={e => setItem(idx, 'qty', e.target.value)} type="number" min="1" />
                </div>
                <div className="li-price field" style={{ marginBottom: 0 }}>
                  {idx === 0 && <label>Unit Price</label>}
                  <input value={item.price} onChange={e => setItem(idx, 'price', e.target.value)} type="number" min="0" placeholder="0.00" />
                </div>
                <div className="li-total">{fmt((parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0))}</div>
                <div className="li-del">
                  <button className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)} style={{ padding: '6px 8px' }}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-ghost btn-sm btn-full mt-8" onClick={addItem}>
          <Icon name="plus" /> Add Line Item
        </button>

        <div className="totals">
          <div className="total-line"><span>Subtotal</span><span>{fmt(sub)}</span></div>
          <div className="total-line"><span>Tax ({inv.tax}%)</span><span>{fmt(tax)}</span></div>
          <div className="total-line grand"><span>Total</span><span>{fmt(total)}</span></div>
        </div>

        <div className="field mt-8">
          <label>Notes</label>
          <textarea value={inv.notes} onChange={e => setField('notes', e.target.value)} placeholder="Payment terms, thank-you note, etc." />
        </div>
      </div>

      {/* PDF saved toast */}
      {pdfToast && (
        <div style={{
          position: 'fixed', bottom: 140, left: 16, right: 16,
          background: 'var(--card)', border: `1px solid ${pdfToast.error ? 'var(--danger)' : 'var(--success)'}`,
          borderRadius: 'var(--radius)', padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          zIndex: 25, boxShadow: '0 4px 24px rgba(0,0,0,.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>{pdfToast.error ? '❌' : '✅'}</span>
            <div>
              <div style={{ fontSize: '.88rem', fontWeight: 600, color: pdfToast.error ? 'var(--danger)' : 'var(--text)' }}>
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
              >Open</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setPdfToast(null)}>✕</button>
          </div>
        </div>
      )}

      {/* Overwrite confirmation modal */}
      {overwritePending && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 30, padding: 24,
        }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: '100%', maxWidth: 340 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>File already exists</h3>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: 6, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text)' }}>{overwritePending.filename}</strong> is already saved.
            </p>
            <p style={{ fontSize: '.83rem', color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
              Overwrite it, or save a copy as <strong style={{ color: 'var(--text)' }}>{overwritePending.copyName}</strong>?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-primary btn-full" onClick={async () => {
                const op = overwritePending; setOverwritePending(null)
                const result = await savePDFToPhone(inv, settings, op.filename)
                setPdfToast(result)
              }}>Overwrite</button>
              <button className="btn btn-ghost btn-full" onClick={async () => {
                const op = overwritePending; setOverwritePending(null)
                const result = await savePDFToPhone(inv, settings, op.copyName)
                setPdfToast(result)
              }}>Save as Copy</button>
              <button className="btn btn-ghost btn-full" style={{ color: 'var(--muted)' }} onClick={() => setOverwritePending(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 30, padding: 24,
        }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: '100%', maxWidth: 340 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: 'var(--danger)' }}>Delete Invoice?</h3>
            <p style={{ fontSize: '.88rem', color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
              {inv.id}{inv.customer ? ` for ${inv.customer}` : ''} will be permanently deleted and cannot be recovered.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-full" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger btn-full" onClick={() => onDelete(inv.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom action bar */}
      {(() => {
        const step = WORKFLOW[inv.status]
        return (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0))',
            zIndex: 20,
          }}>
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
                style={{ padding: '12px 14px', color: 'var(--danger)', borderColor: 'rgba(224,82,82,.3)' }}
                onClick={() => setConfirmDelete(true)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, padding: '12px 8px', fontSize: '.85rem', color: '#4caf84', borderColor: 'rgba(76,175,132,.3)' }}
                onClick={async () => { await sharePDF(inv, settings); onToast?.('Invoice shared', 'success', '↗') }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                Share
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1.4, padding: '12px 8px', fontSize: '.85rem', color: 'var(--accent)', borderColor: 'rgba(245,166,35,.3)' }}
                onClick={async () => {
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
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/>
                </svg>
                Save PDF
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, padding: '12px 8px', fontSize: '.85rem' }}
                onClick={() => onClose(inv)}
              >Close</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
