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

describe('useInvoiceState.handleSave — lifecycle guard', () => {
  it('allows a valid status transition (new → pending)', () => {
    const { result } = setup()

    act(() => result.current.handleNewInvoice())
    const draft = result.current.editing
    act(() => result.current.handleSave(draft))

    act(() => result.current.handleSave({ ...draft, status: 'pending' }))
    expect(result.current.invoices[0].status).toBe('pending')
  })

  it('rejects an invalid status transition (new → paid)', () => {
    const { result } = setup()

    act(() => result.current.handleNewInvoice())
    const draft = result.current.editing
    act(() => result.current.handleSave(draft))

    expect(() => {
      act(() => result.current.handleSave({ ...draft, status: 'paid' }))
    }).toThrow(/Invalid invoice status transition: new → paid/)
    expect(result.current.invoices[0].status).toBe('new')
  })

  it('rejects transitions out of terminal paid (paid → pending)', () => {
    const { result } = setup()

    act(() => result.current.handleNewInvoice())
    const draft = result.current.editing
    act(() => result.current.handleSave(draft))
    act(() => result.current.handleSave({ ...draft, status: 'pending' }))
    act(() => result.current.handleSave({ ...draft, status: 'fulfilled' }))
    act(() => result.current.handleSave({ ...draft, status: 'paid' }))
    expect(result.current.invoices[0].status).toBe('paid')

    expect(() => {
      act(() => result.current.handleSave({ ...draft, status: 'pending' }))
    }).toThrow(/Invalid invoice status transition: paid → pending/)
    expect(result.current.invoices[0].status).toBe('paid')
  })

  it('allows same-status save (no transition)', () => {
    const { result } = setup()

    act(() => result.current.handleNewInvoice())
    const draft = result.current.editing
    act(() => result.current.handleSave(draft))

    act(() => result.current.handleSave({ ...draft, customer: 'Acme' }))
    expect(result.current.invoices[0].customer).toBe('Acme')
    expect(result.current.invoices[0].status).toBe('new')
  })

  it('does not apply the guard to brand-new invoices (no prior state)', () => {
    const { result } = setup()

    act(() => result.current.handleNewInvoice())
    const draft = { ...result.current.editing, status: 'paid' }
    expect(() => act(() => result.current.handleSave(draft))).not.toThrow()
    expect(result.current.invoices[0].status).toBe('paid')
  })
})
