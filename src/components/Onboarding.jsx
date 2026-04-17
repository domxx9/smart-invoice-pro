import { useState } from 'react'
import { CURRENCY_TAX } from '../constants.js'
import { fetchSquarespaceProducts } from '../api/squarespace.js'
import { fetchShopifyProducts } from '../api/shopify.js'
import { Icon } from './Icon.jsx'

export function Onboarding({ onConnect, onDemo }) {
  const [phase, setPhase] = useState('provider') // provider | key | details | ready
  const [provider, setProvider] = useState(null) // 'squarespace' | 'shopify'
  const [apiKey, setApiKey] = useState('')
  const [shopDomain, setShopDomain] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [status, setStatus] = useState('idle')
  const [errMsg, setErrMsg] = useState('')
  const [fetchedProducts, setFetchedProducts] = useState([])
  const [biz, setBiz] = useState({
    businessName: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    postcode: '',
    country: '',
    currency: 'GBP',
    defaultTax: '20',
  })
  const [syncCount, setSyncCount] = useState(0)

  const canConnect =
    provider === 'shopify' ? !!(shopDomain.trim() && accessToken.trim()) : !!apiKey.trim()

  const resolveCredentials = () =>
    provider === 'shopify'
      ? {
          provider: 'shopify',
          shopDomain: shopDomain.trim(),
          accessToken: accessToken.trim(),
        }
      : { provider: 'squarespace', apiKey: apiKey.trim() }

  const handleConnect = async () => {
    if (!canConnect) return
    setStatus('connecting')
    setErrMsg('')
    setSyncCount(0)
    try {
      const prods =
        provider === 'shopify'
          ? await fetchShopifyProducts(shopDomain.trim(), accessToken.trim(), setSyncCount)
          : await fetchSquarespaceProducts(apiKey.trim(), setSyncCount)
      setFetchedProducts(prods)
      setStatus('idle')
      setPhase('details')
    } catch (e) {
      setStatus('error')
      setErrMsg(e.message || 'Could not connect — check your credentials and try again.')
    }
  }

  const wrap = (children) => (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'calc(env(safe-area-inset-top, 0) + 32px) 24px 32px',
      }}
    >
      {children}
    </div>
  )

  // ── Step 0: pick integration provider ─────────────────────────────
  if (phase === 'provider')
    return wrap(
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1
            style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}
          >
            Smart Invoice Pro
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
            Pick the store you want to connect.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Integration provider"
          style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}
        >
          {[
            { id: 'squarespace', label: 'Squarespace', desc: 'Commerce API key' },
            { id: 'shopify', label: 'Shopify', desc: 'Admin API access token' },
          ].map((opt) => {
            const active = provider === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setProvider(opt.id)}
                style={{
                  textAlign: 'left',
                  padding: '14px 16px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: active ? 'rgba(245,166,35,.08)' : 'var(--card-bg)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: 'var(--text)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 2 }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{opt.desc}</div>
              </button>
            )
          })}
        </div>
        <button
          className="btn btn-primary btn-full"
          disabled={!provider}
          onClick={() => setPhase('key')}
          style={{ marginBottom: 12 }}
        >
          Continue
        </button>
        <button className="btn btn-ghost btn-full" onClick={onDemo}>
          Try Demo
        </button>
      </div>,
    )

  // ── Step 1: connect store ─────────────────────────────────────────
  if (phase === 'key')
    return wrap(
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1
            style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}
          >
            Smart Invoice Pro
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>
            Connect your {provider === 'shopify' ? 'Shopify' : 'Squarespace'} store to get started.
          </p>
        </div>

        {provider === 'shopify' ? (
          <>
            <div className="field">
              <label>
                Shop Domain
                <input
                  type="text"
                  placeholder="yourstore.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => {
                    setShopDomain(e.target.value)
                    setStatus('idle')
                    setErrMsg('')
                  }}
                />
              </label>
            </div>
            <div className="field">
              <label>
                Admin API Access Token
                <input
                  type="password"
                  placeholder="shpat_…"
                  value={accessToken}
                  onChange={(e) => {
                    setAccessToken(e.target.value)
                    setStatus('idle')
                    setErrMsg('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                />
              </label>
            </div>
          </>
        ) : (
          <div className="field">
            <label>
              Squarespace API Key
              <input
                type="password"
                placeholder="Paste your API key here"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setStatus('idle')
                  setErrMsg('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
            </label>
          </div>
        )}

        {errMsg && (
          <div
            style={{
              background: 'rgba(224,82,82,.1)',
              border: '1px solid rgba(224,82,82,.3)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 12,
            }}
          >
            <p style={{ color: '#f87171', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>
              Connection failed
            </p>
            <p
              style={{
                color: 'var(--muted)',
                fontSize: '.78rem',
                wordBreak: 'break-all',
                lineHeight: 1.5,
              }}
            >
              {errMsg}
            </p>
          </div>
        )}
        <button
          className="btn btn-primary btn-full"
          onClick={handleConnect}
          disabled={!canConnect || status === 'connecting'}
          style={{ marginBottom: 12 }}
        >
          {status === 'connecting'
            ? syncCount > 0
              ? `${syncCount} products synced…`
              : 'Connecting…'
            : 'Connect Store'}
        </button>
        <button
          className="btn btn-ghost btn-full"
          onClick={() => {
            setPhase('provider')
            setErrMsg('')
            setStatus('idle')
          }}
          style={{ marginBottom: 8 }}
        >
          ← Change provider
        </button>
        <p
          style={{
            color: 'var(--muted)',
            fontSize: '.75rem',
            textAlign: 'center',
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          {provider === 'shopify'
            ? 'Shopify Admin → Settings → Apps and sales channels → Develop apps'
            : 'Squarespace → Settings → Advanced → API Keys'}
        </p>
      </div>,
    )

  // ── Step 2: business details ──────────────────────────────────────
  if (phase === 'details')
    return wrap(
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(76,175,132,.15)',
              border: '2px solid var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              fontSize: 24,
            }}
          >
            ✓
          </div>
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: 'var(--accent)',
              marginBottom: 6,
            }}
          >
            Store connected!
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
            {fetchedProducts.length} product{fetchedProducts.length !== 1 ? 's' : ''} synced. Now
            set up your business details.
          </p>
        </div>
        {[
          ['Business Name *', 'businessName', 'text', 'Acme Services'],
          ['Email', 'email', 'email', 'billing@example.com'],
          ['Phone', 'phone', 'tel', '+1 555 000 0000'],
          ['Address Line 1', 'address1', 'text', '123 High Street'],
          ['Address Line 2', 'address2', 'text', 'Suite / Unit (optional)'],
        ].map(([lbl, key, type, ph]) => (
          <div className="field" key={key}>
            <label>
              {lbl}
              <input
                type={type}
                placeholder={ph}
                value={biz[key]}
                onChange={(e) => setBiz((b) => ({ ...b, [key]: e.target.value }))}
              />
            </label>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>
              City
              <input
                type="text"
                placeholder="London"
                value={biz.city}
                onChange={(e) => setBiz((b) => ({ ...b, city: e.target.value }))}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Postcode / ZIP
              <input
                type="text"
                placeholder="SW1A 1AA"
                value={biz.postcode}
                onChange={(e) => setBiz((b) => ({ ...b, postcode: e.target.value }))}
              />
            </label>
          </div>
        </div>
        <div className="field">
          <label>
            Country
            <input
              type="text"
              placeholder="United Kingdom"
              value={biz.country}
              onChange={(e) => setBiz((b) => ({ ...b, country: e.target.value }))}
            />
          </label>
        </div>
        <div className="field">
          <label>
            Currency
            <select
              value={biz.currency}
              onChange={(e) => {
                const cur = e.target.value
                const suggested = CURRENCY_TAX[cur]?.tax
                setBiz((b) => ({
                  ...b,
                  currency: cur,
                  ...(suggested !== undefined ? { defaultTax: String(suggested) } : {}),
                }))
              }}
            >
              {Object.entries(CURRENCY_TAX).map(([code, { label }]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <label>
            Default Tax Rate (%)
            <input
              type="number"
              placeholder="20"
              min="0"
              max="100"
              step="0.1"
              value={biz.defaultTax}
              onChange={(e) => setBiz((b) => ({ ...b, defaultTax: e.target.value }))}
            />
          </label>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            Auto-suggested from currency. Override if needed.
          </p>
        </div>
        <button
          className="btn btn-primary btn-full"
          disabled={!biz.businessName.trim()}
          onClick={() => setPhase('ready')}
        >
          Save & Continue
        </button>
      </div>,
    )

  // ── Step 3: tour preview ──────────────────────────────────────────
  const tourPreview = [
    { icon: 'dashboard', label: 'Dashboard', desc: 'Revenue & activity at a glance' },
    { icon: 'invoice', label: 'Invoices', desc: 'Create, send & track invoices' },
    { icon: 'invoice', label: 'Smart Paste', desc: 'Paste an order — AI fills items' },
    {
      icon: 'orders',
      label: 'Orders',
      desc: `Sync & fulfil ${provider === 'shopify' ? 'Shopify' : 'Squarespace'} orders`,
    },
    { icon: 'inventory', label: 'Catalog', desc: 'Products synced from your store' },
    { icon: 'settings', label: 'Settings', desc: 'Business details, PDF & AI setup' },
  ]

  return wrap(
    <div style={{ width: '100%', maxWidth: 400 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h2
          style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}
        >
          All set up!
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.5 }}>
          Take a quick tour — walks through every feature so you hit the ground running.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
        {tourPreview.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'rgba(245,166,35,.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name={item.icon} />
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '.84rem', marginBottom: 1 }}>{item.label}</p>
              <p style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary btn-full"
        style={{ marginBottom: 10 }}
        onClick={() => onConnect(resolveCredentials(), fetchedProducts, biz, true)}
      >
        Start Tour →
      </button>
      <button
        className="btn btn-ghost btn-full"
        onClick={() => onConnect(resolveCredentials(), fetchedProducts, biz, false)}
      >
        Skip, go to app
      </button>
    </div>,
  )
}
