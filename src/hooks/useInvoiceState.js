import { useState, useEffect, useCallback } from 'react'
import { blankInvoice, nextId, today } from '../helpers.js'

export function useInvoiceState({ defaultTax, onPaid, onOpenEditor }) {
  const [invoices, setInvoices] = useState([])
  const [editing, setEditing] = useState(() => {
    const d = localStorage.getItem('sip_draft_edit')
    return d ? JSON.parse(d) : null
  })
  const [editingOriginal, setEditingOriginal] = useState(() => {
    const o = localStorage.getItem('sip_draft_original')
    return o ? JSON.parse(o) : null
  })
  const [editorOpen, setEditorOpen] = useState(() => !!localStorage.getItem('sip_draft_edit'))

  useEffect(() => {
    const saved = localStorage.getItem('sip_invoices')
    if (saved) setInvoices(JSON.parse(saved))
  }, [])

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
    const updated = invoices.filter(i => i.id !== id)
    saveInvoices(updated)
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  return {
    invoices, saveInvoices,
    editing, editingOriginal, editorOpen, setEditorOpen,
    handleNewInvoice, handleEdit, handleDraftChange,
    handleSave, handleDuplicateInvoice,
    handleCloseEditor, handleDiscardEdit, handleDeleteInvoice,
  }
}
