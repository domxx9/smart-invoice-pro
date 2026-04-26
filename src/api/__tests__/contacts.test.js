import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchSquarespaceCustomers } from '../contacts.js'

// Ensure browser path (no native Capacitor)
beforeEach(() => {
  if (typeof window !== 'undefined') window.Capacitor = undefined
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockFetchSequence(responses) {
  let i = 0
  return vi.fn(async (url) => {
    const spec = responses[i++]
    if (!spec) throw new Error(`Unexpected fetch call #${i} to ${url}`)
    return {
      ok: spec.status ? spec.status < 400 : true,
      status: spec.status ?? 200,
      statusText: spec.statusText ?? 'OK',
      json: async () => spec.body,
    }
  })
}

const API_KEY = 'test-sqsp-key'

function makeProfile(overrides = {}) {
  return {
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    billingAddress: {
      phone: '555-1234',
      address1: '10 Elm St',
      address2: '',
      city: 'Springfield',
      postalCode: '12345',
      countryCode: 'US',
    },
    ...overrides,
  }
}

describe('fetchSquarespaceCustomers — browser path', () => {
  it('returns mapped contacts for a single-page response', async () => {
    globalThis.fetch = mockFetchSequence([{ body: { profiles: [makeProfile()], pagination: {} } }])

    const contacts = await fetchSquarespaceCustomers(API_KEY)
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toMatchObject({
      name: 'Alice Smith',
      email: 'alice@example.com',
      phone: '555-1234',
      address1: '10 Elm St',
      city: 'Springfield',
      postcode: '12345',
      country: 'US',
      source: 'squarespace',
    })
  })

  it('follows pagination cursors until exhausted', async () => {
    globalThis.fetch = mockFetchSequence([
      { body: { profiles: [makeProfile()], pagination: { nextPageCursor: 'cur-1' } } },
      {
        body: {
          profiles: [
            makeProfile({ email: 'bob@example.com', firstName: 'Bob', lastName: 'Jones' }),
          ],
          pagination: {},
        },
      },
    ])

    const contacts = await fetchSquarespaceCustomers(API_KEY)
    expect(contacts).toHaveLength(2)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(globalThis.fetch.mock.calls[1][0]).toContain('cursor=cur-1')
  })

  it('calls onProgress with running total after each page', async () => {
    globalThis.fetch = mockFetchSequence([
      { body: { profiles: [makeProfile(), makeProfile({ email: 'b@b.com' })], pagination: {} } },
    ])

    const onProgress = vi.fn()
    await fetchSquarespaceCustomers(API_KEY, onProgress)
    expect(onProgress).toHaveBeenCalledWith(2)
  })

  it('throws when API key is missing', async () => {
    await expect(fetchSquarespaceCustomers('')).rejects.toThrow('Squarespace API key required')
  })

  it('throws on non-OK HTTP response', async () => {
    globalThis.fetch = mockFetchSequence([{ status: 403, statusText: 'Forbidden', body: {} }])
    await expect(fetchSquarespaceCustomers(API_KEY)).rejects.toThrow('Squarespace Profiles API 403')
  })

  it('returns empty array when profiles and result fields are both absent', async () => {
    // The code uses ?? [] as final fallback — unrecognised shapes degrade gracefully
    globalThis.fetch = mockFetchSequence([{ body: { data: 'unrecognised' } }])
    const contacts = await fetchSquarespaceCustomers(API_KEY)
    expect(contacts).toEqual([])
  })

  it('falls back to data.result when data.profiles is absent', async () => {
    globalThis.fetch = mockFetchSequence([{ body: { result: [makeProfile()], pagination: {} } }])
    const contacts = await fetchSquarespaceCustomers(API_KEY)
    expect(contacts).toHaveLength(1)
  })

  it('filters out profiles with no name and no email', async () => {
    const empty = { firstName: '', lastName: '', email: '', phone: '', billingAddress: {} }
    const valid = makeProfile()
    globalThis.fetch = mockFetchSequence([{ body: { profiles: [empty, valid], pagination: {} } }])
    const contacts = await fetchSquarespaceCustomers(API_KEY)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].name).toBe('Alice Smith')
  })

  it('falls back to billingAddress name when firstName/lastName absent', async () => {
    const profile = {
      firstName: '',
      lastName: '',
      email: 'x@x.com',
      billingAddress: { firstName: 'Billing', lastName: 'Name', postalCode: '', countryCode: '' },
    }
    globalThis.fetch = mockFetchSequence([{ body: { profiles: [profile], pagination: {} } }])
    const contacts = await fetchSquarespaceCustomers(API_KEY)
    expect(contacts[0].name).toBe('Billing Name')
  })

  it('falls back to email as name when no name fields present', async () => {
    const profile = {
      firstName: '',
      lastName: '',
      email: 'fallback@example.com',
      billingAddress: {},
    }
    globalThis.fetch = mockFetchSequence([{ body: { profiles: [profile], pagination: {} } }])
    const contacts = await fetchSquarespaceCustomers(API_KEY)
    expect(contacts[0].name).toBe('fallback@example.com')
  })
})
