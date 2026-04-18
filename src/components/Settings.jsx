import { useState, useEffect } from 'react'
import { CURRENCY_TAX } from '../constants.js'
import { fetchSquarespaceProducts } from '../api/squarespace.js'
import { fetchShopifyProducts } from '../api/shopify.js'
import { getSecret, setSecret } from '../secure-storage.js'
import { BYOK_PROVIDERS as BYOK_PRESETS } from '../byok.js'
import {
  MODELS as AI_MODELS,
  getBackendInfo,
  cancelDownload as gemmaCancelDownload,
} from '../gemma.js'
import { useSettings } from '../contexts/SettingsContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { SettingsSection } from './SettingsSection.jsx'
import { PdfTemplateEditor } from './PdfTemplateEditor.jsx'
import { Icon } from './Icon.jsx'
import { TOUR_SECTIONS } from './TourOverlay.jsx'
import { logger } from '../utils/logger.js'

const LOG_LEVELS = ['debug', 'info', 'warn', 'error']

export function Settings({ ai, onStartTour }) {
  const {
    aiModelId,
    aiDownloaded,
    aiDownloadProgress,
    aiDownloading,
    aiLoading,
    aiReady,
    loadedModelId,
    handleAiSelect: onAiSelect,
    handleAiDownload: onAiDownload,
    handleAiDelete: onAiDelete,
    handleAiLoad: onAiLoad,
    byokStatus,
    byokError,
    handleByokTest,
    handleByokClear,
  } = ai
  const { settings, saveSettings } = useSettings()
  const { toast } = useToast()
  const [s, setS] = useState(settings)
  const [testStatus, setTestStatus] = useState('idle')
  const [testError, setTestError] = useState('')
  const [shopifyTestStatus, setShopifyTestStatus] = useState('idle')
  const [shopifyTestError, setShopifyTestError] = useState('')
  const [byokKey, setByokKey] = useState('')
  const [showLogs, setShowLogs] = useState(false)
  const [logTick, setLogTick] = useState(0)
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }))
  const setDebug = (k, v) => setS((p) => ({ ...p, debug: { ...(p.debug || {}), [k]: v } }))
  const setSmartPasteContext = (k, v) =>
    setS((p) => ({ ...p, smartPasteContext: { ...(p.smartPasteContext || {}), [k]: v } }))

  // Refresh the modal log view ~5x/sec while open so the buffer stays "live".
  useEffect(() => {
    if (!showLogs) return
    const id = setInterval(() => setLogTick((t) => t + 1), 200)
    return () => clearInterval(id)
  }, [showLogs])

  const downloadLogs = () => {
    const text = logger.toText()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sip-logs-${new Date().toISOString()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearLogs = () => {
    logger.clear()
    setLogTick((t) => t + 1)
    toast('Logs cleared', 'success', '🧹')
  }

  const enableInfoLogging = () => {
    const next = { ...s, debug: { ...(s.debug || {}), logLevel: 'info' } }
    setS(next)
    saveSettings(next)
    toast('Log level set to info — pipeline traces now captured', 'success', '🔎')
  }

  // Load BYOK key from secure storage when provider changes.
  // Guard against the async resolution overwriting keystrokes typed
  // before getSecret resolves (see SMA-34 test).
  const byokProvider = s.byokProvider || ''
  useEffect(() => {
    if (!byokProvider) {
      setByokKey('')
      return
    }
    let cancelled = false
    getSecret(`sip_byok_${byokProvider}`).then((v) => {
      if (!cancelled) setByokKey((prev) => (prev ? prev : v || ''))
    })
    return () => {
      cancelled = true
    }
  }, [byokProvider])

  const handleTest = async () => {
    if (!s.sqApiKey) return
    setTestStatus('testing')
    try {
      await fetchSquarespaceProducts(s.sqApiKey)
      setTestStatus('ok')
      setTestError('')
    } catch (e) {
      setTestStatus('error')
      setTestError(e.message)
    }
  }

  const handleShopifyTest = async () => {
    if (!s.shopifyShopDomain || !s.shopifyAccessToken) return
    setShopifyTestStatus('testing')
    try {
      await fetchShopifyProducts(s.shopifyShopDomain, s.shopifyAccessToken)
      setShopifyTestStatus('ok')
      setShopifyTestError('')
    } catch (e) {
      setShopifyTestStatus('error')
      setShopifyTestError(e.message)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 20 }}>Settings</h2>

      {showLogs && (
        <div
          role="dialog"
          aria-label="Log viewer"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.85)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 40,
            // Respect device safe-area insets so the header row (Download/Clear/Close)
            // isn't hidden under the Android status bar when viewport-fit=cover.
            paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
            paddingRight: 'calc(env(safe-area-inset-right) + 16px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
            paddingLeft: 'calc(env(safe-area-inset-left) + 16px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              gap: 8,
            }}
          >
            <strong style={{ color: 'var(--text)' }}>
              Logs ({logger.getSnapshot().length}/1000)
              {/* logTick keeps this re-rendering on the interval */}
              <span hidden>{logTick}</span>
            </strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={downloadLogs}>
                Download
              </button>
              <button className="btn btn-ghost btn-sm" onClick={clearLogs}>
                Clear
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(false)}>
                Close
              </button>
            </div>
          </div>
          {(s.debug?.logLevel || 'error') !== 'debug' &&
            (s.debug?.logLevel || 'error') !== 'info' && (
              <div
                data-testid="log-viewer-info-hint"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(90,140,255,.1)',
                  border: '1px solid rgba(90,140,255,.3)',
                  color: 'var(--text)',
                  fontSize: '.75rem',
                  lineHeight: 1.4,
                }}
              >
                <span>
                  Bump log level to <code>info</code> to capture Smart Paste pipeline traces.
                </span>
                <button className="btn btn-ghost btn-sm" onClick={enableInfoLogging}>
                  Enable info logs
                </button>
              </div>
            )}
          <pre
            data-testid="log-viewer-body"
            style={{
              flex: 1,
              overflow: 'auto',
              background: 'var(--card)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 12,
              margin: 0,
              fontSize: '.72rem',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {logger.toText() || '(buffer empty)'}
          </pre>
        </div>
      )}

      <SettingsSection title="Business">
        <div className="field">
          <label>
            Business Name
            <input
              value={s.businessName || ''}
              onChange={(e) => set('businessName', e.target.value)}
            />
          </label>
        </div>
        <div className="field">
          <label>
            Email
            <input
              value={s.email || ''}
              onChange={(e) => set('email', e.target.value)}
              type="email"
            />
          </label>
        </div>
        <div className="field">
          <label>
            Phone
            <input
              value={s.phone || ''}
              onChange={(e) => set('phone', e.target.value)}
              type="tel"
            />
          </label>
        </div>
        <div className="field">
          <label>
            Address Line 1
            <input
              value={s.address1 || ''}
              onChange={(e) => set('address1', e.target.value)}
              placeholder="123 High Street"
            />
          </label>
        </div>
        <div className="field">
          <label>
            Address Line 2
            <input
              value={s.address2 || ''}
              onChange={(e) => set('address2', e.target.value)}
              placeholder="Suite / Unit (optional)"
            />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>
              City
              <input
                value={s.city || ''}
                onChange={(e) => set('city', e.target.value)}
                placeholder="London"
              />
            </label>
          </div>
          <div className="field">
            <label>
              Postcode / ZIP
              <input
                value={s.postcode || ''}
                onChange={(e) => set('postcode', e.target.value)}
                placeholder="SW1A 1AA"
              />
            </label>
          </div>
        </div>
        <div className="field">
          <label>
            Country
            <input
              value={s.country || ''}
              onChange={(e) => set('country', e.target.value)}
              placeholder="United Kingdom"
            />
          </label>
        </div>
      </SettingsSection>

      <SettingsSection title="Invoicing">
        <div className="field">
          <label>
            Currency
            <select
              value={s.currency || 'GBP'}
              onChange={(e) => {
                const cur = e.target.value
                const suggested = CURRENCY_TAX[cur]?.tax
                set('currency', cur)
                if (suggested !== undefined) set('defaultTax', suggested)
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
            Default Tax %
            <input
              value={s.defaultTax}
              onChange={(e) => set('defaultTax', e.target.value)}
              type="number"
              min="0"
              max="100"
              step="0.1"
            />
          </label>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            Auto-suggested from currency. Override if needed.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>
              Invoice Prefix
              <input
                value={s.invoicePrefix ?? ''}
                onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase())}
                placeholder="INV"
                maxLength={6}
              />
            </label>
          </div>
          <div className="field">
            <label>
              Number Padding
              <input
                value={s.invoicePadding || 4}
                onChange={(e) => set('invoicePadding', parseInt(e.target.value) || 1)}
                type="number"
                min="1"
                max="8"
              />
            </label>
          </div>
        </div>
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: -6, marginBottom: 8 }}>
          Preview:{' '}
          <strong style={{ color: 'var(--accent)' }}>
            {s.invoicePrefix || 'INV'}
            {String(1).padStart(s.invoicePadding || 4, '0')}
          </strong>
        </p>
      </SettingsSection>

      <SettingsSection title="PDF Template" dataTour="settings-pdf">
        <PdfTemplateEditor
          tmpl={s.pdfTemplate || {}}
          onChange={(v) => set('pdfTemplate', v)}
          businessName={s.businessName}
        />
      </SettingsSection>

      <SettingsSection title="Integrations">
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
              const checked = (s.activeIntegration ?? null) === opt.id
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
                    onChange={() => set('activeIntegration', opt.id)}
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
              value={s.sqApiKey}
              onChange={(e) => set('sqApiKey', e.target.value)}
              type="password"
              placeholder="sq_…"
            />
          </label>
        </div>
        <div className="field">
          <label>
            Store Domain
            <input
              value={s.sqDomain}
              onChange={(e) => set('sqDomain', e.target.value)}
              placeholder="yourstore.squarespace.com"
            />
          </label>
        </div>
        <button
          className="btn btn-ghost btn-sm mb-8"
          onClick={handleTest}
          disabled={!s.sqApiKey || testStatus === 'testing'}
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
              value={s.shopifyShopDomain || ''}
              onChange={(e) => set('shopifyShopDomain', e.target.value.trim())}
              placeholder="yourstore.myshopify.com"
            />
          </label>
        </div>
        <div className="field">
          <label>
            Admin API Access Token
            <input
              value={s.shopifyAccessToken || ''}
              onChange={(e) => set('shopifyAccessToken', e.target.value)}
              type="password"
              placeholder="shpat_…"
            />
          </label>
        </div>
        <button
          className="btn btn-ghost btn-sm mb-8"
          onClick={handleShopifyTest}
          disabled={
            !s.shopifyShopDomain || !s.shopifyAccessToken || shopifyTestStatus === 'testing'
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
            style={{ fontSize: '0.75rem', color: '#f87171', marginTop: 6, wordBreak: 'break-all' }}
          >
            {shopifyTestError}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection title="AI" dataTour="settings-ai">
        {/* ── Mode selector ── */}
        {(() => {
          const aiMode = s.aiMode || 'small'

          const BYOK_PROVIDERS = [
            {
              id: 'openrouter',
              label: 'OpenRouter',
              keyHint: 'sk-or-…',
              keyUrl: 'https://openrouter.ai/keys',
              howTo: [
                'Sign up or log in at openrouter.ai',
                'Go to Keys → Create Key',
                'Copy the key (starts with sk-or-)',
                'Add credits under Settings → Credits',
                'Supports 200+ models — pick one in OpenRouter dashboard',
              ],
              tip: 'Best option if you want to try multiple AI providers without separate accounts.',
            },
            {
              id: 'gemini',
              label: 'Google Gemini',
              keyHint: 'AIza…',
              keyUrl: 'https://aistudio.google.com/app/apikey',
              howTo: [
                'Sign in at aistudio.google.com',
                'Click "Get API key" → Create API key',
                'Copy the key (starts with AIza)',
                'Free tier available with generous limits',
              ],
              tip: 'Free tier is very generous — good starting point if you have a Google account.',
            },
            {
              id: 'openai',
              label: 'OpenAI',
              keyHint: 'sk-…',
              keyUrl: 'https://platform.openai.com/api-keys',
              howTo: [
                'Sign in at platform.openai.com',
                'Go to API Keys → Create new secret key',
                "Copy it immediately — it won't be shown again",
                'Add billing under Settings → Billing',
              ],
              tip: 'Requires a paid account. GPT-4o mini is cheap and fast.',
            },
            {
              id: 'anthropic',
              label: 'Anthropic',
              keyHint: 'sk-ant-…',
              keyUrl: 'https://console.anthropic.com/settings/keys',
              howTo: [
                'Sign in at console.anthropic.com',
                'Go to Settings → API Keys → Create Key',
                'Copy the key (starts with sk-ant-)',
                'Add credits under Billing',
              ],
              tip: 'Claude Haiku is fast and affordable for invoice parsing.',
            },
          ]

          const modeBtn = (id, label, sub) => {
            const active = aiMode === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => set('aiMode', id)}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'center',
                  background: active ? 'var(--accent)' : 'var(--card-bg)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  color: active ? '#fff' : 'var(--text)',
                  transition: 'background .15s, border-color .15s',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '.82rem' }}>{label}</div>
                <div style={{ fontSize: '.68rem', opacity: active ? 0.85 : 0.6, marginTop: 2 }}>
                  {sub}
                </div>
              </button>
            )
          }

          return (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {modeBtn('small', 'On-Device', '~300 MB · CPU/RAM')}
                {modeBtn('byok', 'BYOK', 'Your API key')}
                {modeBtn('off', 'Off', 'Rule-based only')}
              </div>

              {aiMode === 'off' && (
                <p
                  className="text-muted"
                  style={{ fontSize: '.78rem', marginBottom: 4, lineHeight: 1.5 }}
                >
                  AI is disabled. Smart Paste still matches via the fuzzy catalog index — free-form
                  AI features will be unavailable until you pick a mode.
                </p>
              )}

              {/* ── On-device model ── */}
              {aiMode === 'small' &&
                (() => {
                  const m = AI_MODELS[aiMode]
                  if (!m) return null
                  const isSelected = aiModelId === m.id
                  const downloaded = !!aiDownloaded[m.id]
                  const downloading = aiDownloading === m.id
                  const progress = aiDownloadProgress[m.id]
                  // Progress sentinels (SMA-47):
                  //   null  → pre-fetch, label "Connecting…"
                  //   -1    → bytes flowing, size unknown → animate + "Downloading…"
                  //   0..1  → determinate
                  const connecting = downloading && progress == null
                  const indeterminate =
                    downloading && (connecting || progress === -1 || progress === 0)
                  const loaded = aiReady && loadedModelId === m.id

                  return (
                    <>
                      <p
                        className="text-muted"
                        style={{ fontSize: '.78rem', marginBottom: 12, lineHeight: 1.5 }}
                      >
                        Download once · runs fully on-device · improves Smart Paste matches below
                        65% confidence.
                      </p>
                      <div
                        className="card"
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        aria-label={`Select ${m.label} AI model`}
                        style={{
                          marginBottom: 8,
                          border: isSelected ? '1px solid var(--accent)' : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => onAiSelect(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onAiSelect(m.id)
                          }
                        }}
                      >
                        <div className="flex-between mb-4">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                background: isSelected ? 'var(--accent)' : 'transparent',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontWeight: 600, fontSize: '.88rem' }}>{m.label}</span>
                          </div>
                          <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                            {m.size}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: '.75rem',
                            color: 'var(--muted)',
                            marginBottom: downloading || downloaded ? 8 : 0,
                          }}
                        >
                          {m.description}
                        </p>

                        {downloading && (
                          <div style={{ marginBottom: 8 }}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '.72rem',
                                color: 'var(--muted)',
                                marginBottom: 4,
                              }}
                            >
                              <span>{connecting ? 'Connecting…' : 'Downloading…'}</span>
                              <span>{indeterminate ? '' : `${Math.round(progress * 100)}%`}</span>
                            </div>
                            <div
                              role="progressbar"
                              aria-label={connecting ? 'Connecting' : 'Downloading AI model'}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              {...(indeterminate
                                ? {}
                                : { 'aria-valuenow': Math.round(progress * 100) })}
                              style={{
                                height: 4,
                                background: 'var(--border)',
                                borderRadius: 2,
                                overflow: 'hidden',
                                position: 'relative',
                              }}
                            >
                              {indeterminate ? (
                                <div
                                  className="sip-progress-indeterminate"
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    height: '100%',
                                    width: '40%',
                                    background: 'var(--accent)',
                                    borderRadius: 2,
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${progress * 100}%`,
                                    background: 'var(--accent)',
                                    borderRadius: 2,
                                    transition: 'width .3s',
                                  }}
                                />
                              )}
                            </div>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ marginTop: 6, fontSize: '.72rem' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                gemmaCancelDownload()
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {downloaded && !downloading && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            {loaded ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span
                                  style={{
                                    fontSize: '.75rem',
                                    color: 'var(--success)',
                                    alignSelf: 'center',
                                  }}
                                >
                                  ✓ Loaded &amp; ready
                                </span>
                                {getBackendInfo() && (
                                  <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
                                    {getBackendInfo().device === 'webgpu'
                                      ? '⚡ GPU'
                                      : '🐢 CPU (1 thread)'}{' '}
                                    · {getBackendInfo().dtype}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: '.75rem' }}
                                disabled={aiLoading}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onAiLoad(m.id)
                                }}
                              >
                                {aiLoading && aiModelId === m.id ? 'Loading…' : 'Load into memory'}
                              </button>
                            )}
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '.75rem', color: 'var(--danger)' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                onAiDelete(m.id)
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        )}

                        {!downloaded && !downloading && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '.75rem', alignSelf: 'flex-start' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              onAiDownload(m.id)
                            }}
                          >
                            Download {m.size}
                          </button>
                        )}
                      </div>
                    </>
                  )
                })()}

              {/* ── BYOK ── */}
              {aiMode === 'byok' &&
                (() => {
                  const provider = BYOK_PROVIDERS.find((p) => p.id === byokProvider)
                  return (
                    <>
                      <p
                        className="text-muted"
                        style={{ fontSize: '.78rem', marginBottom: 12, lineHeight: 1.5 }}
                      >
                        Use your own API key — no model download needed. Your key is stored only on
                        this device.
                      </p>
                      <div className="field" style={{ marginBottom: 12 }}>
                        <label>
                          Provider
                          <select
                            value={byokProvider}
                            onChange={(e) => set('byokProvider', e.target.value)}
                          >
                            <option value="">— select a provider —</option>
                            {BYOK_PROVIDERS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {provider && (
                        <>
                          {/* Tutorial card */}
                          <div
                            style={{
                              background: 'var(--card-bg)',
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              padding: '10px 12px',
                              marginBottom: 12,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8,
                              }}
                            >
                              <span style={{ fontSize: '.8rem', fontWeight: 700 }}>
                                How to get a {provider.label} key
                              </span>
                              <a
                                href={provider.keyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '.75rem',
                                  color: 'var(--accent)',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                }}
                              >
                                Open {provider.label} →
                              </a>
                            </div>
                            <ol
                              style={{
                                margin: 0,
                                paddingLeft: 18,
                                fontSize: '.76rem',
                                color: 'var(--muted)',
                                lineHeight: 1.7,
                              }}
                            >
                              {provider.howTo.map((step, i) => (
                                <li key={i}>{step}</li>
                              ))}
                            </ol>
                            {provider.tip && (
                              <p
                                style={{
                                  fontSize: '.73rem',
                                  color: 'var(--accent)',
                                  marginTop: 8,
                                  marginBottom: 0,
                                  fontStyle: 'italic',
                                }}
                              >
                                {provider.tip}
                              </p>
                            )}
                          </div>

                          <div className="field">
                            <label>
                              {provider.label} API Key
                              <input
                                type="password"
                                autoComplete="off"
                                spellCheck="false"
                                placeholder={provider.keyHint}
                                value={byokKey}
                                onChange={(e) => {
                                  const v = e.target.value.trim()
                                  setByokKey(v)
                                  setSecret(`sip_byok_${byokProvider}`, v)
                                }}
                              />
                            </label>
                          </div>

                          <details style={{ marginBottom: 12 }}>
                            <summary
                              style={{
                                fontSize: '.75rem',
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                marginBottom: 8,
                              }}
                            >
                              Advanced — base URL &amp; model
                            </summary>
                            <div className="field">
                              <label>
                                Base URL
                                <input
                                  value={s.byokBaseUrl || ''}
                                  onChange={(e) => set('byokBaseUrl', e.target.value.trim())}
                                  placeholder={BYOK_PRESETS[byokProvider]?.defaultBaseUrl || ''}
                                />
                              </label>
                            </div>
                            <div className="field">
                              <label>
                                Model
                                <input
                                  value={s.byokModel || ''}
                                  onChange={(e) => set('byokModel', e.target.value.trim())}
                                  placeholder={BYOK_PRESETS[byokProvider]?.defaultModel || ''}
                                />
                              </label>
                            </div>
                          </details>

                          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={!byokKey || byokStatus === 'testing'}
                              onClick={() =>
                                handleByokTest?.({
                                  provider: byokProvider,
                                  baseUrl: s.byokBaseUrl,
                                  model: s.byokModel,
                                })
                              }
                            >
                              {byokStatus === 'testing' ? 'Testing…' : 'Test Connection'}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)' }}
                              disabled={!byokKey}
                              onClick={async () => {
                                await handleByokClear?.(byokProvider)
                                setByokKey('')
                              }}
                            >
                              Clear Key
                            </button>
                          </div>

                          {byokStatus && byokStatus !== 'idle' && (
                            <div
                              role="status"
                              aria-live="polite"
                              style={{
                                fontSize: '.78rem',
                                padding: '6px 10px',
                                borderRadius: 6,
                                marginBottom: 8,
                                background:
                                  byokStatus === 'ok'
                                    ? 'rgba(34,197,94,.12)'
                                    : byokStatus === 'error'
                                      ? 'rgba(239,68,68,.10)'
                                      : 'rgba(148,163,184,.10)',
                                color:
                                  byokStatus === 'ok'
                                    ? 'var(--success)'
                                    : byokStatus === 'error'
                                      ? '#f87171'
                                      : 'var(--muted)',
                              }}
                            >
                              {byokStatus === 'testing' && '⏳ Testing connection…'}
                              {byokStatus === 'ok' && '✓ Connected'}
                              {byokStatus === 'error' && `✗ ${byokError || 'Connection failed'}`}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )
                })()}
            </>
          )
        })()}
      </SettingsSection>

      <SettingsSection id="smart-paste-ai-context" title="Smart Paste AI Context">
        <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Five short phrases about your business. Smart Paste prepends these to every AI call so the
          model maps messy customer messages onto your real catalog.
        </p>
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
            <textarea
              rows={2}
              value={s.smartPasteContext?.shopType || ''}
              onChange={(e) => setSmartPasteContext('shopType', e.target.value)}
              placeholder="brick-and-mortar, online only, trade counter, pop-up market stall"
            />
          </label>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            How you trade — helps the AI weight wholesale vs retail phrasing.
          </p>
        </div>
        <div className="field">
          <label>
            Customer type
            <textarea
              rows={2}
              value={s.smartPasteContext?.customerType || ''}
              onChange={(e) => setSmartPasteContext('customerType', e.target.value)}
              placeholder="restaurants, trade contractors, walk-in retail, boutique resellers"
            />
          </label>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            Who you sell to — sets expectations for quantities and vocabulary.
          </p>
        </div>
        <div className="field">
          <label>
            Customer vocabulary / jargon
            <textarea
              rows={3}
              value={s.smartPasteContext?.vocabulary || ''}
              onChange={(e) => setSmartPasteContext('vocabulary', e.target.value)}
              placeholder={
                'abbreviations, brand nicknames, short codes — e.g.\n"pdr" = powder, "M8x20" = M8 20mm bolt, "chedd" = cheddar'
              }
            />
          </label>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            Shorthand the AI would otherwise fail on. One per line is fine.
          </p>
        </div>
        <div className="field">
          <label>
            Language / locale
            <textarea
              rows={2}
              value={s.smartPasteContext?.locale || ''}
              onChange={(e) => setSmartPasteContext('locale', e.target.value)}
              placeholder='e.g. "UK English + Spanish, sometimes mixed"'
            />
          </label>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            Languages customers write in — covers codeswitching and regional spellings.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="Help & Tour">
        <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Replay any section of the guided tour.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TOUR_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              className="btn btn-ghost btn-sm"
              style={{ justifyContent: 'flex-start', gap: 8 }}
              onClick={() => onStartTour?.(sec.startStep)}
            >
              <Icon
                name={
                  sec.id === 'dashboard'
                    ? 'dashboard'
                    : sec.id === 'invoices'
                      ? 'invoice'
                      : sec.id === 'orders'
                        ? 'orders'
                        : sec.id === 'catalog'
                          ? 'inventory'
                          : 'settings'
                }
              />
              {sec.label}
            </button>
          ))}
          <button
            className="btn btn-ghost btn-sm"
            style={{
              justifyContent: 'flex-start',
              gap: 8,
              marginTop: 4,
              borderTop: '1px solid var(--border)',
              paddingTop: 12,
            }}
            onClick={() => onStartTour?.(0)}
          >
            <Icon name="refresh" /> Replay full tour
          </button>
        </div>
      </SettingsSection>

      <SettingsSection title="Debugging">
        <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Capture in-app diagnostic logs. Stays in memory only — nothing is uploaded.
        </p>
        <div className="field">
          <label htmlFor="debug-log-level">
            Log level
            <select
              id="debug-log-level"
              value={s.debug?.logLevel || 'error'}
              onChange={(e) => setDebug('logLevel', e.target.value)}
            >
              {LOG_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </label>
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            Lower = more entries captured. Default is <code>error</code>. Press Save Settings to
            apply.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(true)}>
            View logs
          </button>
          <button className="btn btn-ghost btn-sm" onClick={downloadLogs}>
            Download logs
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--danger)' }}
            onClick={clearLogs}
          >
            Clear logs
          </button>
        </div>
      </SettingsSection>

      <button
        className="btn btn-primary btn-sm"
        style={{ marginTop: 12, alignSelf: 'flex-start' }}
        onClick={() => {
          saveSettings(s)
          toast('Settings saved', 'success', '✓')
        }}
      >
        <Icon name="check" /> Save Settings
      </button>
    </div>
  )
}
