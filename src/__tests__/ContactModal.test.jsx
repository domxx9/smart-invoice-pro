import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ContactModal } from '../components/ContactModal.jsx'

function setup({ contact, onSave, onClose } = {}) {
  const save = onSave ?? vi.fn()
  const close = onClose ?? vi.fn()
  const utils = render(<ContactModal contact={contact} onSave={save} onClose={close} />)
  return { ...utils, save, close }
}

describe('<ContactModal />', () => {
  it('renders create mode with "Add contact" heading when no contact', () => {
    setup()
    expect(screen.getByRole('dialog', { name: /Add contact/i })).toBeInTheDocument()
  })

  it('renders edit mode with "Edit contact" heading when contact has id', () => {
    setup({ contact: { id: 'c1', name: 'Ada', source: 'manual' } })
    expect(screen.getByRole('dialog', { name: /Edit contact/i })).toBeInTheDocument()
  })

  it('prefills form with contact values in edit mode', () => {
    setup({ contact: { id: 'c1', name: 'Ada', email: 'ada@x.com', source: 'manual' } })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText(/^Name/).value).toBe('Ada')
    expect(within(dialog).getByLabelText(/Email/i).value).toBe('ada@x.com')
  })

  it('calls onSave with form data when submitted with valid name', () => {
    const { save } = setup()
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Grace' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Add$/ }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Grace' }))
  })

  it('calls onClose when close button clicked', () => {
    const { close } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Close/i }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop clicked', () => {
    const { close } = setup()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(close).toHaveBeenCalledOnce()
  })

  it('calls onClose when Cancel button clicked', () => {
    const { close } = setup()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }))
    expect(close).toHaveBeenCalledOnce()
  })
})
