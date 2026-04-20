import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FulfilmentChoiceModal } from '../FulfilmentChoiceModal.jsx'

describe('FulfilmentChoiceModal', () => {
  it('renders Go to Picker and Skip buttons with the invoice id in the heading', () => {
    render(
      <FulfilmentChoiceModal
        invoiceId="INV0042"
        onPicker={vi.fn()}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Fulfil invoice INV0042')
    expect(screen.getByText(/Fulfil INV0042/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Go to Picker/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Skip picking/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument()
  })

  it('calls onPicker when Go to Picker is clicked', () => {
    const onPicker = vi.fn()
    render(
      <FulfilmentChoiceModal
        invoiceId="INV0001"
        onPicker={onPicker}
        onSkip={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Go to Picker/ }))
    expect(onPicker).toHaveBeenCalled()
  })

  it('calls onSkip when Skip picking is clicked', () => {
    const onSkip = vi.fn()
    render(
      <FulfilmentChoiceModal
        invoiceId="INV0001"
        onPicker={vi.fn()}
        onSkip={onSkip}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Skip picking/ }))
    expect(onSkip).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <FulfilmentChoiceModal
        invoiceId="INV0001"
        onPicker={vi.fn()}
        onSkip={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
    expect(onClose).toHaveBeenCalled()
  })
})
