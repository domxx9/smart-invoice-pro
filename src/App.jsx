import { useState } from 'react'
import { CSS } from './styles.js'
import { SAMPLE_INVOICES } from './constants.js'
import { ToastProvider, useToast } from './contexts/ToastContext.jsx'
import { SettingsProvider, useSettings } from './contexts/SettingsContext.jsx'
import { useInvoiceState } from './hooks/useInvoiceState.js'
import { useCatalogSync } from './hooks/useCatalogSync.js'
import { useOrderSync } from './hooks/useOrderSync.js'
import { useAiModel } from './hooks/useAiModel.js'
import { useEasterEgg, EasterEggToast } from './hooks/useEasterEgg.jsx'
import { Confetti } from './components/Confetti.jsx'
import { Toast } from './components/Toast.jsx'
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
import { BurgerMenu } from './components/BurgerMenu.jsx'
import { useMenu } from './hooks/useMenu.js'

export default function App() {
  return (
    <ErrorBoundary>
      <style>{CSS}</style>
      <SettingsProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </SettingsProvider>
    </ErrorBoundary>
  )
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'invoices', label: 'Invoices', icon: 'invoice' },
  { id: 'orders', label: 'Orders', icon: 'orders' },
]

const MENU_ITEMS = [
  { id: 'inventory', label: 'Catalog', icon: 'inventory' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

function AppShell() {
  const { toasts, toast, dismissToast } = useToast()
  const { settings, saveSettings } = useSettings()
  const { showEgg, handleVersionTap } = useEasterEgg()
  const { menuOpen, openMenu, closeMenu } = useMenu()
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('sip_onboarded'))
  const [tourStep, setTourStep] = useState(null)
  const [tab, setTab] = useState(() =>
    localStorage.getItem('sip_draft_edit') ? 'invoices' : 'dashboard',
  )
  const [confettiTrigger, setConfettiTrigger] = useState(0)
  const inv = useInvoiceState({
    defaultTax: settings.defaultTax,
    onPaid: () => setConfettiTrigger((t) => t + 1),
    onOpenEditor: () => setTab('invoices'),
  })
  const syncArgs = {
    activeIntegration: settings.activeIntegration,
    sqApiKey: settings.sqApiKey,
    shopifyShopDomain: settings.shopifyShopDomain,
    shopifyAccessToken: settings.shopifyAccessToken,
  }
  const catalog = useCatalogSync(syncArgs)
  const orderSync = useOrderSync(syncArgs)
  const hasConnectedProvider =
    settings.activeIntegration === 'shopify'
      ? !!(settings.shopifyShopDomain && settings.shopifyAccessToken)
      : !!settings.sqApiKey
  const ai = useAiModel(toast, settings)
  const handleSave = (invoice) => {
    const justPaid = inv.handleSave(invoice)
    toast(
      justPaid ? 'Payment received — invoice paid! 🎉' : 'Invoice saved',
      'success',
      justPaid ? null : '✓',
    )
  }
  const handleOnboardConnect = (credentials, fetchedProducts, bizDetails, startTour = true) => {
    // credentials shape for back-compat: if a string is passed, treat it as a Squarespace
    // API key — that was the pre-Shopify signature. New callers pass an object.
    const creds =
      typeof credentials === 'string'
        ? { provider: 'squarespace', apiKey: credentials }
        : credentials
    const provider = creds.provider || 'squarespace'
    saveSettings({
      ...settings,
      activeIntegration: provider,
      sqApiKey: provider === 'squarespace' ? creds.apiKey || '' : settings.sqApiKey,
      shopifyShopDomain:
        provider === 'shopify' ? creds.shopDomain || '' : settings.shopifyShopDomain,
      shopifyAccessToken:
        provider === 'shopify' ? creds.accessToken || '' : settings.shopifyAccessToken,
      businessName: bizDetails.businessName || 'My Business',
      email: bizDetails.email || '',
      phone: bizDetails.phone || '',
      address1: bizDetails.address || '',
      currency: bizDetails.currency || 'GBP',
      defaultTax: parseFloat(bizDetails.defaultTax) || 20,
    })
    if (fetchedProducts?.length) catalog.saveProducts(fetchedProducts)
    localStorage.setItem('sip_onboarded', 'real')
    setOnboarded(true)
    if (startTour) setTourStep(0)
  }
  const handleOnboardDemo = () => {
    inv.saveInvoices(SAMPLE_INVOICES)
    localStorage.setItem('sip_onboarded', 'demo')
    setOnboarded(true)
    setTourStep(0)
  }
  if (!onboarded) return <Onboarding onConnect={handleOnboardConnect} onDemo={handleOnboardDemo} />

  return (
    <>
      <Confetti trigger={confettiTrigger} />
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <EasterEggToast show={showEgg} />
      {tourStep !== null && (
        <TourOverlay
          step={tourStep}
          onNext={() =>
            tourStep < TOUR_STEPS.length - 1 ? setTourStep((t) => t + 1) : setTourStep(null)
          }
          onSkip={() => setTourStep(null)}
        />
      )}
      <div className="app">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <header className="header">
          <div className="header-inner">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                className="header-burger-btn"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="burger-menu"
                onClick={openMenu}
              >
                <Icon name="menu" />
              </button>
              <h1>Smart Invoice Pro</h1>
            </div>
            <button
              type="button"
              className="text-muted version-tap"
              onClick={handleVersionTap}
              aria-label="App version 1.0 (tap repeatedly for easter egg)"
            >
              v1.0
            </button>
          </div>
        </header>
        <BurgerMenu
          open={menuOpen}
          onClose={closeMenu}
          items={MENU_ITEMS}
          activeId={tab}
          onSelect={(id) => {
            inv.setEditorOpen(false)
            setTab(id)
          }}
        />
        <main id="main-content" tabIndex={-1} className="content">
          <PullToRefresh
            onRefresh={tab === 'orders' ? orderSync.handleSyncOrders : catalog.handleSyncCatalog}
            enabled={(tab === 'inventory' || tab === 'orders') && hasConnectedProvider}
          >
            {tab === 'dashboard' && (
              <section aria-label="Dashboard">
                <Dashboard
                  invoices={inv.invoices}
                  onNewInvoice={inv.handleNewInvoice}
                  onOpenInvoice={inv.handleEdit}
                />
              </section>
            )}
            {tab === 'invoices' && !inv.editorOpen && (
              <section aria-label="Invoices">
                <Invoices
                  invoices={inv.invoices}
                  onNewInvoice={inv.handleNewInvoice}
                  onEdit={(i) =>
                    i.status === 'draft' ? inv.setEditorOpen(true) : inv.handleEdit(i)
                  }
                  onDuplicate={inv.handleDuplicateInvoice}
                  editingDraft={inv.editing}
                />
              </section>
            )}
            {tab === 'invoices' && inv.editorOpen && inv.editing !== null && (
              <section aria-label="Invoice editor">
                <InvoiceEditor
                  invoice={inv.editing}
                  products={catalog.products}
                  onSave={handleSave}
                  onClose={inv.handleCloseEditor}
                  onDelete={inv.handleDeleteInvoice}
                  onDraftChange={inv.handleDraftChange}
                  aiMode={settings.aiMode}
                  aiReady={ai.aiReady}
                  runInference={ai.runInference}
                  toast={toast}
                  smartPasteContext={settings.smartPasteContext}
                  onOpenSettings={() => setTab('settings')}
                />
              </section>
            )}
            {tab === 'orders' && (
              <section aria-label="Orders">
                <Orders
                  orders={orderSync.orders}
                  onSync={orderSync.handleSyncOrders}
                  syncStatus={orderSync.orderSyncStatus}
                  syncCount={orderSync.orderSyncCount}
                  hasApiKey={hasConnectedProvider}
                  lastSynced={orderSync.lastOrderSync}
                  picks={orderSync.picks}
                  onPickChange={orderSync.savePick}
                />
              </section>
            )}
            {tab === 'inventory' && (
              <section aria-label="Catalog">
                <Inventory
                  products={catalog.products}
                  onSync={catalog.handleSyncCatalog}
                  syncStatus={catalog.syncStatus}
                  syncCount={catalog.syncCount}
                  hasApiKey={hasConnectedProvider}
                  lastSynced={catalog.lastSynced}
                />
              </section>
            )}
            {tab === 'settings' && (
              <section aria-label="Settings">
                <Settings ai={ai} onStartTour={setTourStep} />
              </section>
            )}
          </PullToRefresh>
        </main>
        <nav className="nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                data-tour={`nav-${item.id}`}
                className={`nav-btn ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  inv.setEditorOpen(false)
                  setTab(item.id)
                }}
              >
                <Icon name={item.icon} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
    </>
  )
}
