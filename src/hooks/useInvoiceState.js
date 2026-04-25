import { useState, useEffect, useCallback } from 'react'
import { blankInvoice, nextId, today } from '../helpers.js'
import { assertTransition } from '../invoiceLifecycle'
import { useToast } from '../contexts/ToastContext'

export function useInvoiceState({ defaultTax, onPaid, onOpenEditor }) {
  const { toast } = useToast()
  const toastRef = useCallback(() => toast, [toast])
  const [invoices, setInvoices] = useState([])
  const [editing, setEditing] = useState(() => {
    try {
      const d = localStorage.getItem('sip_draft_edit')
      return d ? JSON.parse(d) : null
    } catch {
      localStorage.removeItem('sip_draft_edit')
      toast('Invoice draft corrupted — starting fresh', 'error')
      return null
    }
  })
  const [editingOriginal, setEditingOriginal] = useState(() => {
    try {
      const o = localStorage.getItem('sip_draft_original')
      return o ? JSON.parse(o) : null
    } catch {
      localStorage.removeItem('sip_draft_original')
      toast('Invoice draft corrupted — starting fresh', 'error')
      return null
    }
  })
  const [editorOpen, setEditorOpen] = useState(() => !!localStorage.getItem('sip_draft_edit'))

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sip_invoices')
      if (saved) setInvoices(JSON.parse(saved))
    } catch {
      localStorage.removeItem('sip_invoices')
      toast('Invoice data corrupted — starting fresh', 'error')
    }
  }, [toastRef])

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
    onOpenEditor?.()
  }

  const handleNewInvoice = () => openEditor(blankInvoice(invoices, defaultTax))
  const handleEdit = (inv) => openEditor({ ...inv })
  const handleDraftChange = useCallback((inv) => {
    setEditing(inv)
    localStorage.setItem('sip_draft_edit', JSON.stringify(inv))
  }, [])

  const handleSave = (inv) => {
    const old = invoices.find((i) => i.id === inv.id)
    if (old && old.status !== inv.status) {
      assertTransition(old.status, inv.status)
    }
    const justPaid = inv.status === 'paid' && (!old || old.status !== 'paid')
    const idx = invoices.findIndex((i) => i.id === inv.id)
    const updated = idx >= 0 ? invoices.map((i, n) => (n === idx ? inv : i)) : [...invoices, inv]
    saveInvoices(updated)
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
    if (justPaid) onPaid?.()
    return justPaid
  }

  const handleDuplicateInvoice = (inv) => {
    const copy = { ...inv, id: nextId(invoices), status: 'new', date: today(), due: '' }
    openEditor(copy)
  }

  const handleCloseEditor = (inv) => {
    setEditing(inv)
    localStorage.setItem('sip_draft_edit', JSON.stringify(inv))
    setEditorOpen(false)
  }

  const handleDiscardEdit = () => {
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  const handleDeleteInvoice = (id) => {
    const updated = invoices.filter((i) => i.id !== id)
    saveInvoices(updated)
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  return {
    invoices,
    saveInvoices,
    editing,
    editingOriginal,
    editorOpen,
    setEditorOpen,
    handleNewInvoice,
    handleEdit,
    handleDraftChange,
    handleSave,
    handleDuplicateInvoice,
    handleCloseEditor,
    handleDiscardEdit,
    handleDeleteInvoice,
  }
}
