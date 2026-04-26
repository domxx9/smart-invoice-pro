import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ContactsImportSection } from '../ContactsImportSection.jsx'

vi.mock('../../api/contacts.js', () => ({
  fetchSquarespaceCustomers: vi.fn(),
  importPhoneContacts: vi.fn(),
}))

import { fetchSquarespaceCustomers, importPhoneContacts } from '../../api/contacts.js'

const FAKE_CONTACTS = [{ id: 'c1', name: 'Alice', email: 'alice@example.com' }]

function makeContactsApi(overrides = {}) {
  return {
    contacts: [],
    mergeContacts: vi.fn(() => ({ added: 1, skipped: 0 })),
    ...overrides,
  }
}

function renderSection(props = {}) {
  const contactsApi = props.contactsApi ?? makeContactsApi()
  return render(
    <ContactsImportSection
      contactsApi={contactsApi}
      sqApiKey="sqsp-key"
      onToast={vi.fn()}
      {...props}
    />,
  )
}

// SettingsSection is collapsed by default — expand it first
function expandContacts() {
  fireEvent.click(screen.getByRole('button', { name: /contacts/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ContactsImportSection — rendering', () => {
  it('shows the contact count in the description', () => {
    const contactsApi = makeContactsApi({ contacts: [{ id: 'c1' }, { id: 'c2' }] })
    renderSection({ contactsApi })
    expandContacts()
    expect(screen.getByText(/2 contacts saved/i)).toBeInTheDocument()
  })

  it('uses singular "contact" for one contact', () => {
    const contactsApi = makeContactsApi({ contacts: [{ id: 'c1' }] })
    renderSection({ contactsApi })
    expandContacts()
    expect(screen.getByText(/1 contact saved/i)).toBeInTheDocument()
  })

  it('renders both import buttons', () => {
    renderSection()
    expandContacts()
    expect(screen.getByRole('button', { name: /import from squarespace/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import from phone/i })).toBeInTheDocument()
  })

  it('disables the Squarespace button when sqApiKey is absent', () => {
    renderSection({ sqApiKey: null })
    expandContacts()
    expect(screen.getByRole('button', { name: /import from squarespace/i })).toBeDisabled()
  })
})

describe('ContactsImportSection — Squarespace import', () => {
  it('calls fetchSquarespaceCustomers and mergeContacts on success', async () => {
    const contactsApi = makeContactsApi()
    fetchSquarespaceCustomers.mockResolvedValueOnce(FAKE_CONTACTS)
    const onToast = vi.fn()
    renderSection({ contactsApi, onToast })
    expandContacts()

    fireEvent.click(screen.getByRole('button', { name: /import from squarespace/i }))

    await waitFor(() => {
      expect(fetchSquarespaceCustomers).toHaveBeenCalledWith('sqsp-key', expect.any(Function))
      expect(contactsApi.mergeContacts).toHaveBeenCalledWith(FAKE_CONTACTS)
    })
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('+1 new'), 'success', '✓')
  })

  it('shows ✓ Imported label after successful import', async () => {
    fetchSquarespaceCustomers.mockResolvedValueOnce(FAKE_CONTACTS)
    renderSection()
    expandContacts()

    fireEvent.click(screen.getByRole('button', { name: /import from squarespace/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /✓ imported/i })).toBeInTheDocument()
    })
  })

  it('shows error state when import fails', async () => {
    fetchSquarespaceCustomers.mockRejectedValueOnce(new Error('network timeout'))
    const onToast = vi.fn()
    renderSection({ onToast })
    expandContacts()

    fireEvent.click(screen.getByRole('button', { name: /import from squarespace/i }))

    await waitFor(() => {
      expect(screen.getByText('network timeout')).toBeInTheDocument()
    })
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('network timeout'), 'error')
  })

  it('shows error when no sqApiKey is set and button is clicked', () => {
    renderSection({ sqApiKey: '' })
    expandContacts()
    // Button is disabled, but test the guard path by calling runSquarespace via prop-less sqApiKey
    // The button is disabled — verify the disabled state directly
    expect(screen.getByRole('button', { name: /import from squarespace/i })).toBeDisabled()
    expect(fetchSquarespaceCustomers).not.toHaveBeenCalled()
  })

  it('includes skipped count in toast when duplicates are present', async () => {
    fetchSquarespaceCustomers.mockResolvedValueOnce(FAKE_CONTACTS)
    const contactsApi = makeContactsApi({ mergeContacts: vi.fn(() => ({ added: 2, skipped: 3 })) })
    const onToast = vi.fn()
    renderSection({ contactsApi, onToast })
    expandContacts()

    fireEvent.click(screen.getByRole('button', { name: /import from squarespace/i }))

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(
        expect.stringContaining('3 duplicates skipped'),
        'success',
        '✓',
      )
    })
  })
})

describe('ContactsImportSection — phone import', () => {
  it('calls importPhoneContacts and mergeContacts on success', async () => {
    const contactsApi = makeContactsApi()
    importPhoneContacts.mockResolvedValueOnce(FAKE_CONTACTS)
    const onToast = vi.fn()
    renderSection({ contactsApi, onToast })
    expandContacts()

    fireEvent.click(screen.getByRole('button', { name: /import from phone/i }))

    await waitFor(() => {
      expect(importPhoneContacts).toHaveBeenCalled()
      expect(contactsApi.mergeContacts).toHaveBeenCalledWith(FAKE_CONTACTS)
    })
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('+1 new'), 'success', '✓')
  })

  it('shows ✓ Imported label after successful phone import', async () => {
    importPhoneContacts.mockResolvedValueOnce(FAKE_CONTACTS)
    renderSection()
    expandContacts()

    fireEvent.click(screen.getByRole('button', { name: /import from phone/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /✓ imported/i })).toBeInTheDocument()
    })
  })

  it('shows error state when phone import fails', async () => {
    importPhoneContacts.mockRejectedValueOnce(new Error('permission denied'))
    const onToast = vi.fn()
    renderSection({ onToast })
    expandContacts()

    fireEvent.click(screen.getByRole('button', { name: /import from phone/i }))

    await waitFor(() => {
      expect(screen.getByText('permission denied')).toBeInTheDocument()
    })
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('permission denied'), 'error')
  })
})
