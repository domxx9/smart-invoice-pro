import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { setCurrency, setInvoicePrefix, setInvoicePadding } from '../helpers.js'
import { setSecret, getSecret, migrateKeysFromLocalStorage } from '../secure-storage.js'
import { logger } from '../utils/logger.js'

const SettingsContext = createContext(null)

const EMPTY_SMART_PASTE_CONTEXT = {
  productType: '',
  shopType: '',
  customerType: '',
  vocabulary: '',
  locale: '',
}

// Vocabulary is optional (SMA-97): the slang dropdown lets users leave it
// blank when no trade shorthand applies. The other four fields still need
// a value for Smart Paste AI to have enough context to run.
const REQUIRED_SMART_PASTE_CONTEXT_KEYS = ['productType', 'shopType', 'customerType', 'locale']

const DEFAULT_DEBUG = { logLevel: 'error' }

const DEFAULTS = {
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
  invoicePrefix: 'INV',
  invoicePadding: 4,
  sqApiKey: '',
  sqDomain: '',
  shopifyShopDomain: '',
  shopifyAccessToken: '',
  activeIntegration: null,
  aiMode: 'small',
  byokProvider: '',
  byokBaseUrl: '',
  byokModel: '',
  smartPasteContext: { ...EMPTY_SMART_PASTE_CONTEXT },
  pdfTemplate: {},
  debug: { ...DEFAULT_DEBUG },
}

export function isSmartPasteContextSet(settings) {
  const ctx = settings?.smartPasteContext
  if (!ctx) return false
  return REQUIRED_SMART_PASTE_CONTEXT_KEYS.every(
    (k) => typeof ctx[k] === 'string' && ctx[k].trim().length > 0,
  )
}

function loadSettings() {
  const saved = localStorage.getItem('sip_settings')
  const s = saved ? JSON.parse(saved) : {}
  const merged = {
    ...DEFAULTS,
    ...s,
    smartPasteContext: { ...EMPTY_SMART_PASTE_CONTEXT, ...(s.smartPasteContext || {}) },
    debug: { ...DEFAULT_DEBUG, ...(s.debug || {}) },
  }
  setCurrency(merged.currency)
  setInvoicePrefix(merged.invoicePrefix)
  setInvoicePadding(merged.invoicePadding)
  logger.setMinLevel(merged.debug.logLevel)
  return merged
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings)

  // One-time migration + hydrate secrets from secure storage.
  useEffect(() => {
    ;(async () => {
      await migrateKeysFromLocalStorage()
      const [sq, shop] = await Promise.all([
        getSecret('sip_sqApiKey'),
        getSecret('sip_shopifyAccessToken'),
      ])
      setSettings((prev) => ({
        ...prev,
        ...(sq ? { sqApiKey: sq } : {}),
        ...(shop ? { shopifyAccessToken: shop } : {}),
      }))
    })()
  }, [])

  const saveSettings = useCallback(async (s) => {
    setSettings(s)
    if (s.sqApiKey) await setSecret('sip_sqApiKey', s.sqApiKey)
    if (s.shopifyAccessToken) await setSecret('sip_shopifyAccessToken', s.shopifyAccessToken)
    const toStore = { ...s }
    delete toStore.sqApiKey
    delete toStore.shopifyAccessToken
    localStorage.setItem('sip_settings', JSON.stringify(toStore))
    setCurrency(s.currency)
    setInvoicePrefix(s.invoicePrefix || 'INV')
    setInvoicePadding(s.invoicePadding || 4)
    logger.setMinLevel(s.debug?.logLevel || DEFAULT_DEBUG.logLevel)
  }, [])

  return (
    <SettingsContext.Provider value={{ settings, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
