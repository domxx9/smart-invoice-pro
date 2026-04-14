import { useState, useEffect, useCallback, useRef } from 'react'
import { CSS } from './styles.js'
import { SAMPLE_PRODUCTS, SAMPLE_INVOICES } from './constants.js'
import { blankInvoice, nextId, today, setCurrency, setInvoicePrefix, setInvoicePadding } from './helpers.js'
import { fetchSquarespaceProducts, fetchSquarespaceOrders } from './api/squarespace.js'
import {
  MODELS as AI_MODELS,
  isModelDownloaded,
  downloadModel as gemmaDownload,
  deleteModel as gemmaDelete,
  initModel as gemmaInit,
  isGemmaReady,
  getLoadedModelId,
  cancelDownload as gemmaCancelDownload,
} from './gemma.js'
import { Confetti } from './components/Confetti.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { Dashboard } from './components/Dashboard.jsx'
import { Invoices } from './components/InvoiceList.jsx'
import { InvoiceEditor } from './components/InvoiceEditor.jsx'
import { Inventory } from './components/Inventory.jsx'
import { Orders } from './components/Orders.jsx'
import { Settings } from './components/Settings.jsx'
import { Onboarding } from './components/Onboarding.jsx'
import { TourOverlay, TOUR_STEPS } from './components/TourOverlay.jsx'
import { PullToRefresh } from './components/PullToRefresh.jsx'
import { Icon } from './components/Icon.jsx'

export default function App() {
  // ─── Core state ───────────────────────────────────────────────────────────
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('sip_onboarded'))
  const [tourStep, setTourStep]   = useState(null)
  const [tab, setTab]             = useState(() => localStorage.getItem('sip_draft_edit') ? 'invoices' : 'dashboard')

  const [invoices, setInvoices] = useState([])
  const [products, setProducts] = useState(() => {
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
  const [orderSyncStatus, setOrderSyncStatus]   = useState('idle')
  const [orderSyncCount, setOrderSyncCount]     = useState(0)
  const [picks, setPicks] = useState(() => {
    const s = localStorage.getItem('sip_picks')
    return s ? JSON.parse(s) : {}
  })
  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncCount, setSyncCount]   = useState(0)

  const [editing, setEditing] = useState(() => {
    const d = localStorage.getItem('sip_draft_edit')
    return d ? JSON.parse(d) : null
  })
  const [editingOriginal, setEditingOriginal] = useState(() => {
    const o = localStorage.getItem('sip_draft_original')
    return o ? JSON.parse(o) : null
  })
  const [editorOpen, setEditorOpen] = useState(() => !!localStorage.getItem('sip_draft_edit'))

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('sip_settings')
    const s = saved ? JSON.parse(saved) : {}
    const defaults = {
      businessName: 'My Business',
      email: '', phone: '', address1: '', address2: '',
      city: '', postcode: '', country: '',
      defaultTax: 20, currency: 'GBP',
      invoicePrefix: 'INV', invoicePadding: 4,
      sqApiKey: '', sqDomain: '',
      aiMode: 'small', byokProvider: '',
      pdfTemplate: {},
    }
    const merged = { ...defaults, ...s }
    setCurrency(merged.currency)
    setInvoicePrefix(merged.invoicePrefix)
    setInvoicePadding(merged.invoicePadding)
    return merged
  })

  // ─── Confetti + Easter egg ────────────────────────────────────────────────
  const [confettiTrigger, setConfettiTrigger] = useState(0)
  const [eggTaps, setEggTaps]   = useState(0)
  const [showEgg, setShowEgg]   = useState(false)
  const eggTimer = useRef(null)

  const handleVersionTap = () => {
    const next = eggTaps + 1
    setEggTaps(next)
    clearTimeout(eggTimer.current)
    if (next >= 7) {
      setShowEgg(true)
      setEggTaps(0)
      setTimeout(() => setShowEgg(false), 3800)
    } else {
      eggTimer.current = setTimeout(() => setEggTaps(0), 1800)
    }
  }

  // ─── AI state ─────────────────────────────────────────────────────────────
  const [aiModelId, setAiModelId]                   = useState(() => localStorage.getItem('sip_ai_model') || 'small')
  const [aiDownloaded, setAiDownloaded]             = useState({})
  const [aiDownloadProgress, setAiDownloadProgress] = useState({})
  const [aiDownloading, setAiDownloading]           = useState(null)
  const [aiLoading, setAiLoading]                   = useState(false)
  const [aiReady, setAiReady]                       = useState(false)
  const [byokStatus, setByokStatus]                 = useState('idle')
  const [byokError, setByokError]                   = useState('')

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('sip_invoices')
    if (saved) setInvoices(JSON.parse(saved))
  }, [])

  useEffect(() => {
    setCurrency(settings.currency)
    setInvoicePrefix(settings.invoicePrefix || 'INV')
    setInvoicePadding(settings.invoicePadding || 4)
  }, [settings.currency, settings.invoicePrefix, settings.invoicePadding])

  // Check which models are downloaded on mount; auto-init if available
  useEffect(() => {
    const check = async () => {
      const results = {}
      for (const id of Object.keys(AI_MODELS)) {
        results[id] = await isModelDownloaded(id)
      }
      setAiDownloaded(results)
      const modelToLoad = localStorage.getItem('sip_ai_model') || 'small'
      if (results[modelToLoad]) {
        setAiLoading(true)
        try {
          await gemmaInit(modelToLoad)
          setAiReady(isGemmaReady())
        } catch (e) {
          console.error('[AI] auto-init error:', e)
        } finally {
          setAiLoading(false)
        }
      }
    }
    check()
  }, [])

  // ─── Invoice handlers ─────────────────────────────────────────────────────
  const saveInvoices = useCallback((invs) => {
    setInvoices(invs)
    localStorage.setItem('sip_invoices', JSON.stringify(invs))
  }, [])

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

  const handleNewInvoice    = () => openEditor(blankInvoice(invoices, settings.defaultTax))
  const handleEdit          = (inv) => openEditor({ ...inv })
  const handleDraftChange   = useCallback((inv) => {
    setEditing(inv)
    localStorage.setItem('sip_draft_edit', JSON.stringify(inv))
  }, [])

  const handleSave = (inv) => {
    const old = invoices.find(i => i.id === inv.id)
    const justPaid = inv.status === 'paid' && (!old || old.status !== 'paid')
    const idx = invoices.findIndex(i => i.id === inv.id)
    const updated = idx >= 0
      ? invoices.map((i, n) => n === idx ? inv : i)
      : [...invoices, inv]
    saveInvoices(updated)
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
    if (justPaid) setConfettiTrigger(t => t + 1)
  }

  const handleDuplicateInvoice = (inv) => {
    const copy = { ...inv, id: nextId(invoices), status: 'new', date: today(), due: '' }
    openEditor(copy)
  }

  // onClose: save current draft state and close the editor
  const handleCloseEditor = (inv) => {
    setEditing(inv)
    localStorage.setItem('sip_draft_edit', JSON.stringify(inv))
    setEditorOpen(false)
  }

  // onDiscard: abandon draft entirely, close editor
  const handleDiscardEdit = () => {
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  const handleDeleteInvoice = (id) => {
    const updated = invoices.filter(i => i.id !== id)
    saveInvoices(updated)
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  // ─── Catalog / Orders handlers ────────────────────────────────────────────
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

  // ─── Settings handler ─────────────────────────────────────────────────────
  const handleSaveSettings = (s) => {
    setSettings(s)
    localStorage.setItem('sip_settings', JSON.stringify(s))
  }

  // ─── Onboarding handlers ──────────────────────────────────────────────────
  const handleOnboardConnect = (apiKey, fetchedProducts, bizDetails) => {
    const newSettings = {
      ...settings,
      sqApiKey: apiKey,
      businessName: bizDetails.businessName || 'My Business',
      email: bizDetails.email || '',
      phone: bizDetails.phone || '',
      address1: bizDetails.address || '',
      currency: bizDetails.currency || 'GBP',
      defaultTax: parseFloat(bizDetails.defaultTax) || 20,
    }
    setSettings(newSettings)
    localStorage.setItem('sip_settings', JSON.stringify(newSettings))
    if (fetchedProducts?.length) saveProducts(fetchedProducts)
    localStorage.setItem('sip_onboarded', 'real')
    setOnboarded(true)
    setTourStep(0)
  }

  const handleOnboardDemo = () => {
    saveInvoices(SAMPLE_INVOICES)
    localStorage.setItem('sip_onboarded', 'demo')
    setOnboarded(true)
    setTourStep(0)
  }

  // ─── AI handlers ──────────────────────────────────────────────────────────
  const handleAiSelect = (id) => {
    setAiModelId(id)
    localStorage.setItem('sip_ai_model', id)
  }

  const handleAiDownload = async (id) => {
    setAiDownloading(id)
    setAiDownloadProgress(p => ({ ...p, [id]: 0 }))
    try {
      await gemmaDownload(id, (frac) => setAiDownloadProgress(p => ({ ...p, [id]: frac })))
      setAiDownloaded(p => ({ ...p, [id]: true }))
    } catch (e) {
      if (e.name !== 'AbortError') console.error('[AI] download error:', e)
    } finally {
      setAiDownloading(null)
    }
  }

  const handleAiDelete = async (id) => {
    await gemmaDelete(id)
    setAiDownloaded(p => ({ ...p, [id]: false }))
    if (getLoadedModelId() === id) setAiReady(false)
  }

  const handleAiLoad = async (id) => {
    setAiLoading(true)
    try {
      await gemmaInit(id)
      setAiReady(isGemmaReady())
    } catch (e) {
      console.error('[AI] load error:', e)
    } finally {
      setAiLoading(false)
    }
  }

  // ─── Onboarding screen ────────────────────────────────────────────────────
  if (!onboarded) {
    return (
      <ErrorBoundary>
        <style>{CSS}</style>
        <Onboarding onConnect={handleOnboardConnect} onDemo={handleOnboardDemo} />
      </ErrorBoundary>
    )
  }

  // ─── Main app ─────────────────────────────────────────────────────────────
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
      <Confetti trigger={confettiTrigger} />
      {showEgg && (
        <div style={{
          position: 'fixed', bottom: 88, left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--card)', border: '1px solid var(--accent)',
          borderRadius: 12, padding: '10px 20px',
          fontSize: '.82rem', color: 'var(--text)',
          zIndex: 9998, whiteSpace: 'nowrap', textAlign: 'center',
          boxShadow: '0 8px 40px rgba(245,166,35,.35)',
          animation: 'egg-pop 0.3s ease-out, egg-fade 3.8s ease-in-out forwards',
        }}>
          ✦ Vibe-coded with Claude · April 2026
        </div>
      )}
      {tourStep !== null && (
        <TourOverlay
          step={tourStep}
          onNext={() => tourStep < TOUR_STEPS.length - 1 ? setTourStep(t => t + 1) : setTourStep(null)}
          onSkip={() => setTourStep(null)}
        />
      )}
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <h1>Smart Invoice Pro</h1>
            <span className="text-muted" style={{ fontSize: '.75rem', cursor: 'default', userSelect: 'none' }}
              onClick={handleVersionTap}>v1.0</span>
          </div>
        </header>

        <main className="content">
          <PullToRefresh
            onRefresh={tab === 'orders' ? handleSyncOrders : handleSyncCatalog}
            enabled={(tab === 'inventory' || tab === 'orders') && !!settings.sqApiKey}
          >
            {tab === 'dashboard' && (
              <Dashboard
                invoices={invoices}
                onNewInvoice={handleNewInvoice}
                onOpenInvoice={handleEdit}
              />
            )}
            {tab === 'invoices' && !editorOpen && (
              <Invoices
                invoices={invoices}
                onNewInvoice={handleNewInvoice}
                onEdit={inv => inv.status === 'draft' ? setEditorOpen(true) : handleEdit(inv)}
                onDuplicate={handleDuplicateInvoice}
                editingDraft={editing}
              />
            )}
            {tab === 'invoices' && editorOpen && editing !== null && (
              <InvoiceEditor
                invoice={editing}
                originalInvoice={editingOriginal ?? editing}
                products={products}
                settings={settings}
                onSave={handleSave}
                onClose={handleCloseEditor}
                onDelete={handleDeleteInvoice}
                onDiscard={handleDiscardEdit}
                onDraftChange={handleDraftChange}
                aiReady={aiReady}
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
                onAiSelect={handleAiSelect}
                onAiDownload={handleAiDownload}
                onAiDelete={handleAiDelete}
                onAiLoad={handleAiLoad}
                byokStatus={byokStatus}
                byokError={byokError}
                onStartTour={setTourStep}
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
