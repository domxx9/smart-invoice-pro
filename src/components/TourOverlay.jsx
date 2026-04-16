import { useState, useEffect } from 'react'

export const TOUR_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', startStep: 0 },
  { id: 'invoices', label: 'Invoices & Smart Paste', startStep: 2 },
  { id: 'orders', label: 'Orders & Fulfillment', startStep: 5 },
  { id: 'catalog', label: 'Product Catalog', startStep: 7 },
  { id: 'settings', label: 'Settings & AI', startStep: 8 },
]

export const TOUR_STEPS = [
  // ── Dashboard ────────────────────────────────────────────────────
  {
    tab: 'dashboard',
    title: 'Your dashboard',
    body: 'Revenue collected, outstanding balances, and recent activity — all updated in real time as invoices are created and paid.',
    target: 'stat-grid',
    cta: 'Next →',
  },
  {
    tab: 'dashboard',
    title: 'Create an invoice',
    body: 'Tap New Invoice to start. Add a customer, pick products from your catalog, and totals calculate automatically.',
    target: 'new-invoice',
    cta: 'Next →',
  },
  // ── Invoices ─────────────────────────────────────────────────────
  {
    tab: 'invoices',
    title: 'Invoice history',
    body: 'All invoices — draft, pending, and paid — in one list. Tap any row to open, edit, or resend.',
    target: 'nav-invoices',
    cta: 'Next →',
  },
  {
    tab: 'invoices',
    title: 'Smart Paste',
    body: 'Inside any invoice, tap Smart Paste and paste a customer order message. AI reads it and auto-matches items from your catalog — no typing needed.',
    target: null,
    cta: 'Next →',
  },
  {
    tab: 'invoices',
    title: 'Share & save PDFs',
    body: 'From an open invoice tap Share to send a PDF via WhatsApp, email, or any app. Tap Save PDF to keep a copy on the device.',
    target: null,
    cta: 'Next →',
  },
  // ── Orders ───────────────────────────────────────────────────────
  {
    tab: 'orders',
    title: 'Squarespace orders',
    body: 'Orders sync directly from your store. Pull down to refresh. Pending orders are queued and ready to pick.',
    target: 'nav-orders',
    cta: 'Next →',
  },
  {
    tab: 'orders',
    title: 'Fulfilling an order',
    body: 'Open a pending order and tap Start Pick. Check off each item as you pack it — progress saves automatically. When all items are ticked, the order is fulfilled.',
    target: 'orders-list',
    cta: 'Next →',
  },
  // ── Catalog ──────────────────────────────────────────────────────
  {
    tab: 'inventory',
    title: 'Product catalog',
    body: 'All products synced from Squarespace. Tap a group to see variants and pricing. Pull down to fetch the latest changes from your store.',
    target: 'nav-inventory',
    cta: 'Next →',
  },
  // ── Settings ─────────────────────────────────────────────────────
  {
    tab: 'settings',
    title: 'Business & invoice settings',
    body: 'Set your business name, address, tax rate, and invoice number format here. These appear on every PDF you generate.',
    target: 'nav-settings',
    cta: 'Next →',
  },
  {
    tab: 'settings',
    title: 'PDF template',
    body: 'Customise accent colours and toggle sections like logo, notes, and footer to match your brand. Changes preview live.',
    target: 'settings-pdf',
    cta: 'Next →',
  },
  {
    tab: 'settings',
    title: 'AI — Smart Paste power',
    body: 'Download the on-device AI model (~300 MB, one-time) for offline matching, or add a BYOK API key to use a cloud provider. Both improve Smart Paste accuracy.',
    target: 'settings-ai',
    cta: 'All done!',
  },
]

export function TourOverlay({ step, onNext, onSkip }) {
  const [rect, setRect] = useState(null)
  const s = TOUR_STEPS[step]

  useEffect(() => {
    if (!s) return
    const read = () => {
      const el = s.target ? document.querySelector(`[data-tour="${s.target}"]`) : null
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom })
      } else {
        setRect(null)
      }
    }
    read()
    const t = setTimeout(read, 380)
    return () => clearTimeout(t)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null

  const PAD = 8
  const MARGIN = 14
  const WIN_H = typeof window !== 'undefined' ? window.innerHeight : 800

  const sTop = rect ? rect.top - PAD : 0
  const sBottom = rect ? rect.bottom + PAD : 0
  const spaceBelow = WIN_H - sBottom
  const tipBelow = !rect || spaceBelow >= sTop

  const totalSteps = TOUR_STEPS.length
  const sectionLabel =
    TOUR_SECTIONS.slice()
      .reverse()
      .find((sec) => step >= sec.startStep)?.label ?? ''

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} />

      {rect ? (
        <div
          style={{
            position: 'fixed',
            top: sTop,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
            zIndex: 200,
            pointerEvents: 'none',
          }}
        />
      ) : (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 200,
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        style={{
          position: 'fixed',
          left: 16,
          right: 16,
          zIndex: 201,
          ...(tipBelow
            ? { top: rect ? sBottom + MARGIN : WIN_H / 2 - 90 }
            : { bottom: WIN_H - sTop + MARGIN }),
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '16px 16px 12px',
          boxShadow: '0 8px 40px rgba(0,0,0,.7)',
        }}
      >
        {/* Progress + section label */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              flexWrap: 'wrap',
              flex: 1,
              marginRight: 12,
            }}
          >
            {TOUR_SECTIONS.map((sec, si) => {
              const nextSec = TOUR_SECTIONS[si + 1]
              const isActive = step >= sec.startStep && (!nextSec || step < nextSec.startStep)
              const isDone = nextSec ? step >= nextSec.startStep : step >= totalSteps - 1
              return (
                <div
                  key={sec.id}
                  style={{
                    height: 4,
                    flex: 1,
                    borderRadius: 2,
                    background: isDone
                      ? 'var(--accent)'
                      : isActive
                        ? 'var(--accent)'
                        : 'var(--border)',
                    opacity: isActive ? 1 : isDone ? 0.5 : 0.3,
                    transition: 'background .25s',
                  }}
                />
              )
            })}
          </div>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '.78rem',
              cursor: 'pointer',
              padding: '4px 0',
              whiteSpace: 'nowrap',
            }}
            onClick={onSkip}
          >
            Skip tour
          </button>
        </div>

        {/* Section label */}
        {sectionLabel && (
          <p
            style={{
              fontSize: '.68rem',
              color: 'var(--accent)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              marginBottom: 6,
            }}
          >
            {sectionLabel}
          </p>
        )}

        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
          {s.title}
        </h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, fontSize: '.86rem', marginBottom: 14 }}>
          {s.body}
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onNext}>
            {s.cta}
          </button>
        </div>

        <p style={{ fontSize: '.68rem', color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
          {step + 1} / {totalSteps}
        </p>
      </div>
    </>
  )
}
