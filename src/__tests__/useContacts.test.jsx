import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useContacts, normaliseContact, makeContactId } from '../hooks/useContacts.js'

beforeEach(() => {
  localStorage.clear()
})

describe('normaliseContact', () => {
  it('fills defaults, trims strings, and assigns an id + createdAt', () => {
    const c = normaliseContact({ name: '  Ada  ', email: ' ada@example.com ' })
    expect(c.id).toMatch(/^contact_/)
    expect(c.name).toBe('Ada')
    expect(c.email).toBe('ada@example.com')
    expect(c.source).toBe('manual')
    expect(typeof c.createdAt).toBe('string')
  })

  it('keeps existing id and createdAt when present', () => {
    const c = normaliseContact({ id: 'x', name: 'A', createdAt: '2026-01-01' })
    expect(c.id).toBe('x')
    expect(c.createdAt).toBe('2026-01-01')
  })
})

describe('useContacts', () => {
  it('starts empty and persists adds to localStorage', () => {
    const { result } = renderHook(() => useContacts())
    expect(result.current.contacts).toEqual([])

    let created
    act(() => {
      created = result.current.addContact({ name: 'Alice', email: 'a@x.com' })
    })
    expect(result.current.contacts).toHaveLength(1)
    expect(result.current.contacts[0].id).toBe(created.id)

    const raw = JSON.parse(localStorage.getItem('sip_contacts'))
    expect(raw).toHaveLength(1)
    expect(raw[0].email).toBe('a@x.com')
  })

  it('hydrates existing contacts from localStorage on mount', () => {
    localStorage.setItem(
      'sip_contacts',
      JSON.stringify([{ id: 'c1', name: 'Bob', email: 'b@x.com', source: 'manual' }]),
    )
    const { result } = renderHook(() => useContacts())
    expect(result.current.contacts).toHaveLength(1)
    expect(result.current.contacts[0].name).toBe('Bob')
  })

  it('updates a contact and persists the patch', () => {
    const { result } = renderHook(() => useContacts())
    let id
    act(() => {
      id = result.current.addContact({ name: 'A' }).id
    })
    act(() => {
      result.current.updateContact(id, { name: 'A2', phone: '555' })
    })
    expect(result.current.contacts[0].name).toBe('A2')
    expect(result.current.contacts[0].phone).toBe('555')
    const raw = JSON.parse(localStorage.getItem('sip_contacts'))
    expect(raw[0].name).toBe('A2')
  })

  it('deletes a contact and persists the remaining list', () => {
    const { result } = renderHook(() => useContacts())
    let idA, idB
    act(() => {
      idA = result.current.addContact({ name: 'A' }).id
      idB = result.current.addContact({ name: 'B' }).id
    })
    act(() => {
      result.current.deleteContact(idA)
    })
    expect(result.current.contacts).toHaveLength(1)
    expect(result.current.contacts[0].id).toBe(idB)
    const raw = JSON.parse(localStorage.getItem('sip_contacts'))
    expect(raw).toHaveLength(1)
  })

  it('mergeContacts dedupes by email then phone then name and returns counts', () => {
    const { result } = renderHook(() => useContacts())
    act(() => {
      result.current.addContact({ name: 'Ada', email: 'ada@x.com' })
    })
    let stats
    act(() => {
      stats = result.current.mergeContacts([
        { name: 'Ada Lovelace', email: 'ada@x.com' }, // dup by email
        { name: 'Grace', phone: '555-1' },
        { name: 'Grace Hopper', phone: '555-1' }, // dup by phone
        { name: 'Linus' }, // unique by name
        { name: 'Linus' }, // dup by name
        { name: '', email: '', phone: '' }, // empty → skipped
      ])
    })
    expect(stats).toEqual({ added: 2, skipped: 4 })
    expect(result.current.contacts).toHaveLength(3)
  })

  it('mergeContacts with no input returns zero counts and does not mutate', () => {
    const { result } = renderHook(() => useContacts())
    let stats
    act(() => {
      stats = result.current.mergeContacts([])
    })
    expect(stats).toEqual({ added: 0, skipped: 0 })
    expect(result.current.contacts).toEqual([])
  })
})

describe('makeContactId', () => {
  it('produces unique ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => makeContactId()))
    expect(ids.size).toBe(20)
  })
})
