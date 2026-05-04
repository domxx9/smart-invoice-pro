import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { setCurrency, setInvoicePrefix, setInvoicePadding } from '../helpers.js'
import { setSecret, getSecret, migrateKeysFromLocalStorage } from '../secure-storage.js'
import { logger } from '../utils/logger.js'
import { ToastContext } from './ToastContext.jsx'
import { STORAGE_KEYS } from '../constants/storageKeys'

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
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankSortCode: '',
  bankIban: '',
  bankSwift: '',
  paymentInstructions: '',
  taxIdLabel: 'VAT',
  taxIdNumber: '',
  companyNumber: '',
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
  pickerViewMode: 'list',
  debug: { ...DEFAULT_DEBUG },
  // SMA-123: catalog-size-driven search routing. `pickTier` (src/catalog/tier.js)
  // updates this after every full sync — do not edit by hand.
  searchTier: 'local',
}

export function isSmartPasteContextSet(settings) {
  const ctx = settings?.smartPasteContext
  if (!ctx) return false
  return REQUIRED_SMART_PASTE_CONTEXT_KEYS.every(
    (k) => typeof ctx[k] === 'string' && ctx[k].trim().length > 0,
  )
}

function loadSettings() {
  let s = {}
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SIP_SETTINGS)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed && typeof parsed === 'object') s = parsed
    }
  } catch {
    localStorage.removeItem(STORAGE_KEYS.SIP_SETTINGS)
  }
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
  const [hydrated, setHydrated] = useState(false)
  const toastCtx = useContext(ToastContext)
  const toastRef = useRef(toastCtx)
  toastRef.current = toastCtx

  useEffect(() => {
    ;(async () => {
      try {
        await migrateKeysFromLocalStorage()
        const [sq, shop, bankAccount, bankIban, bankSwift] = await Promise.all([
          getSecret('sip_sqApiKey'),
          getSecret('sip_shopifyAccessToken'),
          getSecret('sip_bankAccountNumber'),
          getSecret('sip_bankIban'),
          getSecret('sip_bankSwift'),
        ])
        setSettings((prev) => ({
          ...prev,
          ...(sq ? { sqApiKey: sq } : {}),
          ...(shop ? { shopifyAccessToken: shop } : {}),
          ...(bankAccount ? { bankAccountNumber: bankAccount } : {}),
          ...(bankIban ? { bankIban } : {}),
          ...(bankSwift ? { bankSwift } : {}),
        }))
      } catch (err) {
        logger.error('SettingsContext: secure storage hydration failed', err)
        toastRef.current?.toast(
          'Settings failed to load — some features may be unavailable',
          'error',
        )
      } finally {
        setHydrated(true)
      }
    })()
  }, [])

  const saveSettings = useCallback(
    async (s) => {
      if (!hydrated) {
        logger.warn(
          'SettingsContext: saveSettings called before hydration complete — secrets will not persist to secure storage',
        )
      }
      setSettings(s)
      if (hydrated) {
        if (s.sqApiKey) await setSecret('sip_sqApiKey', s.sqApiKey)
        if (s.shopifyAccessToken) await setSecret('sip_shopifyAccessToken', s.shopifyAccessToken)
        if (s.bankAccountNumber) await setSecret('sip_bankAccountNumber', s.bankAccountNumber)
        if (s.bankIban) await setSecret('sip_bankIban', s.bankIban)
        if (s.bankSwift) await setSecret('sip_bankSwift', s.bankSwift)
      }
      const toStore = { ...s }
      delete toStore.sqApiKey
      delete toStore.shopifyAccessToken
      delete toStore.bankAccountNumber
      delete toStore.bankIban
      delete toStore.bankSwift
      localStorage.setItem(STORAGE_KEYS.SIP_SETTINGS, JSON.stringify(toStore))
      setCurrency(s.currency)
      setInvoicePrefix(s.invoicePrefix || 'INV')
      setInvoicePadding(s.invoicePadding || 4)
      logger.setMinLevel(s.debug?.logLevel || DEFAULT_DEBUG.logLevel)
    },
    [hydrated],
  )

  return (
    <SettingsContext.Provider value={{ settings, saveSettings, hydrated }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
