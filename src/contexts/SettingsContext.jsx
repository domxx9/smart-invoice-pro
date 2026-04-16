import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { setCurrency, setInvoicePrefix, setInvoicePadding } from '../helpers.js'
import { setSecret, getSecret, migrateKeysFromLocalStorage } from '../secure-storage.js'

const SettingsContext = createContext(null)

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
  aiMode: 'small',
  byokProvider: '',
  pdfTemplate: {},
}

function loadSettings() {
  const saved = localStorage.getItem('sip_settings')
  const s = saved ? JSON.parse(saved) : {}
  const merged = { ...DEFAULTS, ...s }
  setCurrency(merged.currency)
  setInvoicePrefix(merged.invoicePrefix)
  setInvoicePadding(merged.invoicePadding)
  return merged
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings)

  // One-time migration + hydrate sqApiKey from secure storage
  useEffect(() => {
    ;(async () => {
      await migrateKeysFromLocalStorage()
      const key = await getSecret('sip_sqApiKey')
      if (key) setSettings((prev) => ({ ...prev, sqApiKey: key }))
    })()
  }, [])

  const saveSettings = useCallback(async (s) => {
    setSettings(s)
    if (s.sqApiKey) await setSecret('sip_sqApiKey', s.sqApiKey)
    const toStore = { ...s }
    delete toStore.sqApiKey
    localStorage.setItem('sip_settings', JSON.stringify(toStore))
    setCurrency(s.currency)
    setInvoicePrefix(s.invoicePrefix || 'INV')
    setInvoicePadding(s.invoicePadding || 4)
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
