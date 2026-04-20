import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const contactsPluginMock = {
  requestPermissions: vi.fn(),
  getContacts: vi.fn(),
}

vi.mock('@capacitor-community/contacts', () => ({
  Contacts: contactsPluginMock,
}))

beforeEach(() => {
  contactsPluginMock.requestPermissions.mockReset()
  contactsPluginMock.getContacts.mockReset()
  delete globalThis.window.Capacitor
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('importPhoneContacts', () => {
  it('maps payloads into contact records when permission granted', async () => {
    contactsPluginMock.requestPermissions.mockResolvedValue({ contacts: 'granted' })
    contactsPluginMock.getContacts.mockResolvedValue({
      contacts: [
        {
          contactId: '1',
          name: { display: 'Ada Lovelace', given: 'Ada', family: 'Lovelace' },
          emails: [{ address: 'ada@x.com', isPrimary: true }],
          phones: [{ number: '555-1', isPrimary: true }],
          urls: ['https://ada.dev'],
          postalAddresses: [{ street: '10 Downing', city: 'London', postcode: 'SW1' }],
          organization: { company: 'Analytical Eng.' },
        },
        { contactId: '2' }, // empty → filtered out
      ],
    })
    const { importPhoneContacts } = await import('../api/contacts.js')
    const contacts = await importPhoneContacts()
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@x.com',
      phone: '555-1',
      website: 'https://ada.dev',
      businessName: 'Analytical Eng.',
      address1: '10 Downing',
      city: 'London',
      postcode: 'SW1',
      source: 'phone',
    })
  })

  it('throws when permission denied', async () => {
    contactsPluginMock.requestPermissions.mockResolvedValue({ contacts: 'denied' })
    const { importPhoneContacts } = await import('../api/contacts.js')
    await expect(importPhoneContacts()).rejects.toThrow(/permission denied/i)
    expect(contactsPluginMock.getContacts).not.toHaveBeenCalled()
  })
})

describe('fetchSquarespaceCustomers', () => {
  it('requires an API key', async () => {
    const { fetchSquarespaceCustomers } = await import('../api/contacts.js')
    await expect(fetchSquarespaceCustomers('')).rejects.toThrow(/API key/)
  })

  it('paginates via cursor and maps profile fields to contact model', async () => {
    const pages = [
      {
        profiles: [
          {
            firstName: 'Ada',
            lastName: 'Lovelace',
            email: 'ada@x.com',
            billingAddress: {
              address1: '10 Downing',
              city: 'London',
              postalCode: 'SW1',
              countryCode: 'GB',
              phone: '555-1',
            },
          },
        ],
        pagination: { nextPageCursor: 'c2' },
      },
      {
        profiles: [
          {
            firstName: 'Grace',
            lastName: 'Hopper',
            email: 'grace@x.com',
            billingAddress: {},
          },
          { firstName: '', lastName: '', email: '' }, // filtered
        ],
        pagination: {},
      },
    ]
    let call = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      const data = pages[call]
      call += 1
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => data,
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const progress = vi.fn()
    const { fetchSquarespaceCustomers } = await import('../api/contacts.js')
    const contacts = await fetchSquarespaceCustomers('sq_key', progress)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/sqsp/1.0/commerce/profiles')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/sqsp/1.0/commerce/profiles?cursor=c2')
    expect(contacts).toHaveLength(2)
    expect(contacts[0]).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@x.com',
      phone: '555-1',
      address1: '10 Downing',
      city: 'London',
      postcode: 'SW1',
      country: 'GB',
      source: 'squarespace',
    })
    expect(progress).toHaveBeenCalledWith(1)
    expect(progress).toHaveBeenLastCalledWith(3)
  })

  it('throws a descriptive error on non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }),
    )
    const { fetchSquarespaceCustomers } = await import('../api/contacts.js')
    await expect(fetchSquarespaceCustomers('bad')).rejects.toThrow(/401/)
  })
})
