import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useInvoiceState } from '../useInvoiceState.js'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

beforeEach(() => {
  localStorage.clear()
})

function setup() {
  return renderHook(() => useInvoiceState({ defaultTax: 20 }), {
    wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
  })
}

describe('useInvoiceState — localStorage corruption recovery', () => {
  it('recovers from corrupted sip_draft_edit', () => {
    localStorage.setItem('sip_draft_edit', '{bad json')
    localStorage.setItem('sip_draft_original', '{"id":1}')

    const { result } = setup()

    expect(result.current.editing).toBeNull()
    expect(localStorage.getItem('sip_draft_edit')).toBeNull()
  })

  it('recovers from corrupted sip_draft_original', () => {
    localStorage.setItem('sip_draft_edit', '{"id":1}')
    localStorage.setItem('sip_draft_original', '{bad json')

    const { result } = setup()

    expect(result.current.editingOriginal).toBeNull()
    expect(localStorage.getItem('sip_draft_original')).toBeNull()
  })

  it('recovers from corrupted sip_invoices', () => {
    localStorage.setItem('sip_invoices', '{not valid json')

    const { result } = setup()

    expect(result.current.invoices).toEqual([])
    expect(localStorage.getItem('sip_invoices')).toBeNull()
  })

  it('draft round-trips correctly through save/load', () => {
    const { result } = setup()

    act(() => result.current.handleNewInvoice())
    const draft = { ...result.current.editing, customer: 'Acme Corp', total: 500 }
    act(() => result.current.handleDraftChange(draft))

    const reResult = renderHook(() => useInvoiceState({ defaultTax: 20 }), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    })
    expect(reResult.result.current.editing.customer).toBe('Acme Corp')
    expect(reResult.result.current.editing.total).toBe(500)
  })

  it('invoice list round-trips correctly through save/load', () => {
    const { result } = setup()

    act(() => result.current.handleNewInvoice())
    const draft = result.current.editing
    act(() => result.current.handleSave(draft))

    const reResult = renderHook(() => useInvoiceState({ defaultTax: 20 }), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    })
    expect(reResult.result.current.invoices).toHaveLength(1)
    expect(reResult.result.current.invoices[0].customer).toBe('')
  })

  it('null stored value for drafts does not crash', () => {
    localStorage.setItem('sip_draft_edit', null)
    localStorage.setItem('sip_draft_original', null)

    const { result } = setup()

    expect(result.current.editing).toBeNull()
    expect(result.current.editingOriginal).toBeNull()
  })
})
