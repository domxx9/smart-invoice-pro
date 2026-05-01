import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useContacts } from '../useContacts.js'

const STORAGE_KEY = 'sip_contacts'

describe('useContacts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('contacts', () => {
    it('initialises from localStorage', () => {
      const stored = [{ id: 'c1', name: 'Alice', createdAt: '2024-01-01T00:00:00.000Z' }]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      const { result } = renderHook(() => useContacts())
      expect(result.current.contacts[0]).toMatchObject(stored[0])
    })

    it('initialises to empty array when localStorage is empty', () => {
      const { result } = renderHook(() => useContacts())
      expect(result.current.contacts).toEqual([])
    })

    it('survives malformed localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json')
      const { result } = renderHook(() => useContacts())
      expect(result.current.contacts).toEqual([])
    })
  })

  describe('addContact', () => {
    it('adds contact with generated id and createdAt', () => {
      const { result } = renderHook(() => useContacts())
      let contact
      act(() => {
        contact = result.current.addContact({ name: 'Bob' })
      })
      expect(contact.id).toBeTruthy()
      expect(contact.createdAt).toBeTruthy()
      expect(result.current.contacts).toContainEqual(contact)
    })

    it('returns the newly created contact', () => {
      const { result } = renderHook(() => useContacts())
      const incoming = { name: 'Carol', email: 'carol@example.com' }
      let created
      act(() => {
        created = result.current.addContact(incoming)
      })
      expect(created.name).toBe('Carol')
      expect(created.email).toBe('carol@example.com')
    })

    it('persists to localStorage', () => {
      const { result } = renderHook(() => useContacts())
      act(() => {
        result.current.addContact({ name: 'Dave' })
      })
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
      expect(stored).toHaveLength(1)
      expect(stored[0].name).toBe('Dave')
    })
  })

  describe('updateContact', () => {
    it('merges patch data onto existing contact', () => {
      const { result } = renderHook(() => useContacts())
      const original = result.current.addContact({ name: 'Eve', email: 'eve@old.com' })
      act(() => {
        result.current.updateContact(original.id, { email: 'eve@new.com' })
      })
      const updated = result.current.getContact(original.id)
      expect(updated.email).toBe('eve@new.com')
      expect(updated.name).toBe('Eve')
    })

    it('does nothing when id does not exist', () => {
      const { result } = renderHook(() => useContacts())
      result.current.addContact({ name: 'Frank' })
      act(() => {
        result.current.updateContact('nonexistent-id', { name: 'Hacker' })
      })
      expect(result.current.contacts).toHaveLength(1)
      expect(result.current.contacts[0].name).toBe('Frank')
    })

    it('persists updated contacts to localStorage', () => {
      const { result } = renderHook(() => useContacts())
      const original = result.current.addContact({ name: 'Grace', business: 'Acme' })
      act(() => {
        result.current.updateContact(original.id, { business: 'Acme Ltd' })
      })
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
      const found = stored.find((c) => c.id === original.id)
      expect(found.businessName).toBe('Acme Ltd')
    })
  })

  describe('deleteContact', () => {
    it('removes contact by id', () => {
      const { result } = renderHook(() => useContacts())
      const target = result.current.addContact({ name: 'Heidi' })
      act(() => {
        result.current.deleteContact(target.id)
      })
      expect(result.current.contacts).toHaveLength(0)
    })

    it('silently ignores nonexistent id', () => {
      const { result } = renderHook(() => useContacts())
      result.current.addContact({ name: 'Ivan' })
      act(() => {
        result.current.deleteContact('nonexistent-id')
      })
      expect(result.current.contacts).toHaveLength(1)
    })

    it('persists after deletion', () => {
      const { result } = renderHook(() => useContacts())
      const target = result.current.addContact({ name: 'Judith' })
      act(() => {
        result.current.deleteContact(target.id)
      })
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
      expect(stored.find((c) => c.id === target.id)).toBeUndefined()
    })
  })

  describe('getContact', () => {
    it('returns contact by id', () => {
      const { result } = renderHook(() => useContacts())
      let created
      act(() => {
        created = result.current.addContact({ name: 'Karl' })
      })
      expect(result.current.getContact(created.id)).toEqual(created)
    })

    it('returns null when not found', () => {
      const { result } = renderHook(() => useContacts())
      expect(result.current.getContact('nonexistent-id')).toBeNull()
    })
  })
})
