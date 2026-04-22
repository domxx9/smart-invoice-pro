import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContactSelector } from '../ContactSelector.jsx'

const makeContact = (overrides = {}) => ({
  id: 'c1',
  name: 'Jane Smith',
  email: 'jane@example.com',
  business: 'Acme Corp',
  ...overrides,
})

describe('ContactSelector', () => {
  const contacts = [
    makeContact({ id: 'c1', name: 'Jane Smith', email: 'jane@example.com' }),
    makeContact({ id: 'c2', name: 'Bob Jones', email: 'bob@example.com', business: 'BizCorp' }),
    makeContact({ id: 'c3', name: 'Alice Wong', email: 'alice@example.com' }),
  ]

  it('renders all contacts in dropdown when search is focused', () => {
    render(
      <ContactSelector
        contacts={contacts}
        selectedIds={[]}
        onChange={vi.fn()}
        onOpenModal={vi.fn()}
      />,
    )
    fireEvent.focus(screen.getByPlaceholderText('Search contacts...'))
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    expect(screen.getByText('Alice Wong')).toBeInTheDocument()
  })

  it('shows "+ Create new contact" as first option', () => {
    render(
      <ContactSelector
        contacts={contacts}
        selectedIds={[]}
        onChange={vi.fn()}
        onOpenModal={vi.fn()}
      />,
    )
    fireEvent.focus(screen.getByPlaceholderText('Search contacts...'))
    expect(screen.getByText('+ Create new contact')).toBeInTheDocument()
  })

  it('filters contacts by name on search', () => {
    render(
      <ContactSelector
        contacts={contacts}
        selectedIds={[]}
        onChange={vi.fn()}
        onOpenModal={vi.fn()}
      />,
    )
    fireEvent.focus(screen.getByPlaceholderText('Search contacts...'))
    fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
      target: { value: 'Jane' },
    })
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument()
  })

  it('filters contacts by email on search', () => {
    render(
      <ContactSelector
        contacts={contacts}
        selectedIds={[]}
        onChange={vi.fn()}
        onOpenModal={vi.fn()}
      />,
    )
    fireEvent.focus(screen.getByPlaceholderText('Search contacts...'))
    fireEvent.change(screen.getByPlaceholderText('Search contacts...'), {
      target: { value: 'bob@example' },
    })
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument()
  })

  it('calls onChange with new id when a contact is selected', () => {
    const onChange = vi.fn()
    render(
      <ContactSelector
        contacts={contacts}
        selectedIds={[]}
        onChange={onChange}
        onOpenModal={vi.fn()}
      />,
    )
    fireEvent.focus(screen.getByPlaceholderText('Search contacts...'))
    fireEvent.mouseDown(screen.getByText('Jane Smith'))
    expect(onChange).toHaveBeenCalledWith(['c1'])
  })

  it('calls onChange with new id added when unselected contact is clicked', () => {
    const onChange = vi.fn()
    render(
      <ContactSelector
        contacts={contacts}
        selectedIds={['c1']}
        onChange={onChange}
        onOpenModal={vi.fn()}
      />,
    )
    fireEvent.focus(screen.getByPlaceholderText('Search contacts...'))
    const bobOption = screen.getAllByText('Bob Jones')[0]
    fireEvent.mouseDown(bobOption)
    expect(onChange).toHaveBeenCalledWith(['c1', 'c2'])
  })

  it('renders selected contacts as removable chips', () => {
    const onChange = vi.fn()
    render(
      <ContactSelector
        contacts={contacts}
        selectedIds={['c1', 'c2']}
        onChange={onChange}
        onOpenModal={vi.fn()}
      />,
    )
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()
    expect(screen.getByText('Bob Jones')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Remove Jane Smith'))
    expect(onChange).toHaveBeenCalledWith(['c2'])
  })

  it('calls onOpenModal(null) when "+ Create new contact" is clicked', () => {
    const onOpenModal = vi.fn()
    render(
      <ContactSelector
        contacts={contacts}
        selectedIds={[]}
        onChange={vi.fn()}
        onOpenModal={onOpenModal}
      />,
    )
    fireEvent.focus(screen.getByPlaceholderText('Search contacts...'))
    fireEvent.mouseDown(screen.getByText('+ Create new contact'))
    expect(onOpenModal).toHaveBeenCalledWith(null)
  })

  it('calls onOpenModal with contact when a chip is clicked', () => {
    const onOpenModal = vi.fn()
    const { rerender } = render(
      <ContactSelector
        contacts={contacts}
        selectedIds={['c1']}
        onChange={vi.fn()}
        onOpenModal={onOpenModal}
      />,
    )
    rerender(
      <ContactSelector
        contacts={contacts}
        selectedIds={['c1']}
        onChange={vi.fn()}
        onOpenModal={onOpenModal}
      />,
    )
    fireEvent.click(screen.getByText('Jane Smith'))
    expect(onOpenModal).toHaveBeenCalledWith(contacts[0])
  })
})
