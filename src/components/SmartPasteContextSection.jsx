import { FineTuneExportButton } from './FineTuneExportButton.jsx'
import {
  SHOP_TYPE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  VOCABULARY_OPTIONS,
  LOCALE_OPTIONS,
} from '../constants/smartPasteContextPresets.js'

export function SmartPasteContextSection({ settings, onChange }) {
  const setSmartPasteContext = (k, v) =>
    onChange((p) => ({
      ...p,
      smartPasteContext: { ...(p.smartPasteContext || {}), [k]: v },
    }))

  const s = settings

  return (
    <>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Five short phrases about your business. Smart Paste prepends these to every AI call so the
        model maps messy customer messages onto your real catalog.
      </p>
      <FineTuneExportButton />
      <div className="field">
        <label>
          Product type
          <textarea
            rows={2}
            value={s.smartPasteContext?.productType || ''}
            onChange={(e) => setSmartPasteContext('productType', e.target.value)}
            placeholder="e.g. artisan cheese, industrial fasteners, vinyl records, skincare"
          />
        </label>
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
          What you sell, in 3–4 examples the AI can pattern-match against.
        </p>
      </div>
      <div className="field">
        <label>
          Shop type
          <select
            value={s.smartPasteContext?.shopType || ''}
            onChange={(e) => setSmartPasteContext('shopType', e.target.value)}
          >
            <option value="">— select —</option>
            {SHOP_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {s.smartPasteContext?.shopType &&
              !SHOP_TYPE_OPTIONS.includes(s.smartPasteContext.shopType) && (
                <option value={s.smartPasteContext.shopType}>{s.smartPasteContext.shopType}</option>
              )}
          </select>
        </label>
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
          How you trade — helps the AI weight wholesale vs retail phrasing.
        </p>
      </div>
      <div className="field">
        <label>
          Customer type
          <select
            value={s.smartPasteContext?.customerType || ''}
            onChange={(e) => setSmartPasteContext('customerType', e.target.value)}
          >
            <option value="">— select —</option>
            {CUSTOMER_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {s.smartPasteContext?.customerType &&
              !CUSTOMER_TYPE_OPTIONS.includes(s.smartPasteContext.customerType) && (
                <option value={s.smartPasteContext.customerType}>
                  {s.smartPasteContext.customerType}
                </option>
              )}
          </select>
        </label>
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
          Who you sell to — sets expectations for quantities and vocabulary.
        </p>
      </div>
      <div className="field">
        <label>
          Customer vocabulary
          <select
            value={s.smartPasteContext?.vocabulary || ''}
            onChange={(e) => setSmartPasteContext('vocabulary', e.target.value)}
          >
            <option value="">None / skip</option>
            {VOCABULARY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {s.smartPasteContext?.vocabulary &&
              !VOCABULARY_OPTIONS.includes(s.smartPasteContext.vocabulary) && (
                <option value={s.smartPasteContext.vocabulary}>
                  {s.smartPasteContext.vocabulary}
                </option>
              )}
          </select>
        </label>
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
          Trade shorthand the AI would otherwise fail on.
        </p>
      </div>
      <div className="field">
        <label>
          Language / locale
          <select
            value={s.smartPasteContext?.locale || ''}
            onChange={(e) => setSmartPasteContext('locale', e.target.value)}
          >
            <option value="">— select —</option>
            {LOCALE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {s.smartPasteContext?.locale &&
              !LOCALE_OPTIONS.includes(s.smartPasteContext.locale) && (
                <option value={s.smartPasteContext.locale}>{s.smartPasteContext.locale}</option>
              )}
          </select>
        </label>
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
          Languages customers write in — covers codeswitching and regional spellings.
        </p>
      </div>
    </>
  )
}
