import { useRef } from 'react'
import { COLOUR_PRESETS } from '../constants.js'
import { calcTotals } from '../helpers.js'
import { ColourPicker } from './ColourPicker.jsx'

export function PdfTemplateEditor({ tmpl, onChange, businessName }) {
  const primary = tmpl.primaryColor || '#f5a623'
  const secondary = tmpl.secondaryColor || '#1e1e1e'
  const tertiary = tmpl.tertiaryColor || '#f5f5f5'
  const fileRef = useRef()

  const set = (k, v) => onChange({ ...tmpl, [k]: v })

  const handleLogo = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => set('logo', ev.target.result)
    reader.readAsDataURL(file)
  }

  const sampleInv = {
    id: 'INV-0001',
    customer: 'Acme Corp',
    email: 'billing@acme.com',
    date: '2026-04-12',
    due: '2026-04-26',
    status: 'pending',
    items: [
      { desc: 'Consultation', qty: 2, price: 150 },
      { desc: 'Materials', qty: 1, price: 80 },
    ],
    tax: 20,
    notes: 'Payment due within 14 days.',
  }
  const { sub, tax, total } = calcTotals(sampleInv.items, sampleInv.tax)
  const fmt2 = (n) => `£${n.toFixed(2)}`

  return (
    <div>
      {/* Live preview — mobile-first A5 proportions */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #ddd',
          marginBottom: 20,
          color: '#222',
          lineHeight: 1.4,
          maxWidth: 320,
          margin: '0 auto 20px',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: primary,
            padding: '6px 10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 11, color: '#000' }}>INVOICE</span>
          <span style={{ fontSize: 9, color: '#000' }}>{sampleInv.id}</span>
        </div>
        {/* Logo */}
        {tmpl.showLogo && tmpl.logo && (
          <div style={{ padding: '6px 10px 0' }}>
            <img src={tmpl.logo} alt="Logo preview" style={{ height: 22, display: 'block' }} />
          </div>
        )}
        {/* Business + meta */}
        <div style={{ padding: '6px 10px 4px', fontSize: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 1 }}>
            {businessName || 'My Business'}
          </div>
          <div style={{ color: '#888', fontSize: 7, marginBottom: 4 }}>billing@business.com</div>
          <div style={{ borderTop: '1px solid #ddd', paddingTop: 4 }}>
            {[
              ['Date', sampleInv.date],
              ['Due', sampleInv.due],
              ['Status', 'PENDING'],
            ].map(([l, v]) => (
              <div
                key={l}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 7,
                  marginBottom: 2,
                }}
              >
                <span style={{ color: '#888', fontWeight: 700 }}>{l}:</span>
                <span style={{ color: '#333' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Bill To */}
        <div
          style={{
            background: tertiary,
            margin: '0 10px 4px',
            padding: '4px 6px',
            borderRadius: 3,
          }}
        >
          <div style={{ fontSize: 6, color: '#999', fontWeight: 700 }}>BILL TO</div>
          <div style={{ fontSize: 9, fontWeight: 700 }}>
            {sampleInv.customer}{' '}
            <span style={{ fontWeight: 400, color: '#888', fontSize: 7 }}>{sampleInv.email}</span>
          </div>
        </div>
        {/* Table header */}
        <div
          style={{
            background: secondary,
            margin: '0 10px 0',
            padding: '3px 6px',
            display: 'flex',
            borderRadius: 3,
          }}
        >
          <span style={{ color: primary, fontSize: 6, fontWeight: 700, flex: 2 }}>DESCRIPTION</span>
          <span
            style={{ color: primary, fontSize: 6, fontWeight: 700, width: 24, textAlign: 'right' }}
          >
            QTY
          </span>
          <span
            style={{ color: primary, fontSize: 6, fontWeight: 700, width: 40, textAlign: 'right' }}
          >
            PRICE
          </span>
          <span
            style={{ color: primary, fontSize: 6, fontWeight: 700, width: 44, textAlign: 'right' }}
          >
            TOTAL
          </span>
        </div>
        {/* Items */}
        {sampleInv.items.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '2px 16px 2px 16px',
              background: i % 2 === 0 ? '#fafafa' : '#fff',
              fontSize: 7,
            }}
          >
            <span style={{ flex: 2 }}>{item.desc}</span>
            <span style={{ width: 24, textAlign: 'right' }}>{item.qty}</span>
            <span style={{ width: 40, textAlign: 'right' }}>{fmt2(item.price)}</span>
            <span style={{ width: 44, textAlign: 'right', fontWeight: 600 }}>
              {fmt2(item.qty * item.price)}
            </span>
          </div>
        ))}
        {/* Totals */}
        <div style={{ padding: '4px 10px', fontSize: 7, color: '#888' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal</span>
            <span>{fmt2(sub)}</span>
          </div>
          {tmpl.showTaxLine && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tax ({sampleInv.tax}%)</span>
              <span>{fmt2(tax)}</span>
            </div>
          )}
          <div
            style={{
              background: primary,
              margin: '3px -10px 0',
              padding: '3px 10px',
              display: 'flex',
              justifyContent: 'space-between',
              color: '#000',
              fontWeight: 700,
              fontSize: 8,
            }}
          >
            <span>TOTAL</span>
            <span>{fmt2(total)}</span>
          </div>
        </div>
        {/* Notes */}
        {tmpl.showNotes && (
          <div style={{ padding: '3px 10px', fontSize: 6, color: '#666' }}>
            <strong>NOTES</strong>
            <br />
            {sampleInv.notes}
          </div>
        )}
        {/* Footer */}
        {tmpl.showFooter && (
          <div
            style={{
              textAlign: 'center',
              padding: '3px 10px 6px',
              fontSize: 6,
              color: primary,
              fontStyle: 'italic',
            }}
          >
            {tmpl.footerText || 'Thank you for your business.'}
          </div>
        )}
      </div>

      <ColourPicker
        label="Primary Colour (header, totals, footer)"
        value={primary}
        presets={COLOUR_PRESETS.primary}
        onChange={(v) => set('primaryColor', v)}
      />
      <ColourPicker
        label="Secondary Colour (table header background)"
        value={secondary}
        presets={COLOUR_PRESETS.secondary}
        onChange={(v) => set('secondaryColor', v)}
      />
      <ColourPicker
        label="Tertiary Colour (bill-to, row tint)"
        value={tertiary}
        presets={COLOUR_PRESETS.tertiary}
        onChange={(v) => set('tertiaryColor', v)}
      />

      <div className="field">
        <label>
          Logo
          <input
            type="file"
            accept="image/*"
            ref={fileRef}
            style={{ display: 'none' }}
            onChange={handleLogo}
          />
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tmpl.logo && (
            <img
              src={tmpl.logo}
              alt="Logo preview"
              style={{
                height: 40,
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: '#fff',
                padding: 2,
              }}
            />
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => fileRef.current.click()}
          >
            {tmpl.logo ? 'Change Logo' : 'Upload Logo'}
          </button>
          {tmpl.logo && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger)' }}
              onClick={() => set('logo', null)}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="field">
        <label>
          Footer Message
          <input
            value={tmpl.footerText || ''}
            onChange={(e) => set('footerText', e.target.value)}
            placeholder="Thank you for your business."
          />
        </label>
      </div>

      <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend
          style={{
            font: 'inherit',
            fontSize: '.8rem',
            color: 'var(--muted)',
            padding: 0,
            marginBottom: 4,
          }}
        >
          Show / Hide Sections
        </legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
          {[
            ['showLogo', 'Logo (when uploaded)'],
            ['showTaxLine', 'Tax breakdown line'],
            ['showNotes', 'Notes section'],
            ['showFooter', 'Footer message'],
          ].map(([key, lbl]) => (
            <label
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                fontSize: '.9rem',
                color: 'var(--text)',
              }}
            >
              <input
                type="checkbox"
                checked={!!tmpl[key]}
                onChange={(e) => set(key, e.target.checked)}
                style={{ width: 18, height: 18, accentColor: primary, cursor: 'pointer' }}
              />
              {lbl}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
