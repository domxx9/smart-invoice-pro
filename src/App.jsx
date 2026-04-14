import { useState, useEffect, useCallback } from 'react'
import { CSS } from './styles.js'
import { SAMPLE_PRODUCTS, SAMPLE_INVOICES } from './constants.js'
import { blankInvoice, setCurrency, setInvoicePrefix, setInvoicePadding } from './helpers.js'
import { fetchSquarespaceProducts, fetchSquarespaceOrders } from './api/squarespace.js'
import {
  MODELS as AI_MODELS,
  isModelDownloaded,
  downloadModel as gemmaDownload,
  deleteModel as gemmaDelete,
  initModel as gemmaInit,
  unloadModel as gemmaUnload,
  isGemmaReady,
  getLoadedModelId,
} from './onnxRuntime.js'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { Dashboard } from './components/Dashboard.jsx'
import { Invoices } from './components/InvoiceList.jsx'
import { InvoiceEditor } from './components/InvoiceEditor.jsx'
import { Inventory } from './components/Inventory.jsx'
import { Orders } from './components/Orders.jsx'
import { Settings } from './components/Settings.jsx'
import { Onboarding } from './components/Onboarding.jsx'
import { TourOverlay, TOUR_STEPS, TOUR_SECTIONS } from './components/TourOverlay.jsx'
import { PullToRefresh } from './components/PullToRefresh.jsx'
import { Icon } from './components/Icon.jsx'

async function testByokKey(provider, key) {
  const requests = {
    openrouter: () => fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${key}` },
    }),
    openai: () => fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    }),
    gemini: () => fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`),
    anthropic: () => fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    }),
  }
  const doRequest = requests[provider]
  if (!doRequest) throw new Error('Unknown provider')
  const res = await doRequest()
  if (!res.ok) throw new Error(`HTTP ${res.status} — check your key`)
}

export default function App() {
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('sip_onboarded'))
  const [tourStep, setTourStep]   = useState(null)
  const [tab, setTab]             = useState(() => localStorage.getItem('sip_draft_edit') ? 'invoices' : 'dashboard')
  const [invoices, setInvoices]   = useState([])
  const [products, setProducts]   = useState(() => {
    const s = localStorage.getItem('sip_products')
    return s ? JSON.parse(s) : SAMPLE_PRODUCTS
  })
  const [lastSynced, setLastSynced] = useState(() => {
    const ts = localStorage.getItem('sip_products_synced_at')
    return ts ? parseInt(ts, 10) : null
  })
  const [orders, setOrders] = useState(() => {
    const s = localStorage.getItem('sip_orders')
    return s ? JSON.parse(s) : []
  })
  const [lastOrderSync, setLastOrderSync] = useState(() => {
    const ts = localStorage.getItem('sip_orders_synced_at')
    return ts ? parseInt(ts, 10) : null
  })
  const [orderSyncStatus, setOrderSyncStatus] = useState('idle')
  const [orderSyncCount, setOrderSyncCount] = useState(0)
  const [picks, setPicks] = useState(() => {
    const s = localStorage.getItem('sip_picks')
    return s ? JSON.parse(s) : {}
  })
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncCount, setSyncCount] = useState(0)
  const [editing, setEditing]     = useState(() => {
    const draft = localStorage.getItem('sip_draft_edit')
    return draft ? JSON.parse(draft) : null
  })
  const [editingOriginal, setEditingOriginal] = useState(() => {
    const orig = localStorage.getItem('sip_draft_original')
    return orig ? JSON.parse(orig) : null
  })
  const [editorOpen, setEditorOpen] = useState(() => !!localStorage.getItem('sip_draft_edit'))
  const [settings, setSettings]   = useState(() => {
    const saved = localStorage.getItem('sip_settings')
    const s = saved ? JSON.parse(saved) : {}
    const defaults = {
      businessName: 'My Business',
      email: '',
      phone: '',
      address1: '',
      address2: '',
      city: '',
      postcode: '',
      country: '',
      defaultTax: 20,
      currency: 'GBP',
      sqApiKey: '',
      sqDomain: '',
      invoicePrefix: 'INV',
      invoicePadding: 4,
      pdfTemplate: {
        primaryColor:   '#f5a623',
        secondaryColor: '#1e1e1e',
        tertiaryColor:  '#f5f5f5',
        preset: 'standard',
        showLogo: true,
        showNotes: true,
        showTaxLine: true,
        showFooter: true,
        footerText: 'Thank you for your business.',
        logo: null,
      },
    }
    const merged = { ...defaults, ...s, pdfTemplate: { ...defaults.pdfTemplate, ...(s.pdfTemplate || {}) } }
    setCurrency(merged.currency || 'GBP')
    setInvoicePrefix(merged.invoicePrefix || 'INV')
    setInvoicePadding(merged.invoicePadding || 4)
    return merged
  })

  useEffect(() => {
    const saved = localStorage.getItem('sip_invoices')
    if (saved) setInvoices(JSON.parse(saved))
  }, [])

  // Keep module-level vars in sync when settings change
  useEffect(() => { setCurrency(settings.currency || 'GBP') }, [settings.currency])
  useEffect(() => { setInvoicePrefix(settings.invoicePrefix || 'INV') }, [settings.invoicePrefix])
  useEffect(() => { setInvoicePadding(settings.invoicePadding || 4) }, [settings.invoicePadding])

  const saveInvoices = useCallback((invs) => {
    setInvoices(invs)
    localStorage.setItem('sip_invoices', JSON.stringify(invs))
  }, [])

  const saveProducts = useCallback((prods) => {
    setProducts(prods)
    const ts = Date.now()
    setLastSynced(ts)
    localStorage.setItem('sip_products', JSON.stringify(prods))
    localStorage.setItem('sip_products_synced_at', String(ts))
  }, [])

  const handleSyncCatalog = useCallback(async () => {
    if (!settings.sqApiKey) return
    setSyncStatus('syncing')
    setSyncCount(0)
    try {
      const fetched = await fetchSquarespaceProducts(settings.sqApiKey, setSyncCount)
      saveProducts(fetched)
      setSyncStatus('ok')
    } catch {
      setSyncStatus('error')
    }
  }, [settings.sqApiKey, saveProducts])

  const savePick = useCallback((orderId, itemIndex, qty) => {
    setPicks(prev => {
      const next = { ...prev, [orderId]: { ...(prev[orderId] ?? {}), [itemIndex]: qty } }
      localStorage.setItem('sip_picks', JSON.stringify(next))
      return next
    })
  }, [])

  const handleSyncOrders = useCallback(async () => {
    if (!settings.sqApiKey) return
    setOrderSyncStatus('syncing')
    setOrderSyncCount(0)
    try {
      const fetched = await fetchSquarespaceOrders(settings.sqApiKey, setOrderSyncCount)
      setOrders(fetched)
      const pendingIds = new Set(fetched.filter(o => o.status === 'PENDING').map(o => o.id))
      setPicks(prev => {
        const next = {}
        for (const id of Object.keys(prev)) {
          if (pendingIds.has(id)) next[id] = prev[id]
        }
        localStorage.setItem('sip_picks', JSON.stringify(next))
        return next
      })
      const ts = Date.now()
      setLastOrderSync(ts)
      localStorage.setItem('sip_orders', JSON.stringify(fetched))
      localStorage.setItem('sip_orders_synced_at', String(ts))
      setOrderSyncStatus('ok')
    } catch {
      setOrderSyncStatus('error')
    }
  }, [settings.sqApiKey])

  const handleDraftChange = useCallback((inv) => setEditing(inv), [])

  // ── AI / Gemma state ──────────────────────────────────────────────────────────
  const [aiModelId, setAiModelId] = useState(() => localStorage.getItem('sip_ai_model') || 'small')
  const [aiDownloaded, setAiDownloaded] = useState({})
  const [aiDownloadProgress, setAiDownloadProgress] = useState({})
  const [aiDownloading, setAiDownloading] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [byokStatus, setByokStatus] = useState('idle') // idle | testing | ok | error
  const [byokError, setByokError] = useState('')

  // Unload model when app is hidden / sent to background
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        gemmaUnload().then(() => setAiReady(false)).catch(() => {})
      }
    }
    const handlePageHide = () => { gemmaUnload().catch(() => {}) }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  // Auto-load on-device model on open — only if it loaded OK last session
  useEffect(() => {
    const rawMode = settings.aiMode || 'small'
    const aiMode = rawMode === 'pro' ? 'small' : rawMode
    if (aiMode === 'byok') return

    const modelId = aiMode
    const lastOk = localStorage.getItem(`sip_model_ok_${modelId}`)

    if (isGemmaReady() && getLoadedModelId() === modelId) {
      setAiModelId(modelId)
      setAiReady(true)
      Promise.all(Object.keys(AI_MODELS).map(async id => [id, await isModelDownloaded(id)]))
        .then(entries => setAiDownloaded(Object.fromEntries(entries)))
      return
    }
    Promise.all(Object.keys(AI_MODELS).map(async id => [id, await isModelDownloaded(id)]))
      .then(entries => {
        const downloaded = Object.fromEntries(entries)
        setAiDownloaded(downloaded)
        if (downloaded[modelId] && lastOk) {
          setAiLoading(true)
          gemmaInit(modelId)
            .then(() => { setAiReady(true); setAiModelId(modelId) })
            .catch(e => {
              const msg = e.message || ''
              const isOom = /allocat|out of memory|oom|buffer of size|bad_alloc|error_code.?6/i.test(msg)
              if (isOom) alert('Not enough RAM to load the model.\n\nPlease close other apps and try again.')
              else console.warn('[SIP] auto-load failed:', msg)
            })
            .finally(() => setAiLoading(false))
        }
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // BYOK self-test — runs on mount and whenever provider changes
  useEffect(() => {
    const aiMode = (settings.aiMode === 'pro' ? 'small' : settings.aiMode) || 'small'
    if (aiMode !== 'byok') return
    const provider = settings.byokProvider || ''
    if (!provider) return
    const key = localStorage.getItem(`sip_byok_${provider}`) || ''
    if (!key) return

    setByokStatus('testing')
    setByokError('')
    testByokKey(provider, key)
      .then(() => setByokStatus('ok'))
      .catch(e => { setByokStatus('error'); setByokError(e.message) })
  }, [settings.aiMode, settings.byokProvider]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAiSelectModel = (id) => {
    setAiModelId(id)
    localStorage.setItem('sip_ai_model', id)
    if (getLoadedModelId() === id) setAiReady(true)
    else setAiReady(false)
  }

  const handleAiDownload = async (id) => {
    setAiDownloading(id)
    setAiDownloadProgress(p => ({ ...p, [id]: 0 }))
    try {
      await gemmaDownload(id, (frac) => setAiDownloadProgress(p => ({ ...p, [id]: frac })))
      setAiDownloaded(d => ({ ...d, [id]: true }))
      setAiDownloadProgress(p => ({ ...p, [id]: 1 }))
    } catch (e) {
      if (e.name !== 'AbortError') alert(`Download failed: ${e.message}`)
    } finally {
      setAiDownloading(null)
    }
  }

  const handleAiDelete = async (id) => {
    await gemmaDelete(id)
    localStorage.removeItem(`sip_model_ok_${id}`)
    setAiDownloaded(d => ({ ...d, [id]: false }))
    if (aiModelId === id) setAiReady(false)
  }

  const handleAiLoad = async (id) => {
    setAiLoading(true)
    try {
      await gemmaInit(id)
      setAiReady(true)
      setAiModelId(id)
      localStorage.setItem('sip_ai_model', id)
      localStorage.setItem(`sip_model_ok_${id}`, '1')
    } catch (e) {
      localStorage.removeItem(`sip_model_ok_${id}`)
      const msg = e.message || ''
      const isOom = /allocat|out of memory|oom|buffer of size/i.test(msg)
      if (isOom) {
        alert('Not enough RAM to load the model.\n\nPlease close other apps and try again.')
      } else {
        alert(`Failed to load model: ${msg}`)
      }
    } finally {
      setAiLoading(false)
    }
  }

  const handleOnboardConnect = (apiKey, fetchedProducts, bizDetails, withTour = true) => {
    const newSettings = {
      ...settings,
      sqApiKey: apiKey,
      businessName: bizDetails.businessName || 'My Business',
      email: bizDetails.email || '',
      phone: bizDetails.phone || '',
      address1: bizDetails.address1 || '',
      address2: bizDetails.address2 || '',
      city: bizDetails.city || '',
      postcode: bizDetails.postcode || '',
      country: bizDetails.country || '',
      currency: bizDetails.currency || 'GBP',
      defaultTax: parseFloat(bizDetails.defaultTax) || 20,
    }
    setSettings(newSettings)
    localStorage.setItem('sip_settings', JSON.stringify(newSettings))
    if (fetchedProducts?.length) saveProducts(fetchedProducts)
    localStorage.setItem('sip_onboarded', 'real')
    setOnboarded(true)
    if (withTour) { setTourStep(0); setTab('dashboard') }
  }

  const handleOnboardDemo = () => {
    saveInvoices(SAMPLE_INVOICES)
    localStorage.setItem('sip_onboarded', 'demo')
    setOnboarded(true)
  }

  const handleStartTour = (stepIndex = 0) => {
    const step = TOUR_STEPS[stepIndex]
    if (step?.tab) setTab(step.tab)
    setTourStep(stepIndex)
  }

  if (!onboarded) {
    return (
      <ErrorBoundary>
        <style>{CSS}</style>
        <Onboarding onConnect={handleOnboardConnect} onDemo={handleOnboardDemo} />
      </ErrorBoundary>
    )
  }

  const clearDraft = () => {
    localStorage.removeItem('sip_draft_edit')
    localStorage.removeItem('sip_draft_original')
  }

  const openEditor = (inv) => {
    localStorage.setItem('sip_draft_original', JSON.stringify(inv))
    setEditingOriginal(inv)
    setEditing(inv)
    setEditorOpen(true)
    setTab('invoices')
  }

  const handleNewInvoice = () => openEditor(blankInvoice(invoices, settings.defaultTax ?? 20))
  const handleEdit = (inv) => openEditor({ ...inv })

  const handleSave = (inv) => {
    const idx = invoices.findIndex(i => i.id === inv.id)
    const updated = idx >= 0
      ? invoices.map((i, n) => n === idx ? inv : i)
      : [...invoices, inv]
    saveInvoices(updated)
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  const handleCancelEdit = (revertTo) => {
    setEditing(revertTo)
    localStorage.setItem('sip_draft_edit', JSON.stringify(revertTo))
  }

  const handleDiscardEdit = () => {
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  const handleDeleteInvoice = (invId) => {
    saveInvoices(invoices.filter(i => i.id !== invId))
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  const handleSaveSettings = (s) => {
    setSettings(s)
    localStorage.setItem('sip_settings', JSON.stringify(s))
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'invoices',  label: 'Invoices',  icon: 'invoice'   },
    { id: 'orders',    label: 'Orders',    icon: 'orders'    },
    { id: 'inventory', label: 'Catalog',   icon: 'inventory' },
    { id: 'settings',  label: 'Settings',  icon: 'settings'  },
  ]

  return (
    <ErrorBoundary>
      <style>{CSS}</style>
      {tourStep !== null && (
        <TourOverlay
          step={tourStep}
          onNext={() => {
            const next = tourStep + 1
            if (next >= TOUR_STEPS.length) { setTourStep(null); return }
            const nextTab = TOUR_STEPS[next]?.tab
            if (nextTab) setTab(nextTab)
            setTourStep(next)
          }}
          onSkip={() => setTourStep(null)}
        />
      )}
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <h1>Smart Invoice Pro</h1>
            <span className="text-muted" style={{ fontSize: '.75rem' }}>v1.0</span>
          </div>
        </header>

        <main className="content">
          <PullToRefresh
            onRefresh={tab === 'orders' ? handleSyncOrders : handleSyncCatalog}
            enabled={(tab === 'inventory' || tab === 'orders') && !!settings.sqApiKey}
          >
            {tab === 'dashboard' && (
              <Dashboard invoices={invoices} onNewInvoice={handleNewInvoice} onOpenInvoice={inv => { setTab('invoices'); handleEdit(inv) }} />
            )}
            {tab === 'invoices' && !editorOpen && (
              <Invoices
                invoices={invoices}
                onNewInvoice={handleNewInvoice}
                onEdit={inv => inv.status === 'draft' ? setEditorOpen(true) : handleEdit(inv)}
                editingDraft={editing}
              />
            )}
            {tab === 'invoices' && editorOpen && editing !== null && (
              <InvoiceEditor
                invoice={editing}
                originalInvoice={editingOriginal ?? editing}
                products={products}
                onSave={handleSave}
                onClose={handleSave}
                onCancel={handleCancelEdit}
                onDiscard={handleDiscardEdit}
                onDelete={handleDeleteInvoice}
                onDraftChange={handleDraftChange}
                aiReady={aiReady}
                settings={settings}
              />
            )}
            {tab === 'orders' && (
              <Orders
                orders={orders}
                onSync={handleSyncOrders}
                syncStatus={orderSyncStatus}
                syncCount={orderSyncCount}
                hasApiKey={!!settings.sqApiKey}
                lastSynced={lastOrderSync}
                picks={picks}
                onPickChange={savePick}
              />
            )}
            {tab === 'inventory' && (
              <Inventory
                products={products}
                onSync={handleSyncCatalog}
                syncStatus={syncStatus}
                syncCount={syncCount}
                hasApiKey={!!settings.sqApiKey}
                lastSynced={lastSynced}
              />
            )}
            {tab === 'settings' && (
              <Settings
                settings={settings}
                onSave={handleSaveSettings}
                aiModelId={aiModelId}
                aiDownloaded={aiDownloaded}
                aiDownloadProgress={aiDownloadProgress}
                aiDownloading={aiDownloading}
                aiLoading={aiLoading}
                aiReady={aiReady}
                onAiSelect={handleAiSelectModel}
                onAiDownload={handleAiDownload}
                onAiDelete={handleAiDelete}
                onAiLoad={handleAiLoad}
                byokStatus={byokStatus}
                byokError={byokError}
                onStartTour={handleStartTour}
              />
            )}
          </PullToRefresh>
        </main>

        <nav className="nav">
          {navItems.map(item => (
            <button
              key={item.id}
              data-tour={`nav-${item.id}`}
              className={`nav-btn ${tab === item.id ? 'active' : ''}`}
              onClick={() => { setEditorOpen(false); setTab(item.id) }}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </ErrorBoundary>
  )
}
