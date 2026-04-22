import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContactModal } from '../ContactModal.jsx'

describe('ContactModal', () => {
  it('renders create mode with empty fields', () => {
    render(<ContactModal contact={null} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('New Contact')).toBeInTheDocument()
    expect(screen.getByLabelText('Name *')).toHaveValue('')
  })

  it('renders edit mode pre-filled with contact data', () => {
    render(
      <ContactModal
        contact={{ id: 'c1', name: 'Jane Smith', email: 'jane@example.com', business: 'Acme Corp' }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('Edit Contact')).toBeInTheDocument()
    expect(screen.getByLabelText('Name *')).toHaveValue('Jane Smith')
    expect(screen.getByLabelText('Email')).toHaveValue('jane@example.com')
  })

  it('calls onSave with correct contact shape when saved', () => {
    const onSave = vi.fn()
    render(<ContactModal contact={null} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Bob Jones' } })
    fireEvent.change(screen.getByLabelText('Business'), { target: { value: 'BizCorp' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bob@bizcorp.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({
      name: 'Bob Jones',
      business: 'BizCorp',
      email: 'bob@bizcorp.com',
      phone: '',
      address1: '',
      address2: '',
      city: '',
      postcode: '',
      country: '',
    })
  })

  it('shows error when name is required and empty on save', () => {
    const onSave = vi.fn()
    render(<ContactModal contact={null} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows error when email is invalid', () => {
    const onSave = vi.fn()
    render(<ContactModal contact={null} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Invalid email address')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<ContactModal contact={null} onSave={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn()
    render(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal">
          <ContactModal contact={null} onSave={vi.fn()} onClose={vi.fn()} />
        </div>
      </div>,
    )
    fireEvent.click(screen.getByText('New Contact').closest('.modal-overlay'))
    expect(onClose).toHaveBeenCalled()
  })
})
