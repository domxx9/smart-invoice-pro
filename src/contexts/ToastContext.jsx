import { createContext, useContext, useState, useCallback } from 'react'

export const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'info', icon = null, duration = 2600) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, type, icon }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), duration)
  }, [])

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
