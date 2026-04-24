import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InvoiceIntelligenceGuard } from '../InvoiceIntelligenceGuard.jsx'

describe('InvoiceIntelligenceGuard', () => {
  it('renders nothing when issues is an empty array', () => {
    const { container } = render(<InvoiceIntelligenceGuard issues={[]} onDismiss={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when issues is undefined', () => {
    const { container } = render(<InvoiceIntelligenceGuard onDismiss={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the heading and dismiss button when issues exist', () => {
    render(<InvoiceIntelligenceGuard issues={['Missing price on item 1']} onDismiss={vi.fn()} />)
    expect(screen.getByText('Review before saving')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('renders each issue as a list item', () => {
    const issues = [
      'Customer name is missing',
      'Line item 1 has no price',
      'Invoice has no line items',
    ]
    render(<InvoiceIntelligenceGuard issues={issues} onDismiss={vi.fn()} />)
    issues.forEach((msg) => expect(screen.getByText(msg)).toBeInTheDocument())
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<InvoiceIntelligenceGuard issues={['Some issue']} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('does not call onDismiss on multiple clicks without re-render', () => {
    const onDismiss = vi.fn()
    render(<InvoiceIntelligenceGuard issues={['Some issue']} onDismiss={onDismiss} />)
    const btn = screen.getByRole('button', { name: /dismiss/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
