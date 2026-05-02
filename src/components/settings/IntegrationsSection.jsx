import { useState } from 'react'
import { fetchSquarespaceProducts } from '../../api/squarespace.js'
import { fetchShopifyProducts } from '../../api/shopify.js'

export function IntegrationsSection({ settings, onChange }) {
  const [testStatus, setTestStatus] = useState('idle')
  const [testError, setTestError] = useState('')
  const [shopifyTestStatus, setShopifyTestStatus] = useState('idle')
  const [shopifyTestError, setShopifyTestError] = useState('')

  const handleTest = async () => {
    if (!settings.sqApiKey) return
    setTestStatus('testing')
    try {
      await fetchSquarespaceProducts(settings.sqApiKey)
      setTestStatus('ok')
      setTestError('')
    } catch (e) {
      setTestStatus('error')
      setTestError(e.message)
    }
  }

  const handleShopifyTest = async () => {
    if (!settings.shopifyShopDomain || !settings.shopifyAccessToken) return
    setShopifyTestStatus('testing')
    try {
      await fetchShopifyProducts(settings.shopifyShopDomain, settings.shopifyAccessToken)
      setShopifyTestStatus('ok')
      setShopifyTestError('')
    } catch (e) {
      setShopifyTestStatus('error')
      setShopifyTestError(e.message)
    }
  }

  return (
    <>
      <fieldset
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 12,
        }}
      >
        <legend style={{ fontSize: '.78rem', padding: '0 6px', color: 'var(--muted)' }}>
          Active integration
        </legend>
        <div
          role="radiogroup"
          aria-label="Active integration"
          style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}
        >
          {[
            { id: 'squarespace', label: 'Squarespace' },
            { id: 'shopify', label: 'Shopify' },
            { id: null, label: 'None' },
          ].map((opt) => {
            const checked = (settings.activeIntegration ?? null) === opt.id
            return (
              <label
                key={opt.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '.82rem',
                }}
              >
                <input
                  type="radio"
                  name="activeIntegration"
                  checked={checked}
                  onChange={() => onChange('activeIntegration', opt.id)}
                />
                {opt.label}
              </label>
            )
          })}
        </div>
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 8, marginBottom: 0 }}>
          Only one provider syncs at a time. Switching triggers a fresh sync that overwrites the
          catalog.
        </p>
      </fieldset>

      <h3 style={{ fontSize: '.92rem', fontWeight: 700, margin: '10px 0 8px' }}>Squarespace</h3>
      <div className="field">
        <label>
          API Key
          <input
            value={settings.sqApiKey || ''}
            onChange={(e) => onChange('sqApiKey', e.target.value)}
            type="password"
            placeholder="sq_…"
          />
        </label>
      </div>
      <div className="field">
        <label>
          Store Domain
          <input
            value={settings.sqDomain || ''}
            onChange={(e) => onChange('sqDomain', e.target.value)}
            placeholder="yourstore.squarespace.com"
          />
        </label>
      </div>
      <button
        className="btn btn-ghost btn-sm mb-8"
        onClick={handleTest}
        disabled={!settings.sqApiKey || testStatus === 'testing'}
      >
        {
          {
            idle: 'Test Connection',
            testing: 'Testing…',
            ok: '✓ Connected',
            error: '✗ Failed — check key',
          }[testStatus]
        }
      </button>
      {testError ? (
        <p
          data-testid="sq-test-error"
          style={{ fontSize: '0.75rem', color: '#f87171', marginTop: 6, wordBreak: 'break-all' }}
        >
          {testError}
        </p>
      ) : null}

      <h3 style={{ fontSize: '.92rem', fontWeight: 700, margin: '20px 0 8px' }}>Shopify</h3>
      <div className="field">
        <label>
          Shop Domain
          <input
            value={settings.shopifyShopDomain || ''}
            onChange={(e) => onChange('shopifyShopDomain', e.target.value.trim())}
            placeholder="yourstore.myshopify.com"
          />
        </label>
      </div>
      <div className="field">
        <label>
          Admin API Access Token
          <input
            value={settings.shopifyAccessToken || ''}
            onChange={(e) => onChange('shopifyAccessToken', e.target.value)}
            type="password"
            placeholder="shpat_…"
          />
        </label>
      </div>
      <button
        className="btn btn-ghost btn-sm mb-8"
        onClick={handleShopifyTest}
        disabled={
          !settings.shopifyShopDomain ||
          !settings.shopifyAccessToken ||
          shopifyTestStatus === 'testing'
        }
      >
        {
          {
            idle: 'Test Connection',
            testing: 'Testing…',
            ok: '✓ Connected',
            error: '✗ Failed — check credentials',
          }[shopifyTestStatus]
        }
      </button>
      {shopifyTestError ? (
        <p
          data-testid="shopify-test-error"
          style={{ fontSize: '0.75rem', color: '#f87171', marginTop: 6, wordBreak: 'break-all' }}
        >
          {shopifyTestError}
        </p>
      ) : null}
    </>
  )
}
