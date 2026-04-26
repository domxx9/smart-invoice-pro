import { describe, it, expect, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../ToastContext.jsx'

function Consumer({ onMount }) {
  const ctx = useToast()
  onMount(ctx)
  return null
}

function renderWithProvider(onMount) {
  return render(
    <ToastProvider>
      <Consumer onMount={onMount} />
    </ToastProvider>,
  )
}

describe('ToastContext', () => {
  it('provides toast, dismissToast, and toasts via context', () => {
    let ctx
    renderWithProvider((c) => {
      ctx = c
    })
    expect(typeof ctx.toast).toBe('function')
    expect(typeof ctx.dismissToast).toBe('function')
    expect(Array.isArray(ctx.toasts)).toBe(true)
  })

  it('starts with an empty toasts list', () => {
    let ctx
    renderWithProvider((c) => {
      ctx = c
    })
    expect(ctx.toasts).toHaveLength(0)
  })

  it('adds a toast when toast() is called', () => {
    let ctx
    renderWithProvider((c) => {
      ctx = c
    })
    act(() => {
      ctx.toast('Hello world', 'success', '🎉')
    })
    expect(ctx.toasts).toHaveLength(1)
    expect(ctx.toasts[0]).toMatchObject({ message: 'Hello world', type: 'success', icon: '🎉' })
  })

  it('dismissToast removes the matching toast by id', () => {
    let ctx
    renderWithProvider((c) => {
      ctx = c
    })
    act(() => {
      ctx.toast('First', 'info')
      ctx.toast('Second', 'info')
    })
    const firstId = ctx.toasts[0].id
    act(() => {
      ctx.dismissToast(firstId)
    })
    expect(ctx.toasts).toHaveLength(1)
    expect(ctx.toasts[0].message).toBe('Second')
  })

  it('defaults type to "info" when not specified', () => {
    let ctx
    renderWithProvider((c) => {
      ctx = c
    })
    act(() => {
      ctx.toast('Plain message')
    })
    expect(ctx.toasts[0].type).toBe('info')
  })

  it('throws when useToast is called outside ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <Consumer
          onMount={() => {
            /* triggers useToast */
          }}
        />,
      ),
    ).toThrow('useToast must be used within ToastProvider')
    spy.mockRestore()
  })
})
