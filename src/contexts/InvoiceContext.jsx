import { createContext, useContext, useState } from 'react'
import { useInvoiceState } from '../hooks/useInvoiceState.js'
import { useSettings } from './SettingsContext.jsx'

export const InvoiceContext = createContext(null)

export function InvoiceProvider({ children, onOpenEditor }) {
  const { settings } = useSettings()
  const [confettiTrigger, setConfettiTrigger] = useState(0)
  const inv = useInvoiceState({
    defaultTax: settings.defaultTax,
    onPaid: () => setConfettiTrigger((t) => t + 1),
    onOpenEditor,
  })
  return (
    <InvoiceContext.Provider value={{ ...inv, confettiTrigger }}>
      {children}
    </InvoiceContext.Provider>
  )
}

export function useInvoice() {
  const ctx = useContext(InvoiceContext)
  if (!ctx) throw new Error('useInvoice must be used within InvoiceProvider')
  return ctx
}
