import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Contacts } from '../components/Contacts.jsx'

function setup(initial = []) {
  const state = { contacts: [...initial] }
  const addContact = vi.fn((c) => {
    const next = { id: `c_${state.contacts.length}`, source: 'manual', ...c }
    state.contacts = [...state.contacts, next]
    return next
  })
  const updateContact = vi.fn((id, patch) => {
    state.contacts = state.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c))
  })
  const deleteContact = vi.fn((id) => {
    state.contacts = state.contacts.filter((c) => c.id !== id)
  })
  const utils = render(
    <Contacts
      contacts={state.contacts}
      addContact={addContact}
      updateContact={updateContact}
      deleteContact={deleteContact}
    />,
  )
  return { ...utils, state, addContact, updateContact, deleteContact }
}

beforeEach(() => {
  localStorage.clear()
})

describe('<Contacts />', () => {
  it('renders empty state when no contacts', () => {
    setup([])
    expect(screen.getByText(/No contacts yet/i)).toBeInTheDocument()
  })

  it('renders a contact row with name, meta and source badge', () => {
    setup([
      {
        id: 'c1',
        name: 'Ada Lovelace',
        email: 'ada@x.com',
        source: 'manual',
      },
    ])
    const row = screen.getByRole('button', { name: /Edit Ada Lovelace/i })
    expect(within(row).getByText('Ada Lovelace')).toBeInTheDocument()
    expect(within(row).getByText('ada@x.com')).toBeInTheDocument()
    expect(within(row).getByText('manual')).toBeInTheDocument()
  })

  it('filters by search query on name, email or phone', () => {
    setup([
      { id: 'c1', name: 'Ada', email: 'ada@x.com', source: 'manual' },
      { id: 'c2', name: 'Bob', phone: '555-1', source: 'manual' },
    ])
    const search = screen.getByRole('searchbox', { name: /Search contacts/i })
    fireEvent.change(search, { target: { value: 'bob' } })
    expect(screen.queryByRole('button', { name: /Edit Ada/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit Bob/i })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: '555' } })
    expect(screen.getByRole('button', { name: /Edit Bob/i })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText(/No contacts match your search/i)).toBeInTheDocument()
  })

  it('opens add dialog and calls addContact with name (required)', () => {
    const { addContact } = setup([])
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }))
    const dialog = screen.getByRole('dialog', { name: /Add contact/i })
    const name = within(dialog).getByLabelText(/^Name/)
    fireEvent.change(name, { target: { value: 'Grace' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Add$/ }))
    expect(addContact).toHaveBeenCalledWith(expect.objectContaining({ name: 'Grace' }))
  })

  it('opens edit dialog with prefilled values on row tap', () => {
    setup([{ id: 'c1', name: 'Ada', email: 'ada@x.com', source: 'manual' }])
    fireEvent.click(screen.getByRole('button', { name: /Edit Ada/i }))
    const dialog = screen.getByRole('dialog', { name: /Edit contact/i })
    expect(within(dialog).getByLabelText(/^Name/).value).toBe('Ada')
    expect(within(dialog).getByLabelText(/Email/i).value).toBe('ada@x.com')
  })
})
