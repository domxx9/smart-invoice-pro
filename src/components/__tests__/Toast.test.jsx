import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toast } from '../Toast.jsx'

function makeToast(overrides = {}) {
  return { id: 1, message: 'Test message', type: 'info', icon: null, ...overrides }
}

describe('Toast', () => {
  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<Toast toasts={[]} onDismiss={vi.fn()} />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders a button for each toast', () => {
    const toasts = [makeToast({ id: 1, message: 'First' }), makeToast({ id: 2, message: 'Second' })]
    render(<Toast toasts={toasts} onDismiss={vi.fn()} />)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('calls onDismiss with the toast id when clicked', () => {
    const onDismiss = vi.fn()
    render(<Toast toasts={[makeToast({ id: 42 })]} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }))
    expect(onDismiss).toHaveBeenCalledWith(42)
  })

  it('renders icon when provided', () => {
    render(<Toast toasts={[makeToast({ icon: '🎉', message: 'Done' })]} onDismiss={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn.textContent).toContain('🎉')
    expect(btn.textContent).toContain('Done')
  })

  it('does not render icon span when icon is null', () => {
    render(<Toast toasts={[makeToast({ icon: null, message: 'No icon' })]} onDismiss={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn.querySelector('[aria-hidden]')).toBeNull()
  })

  it('has role="status" and aria-live="polite" on the container', () => {
    const { container } = render(<Toast toasts={[makeToast()]} onDismiss={vi.fn()} />)
    const wrapper = container.firstChild
    expect(wrapper).toHaveAttribute('role', 'status')
    expect(wrapper).toHaveAttribute('aria-live', 'polite')
  })

  it('applies distinct background for error type', () => {
    render(<Toast toasts={[makeToast({ type: 'error' })]} onDismiss={vi.fn()} />)
    const btn = screen.getByRole('button')
    // jsdom normalizes hex → rgb(); rgb(127,29,29) = #7f1d1d
    expect(btn.style.background).toMatch(/rgb\(127,\s*29,\s*29\)/)
  })

  it('applies distinct background for success type', () => {
    render(<Toast toasts={[makeToast({ type: 'success' })]} onDismiss={vi.fn()} />)
    const btn = screen.getByRole('button')
    // jsdom normalizes hex → rgb(); rgb(20,83,45) = #14532d
    expect(btn.style.background).toMatch(/rgb\(20,\s*83,\s*45\)/)
  })
})
