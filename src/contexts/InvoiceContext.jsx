import { createContext, useContext } from 'react'
import { useInvoiceState } from '../hooks/useInvoiceState.js'

export const InvoiceContext = createContext(null)

export function InvoiceProvider({ children, defaultTax, onPaid, onOpenEditor }) {
  const inv = useInvoiceState({ defaultTax, onPaid, onOpenEditor })
  return <InvoiceContext.Provider value={inv}>{children}</InvoiceContext.Provider>
}

export function useInvoice() {
  const ctx = useContext(InvoiceContext)
  if (!ctx) throw new Error('useInvoice must be used within InvoiceProvider')
  return ctx
}
