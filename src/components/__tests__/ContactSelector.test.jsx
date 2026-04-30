import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ContactSelector } from '../ContactSelector.jsx'

vi.mock('./Icon', () => ({
  Icon: ({ name }) => <span data-testid={`icon-${name}`} />,
}))

const contacts = [
  {
    id: 'c1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    business: 'Analytical Engine Ltd',
    source: 'manual',
  },
  {
    id: 'c2',
    name: 'Grace Hopper',
    email: 'grace@example.com',
    business: 'COBOL Corp',
    source: 'manual',
  },
  { id: 'c3', name: 'Alan Turing', email: 'alan@example.com', business: '', source: 'manual' },
]

function setup({
  contacts: cs = contacts,
  selectedIds = [],
  onChange = vi.fn(),
  onOpenModal = vi.fn(),
} = {}) {
  const utils = render(
    <ContactSelector
      contacts={cs}
      selectedIds={selectedIds}
      onChange={onChange}
      onOpenModal={onOpenModal}
    />,
  )
  return { ...utils, onChange, onOpenModal }
}

describe('<ContactSelector />', () => {
  it('renders selected contacts as removable chips', () => {
    setup({ selectedIds: ['c1', 'c2'] })
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument()
  })

  it('renders a search input', () => {
    setup()
    expect(screen.getByPlaceholderText('Search contacts...')).toBeInTheDocument()
  })

  it('filters contact list by name as user types', () => {
    setup()
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'Grace' } })
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
    expect(screen.queryByText('Alan Turing')).not.toBeInTheDocument()
  })

  it('filters contact list by email as user types', () => {
    setup()
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'ada@example' } })
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByText('Grace Hopper')).not.toBeInTheDocument()
  })

  it('filters contact list by business name as user types', () => {
    setup()
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'COBOL' } })
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })

  it('calls onChange with new id when a contact is selected', () => {
    const { onChange } = setup()
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'Alan' } })
    fireEvent.click(screen.getByText('Alan Turing'))
    expect(onChange).toHaveBeenCalledWith(['c3'])
  })

  it('clears search term after selecting a contact', () => {
    setup()
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'Alan' } })
    fireEvent.click(screen.getByText('Alan Turing'))
    expect(input.value).toBe('')
  })

  it('calls onChange without the removed id when a chip remove button is clicked', () => {
    const { onChange } = setup({ selectedIds: ['c1', 'c2'] })
    const removeBtn = screen.getByRole('button', { name: /Remove Ada Lovelace/i })
    fireEvent.click(removeBtn)
    expect(onChange).toHaveBeenCalledWith(['c2'])
  })

  it('shows "+ Create new contact" option in dropdown when search term is present', () => {
    setup()
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'New' } })
    expect(screen.getByText('+ Create new contact')).toBeInTheDocument()
  })

  it('calls onOpenModal with undefined when "+ Create new contact" is clicked', () => {
    const { onOpenModal } = setup()
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'New' } })
    fireEvent.click(screen.getByText('+ Create new contact'))
    expect(onOpenModal).toHaveBeenCalledWith(undefined)
  })

  it('shows "+ Create new contact" as the first option in the dropdown', () => {
    setup()
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'xyz' } })
    const items = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(items[0]).toHaveTextContent('+ Create new contact')
  })

  it('does not show already-selected contacts in the dropdown', () => {
    setup({ selectedIds: ['c1'] })
    const input = screen.getByPlaceholderText('Search contacts...')
    fireEvent.change(input, { target: { value: 'grace' } })
    const dropdown = screen.getByRole('listbox')
    expect(within(dropdown).queryByText('Grace Hopper')).toBeInTheDocument()
    expect(within(dropdown).queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })
})
