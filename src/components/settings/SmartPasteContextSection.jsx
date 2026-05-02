import { FineTuneExportButton } from '../FineTuneExportButton.jsx'
import {
  SHOP_TYPE_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  VOCABULARY_OPTIONS,
  LOCALE_OPTIONS,
} from '../../constants/smartPasteContextPresets.js'

export function SmartPasteContextSection({ settings, onChange }) {
  const setSmartPasteContext = (k, v) =>
    onChange('smartPasteContext', { ...(settings.smartPasteContext || {}), [k]: v })

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
            value={settings.smartPasteContext?.productType || ''}
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
            value={settings.smartPasteContext?.shopType || ''}
            onChange={(e) => setSmartPasteContext('shopType', e.target.value)}
          >
            <option value="">— select —</option>
            {SHOP_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {settings.smartPasteContext?.shopType &&
              !SHOP_TYPE_OPTIONS.includes(settings.smartPasteContext.shopType) && (
                <option value={settings.smartPasteContext.shopType}>
                  {settings.smartPasteContext.shopType}
                </option>
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
            value={settings.smartPasteContext?.customerType || ''}
            onChange={(e) => setSmartPasteContext('customerType', e.target.value)}
          >
            <option value="">— select —</option>
            {CUSTOMER_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {settings.smartPasteContext?.customerType &&
              !CUSTOMER_TYPE_OPTIONS.includes(settings.smartPasteContext.customerType) && (
                <option value={settings.smartPasteContext.customerType}>
                  {settings.smartPasteContext.customerType}
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
            value={settings.smartPasteContext?.vocabulary || ''}
            onChange={(e) => setSmartPasteContext('vocabulary', e.target.value)}
          >
            <option value="">None / skip</option>
            {VOCABULARY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {settings.smartPasteContext?.vocabulary &&
              !VOCABULARY_OPTIONS.includes(settings.smartPasteContext.vocabulary) && (
                <option value={settings.smartPasteContext.vocabulary}>
                  {settings.smartPasteContext.vocabulary}
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
            value={settings.smartPasteContext?.locale || ''}
            onChange={(e) => setSmartPasteContext('locale', e.target.value)}
          >
            <option value="">— select —</option>
            {LOCALE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {settings.smartPasteContext?.locale &&
              !LOCALE_OPTIONS.includes(settings.smartPasteContext.locale) && (
                <option value={settings.smartPasteContext.locale}>
                  {settings.smartPasteContext.locale}
                </option>
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
