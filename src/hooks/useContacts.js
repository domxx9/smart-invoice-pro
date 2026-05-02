import { useCallback, useRef, useState } from 'react'
import { STORAGE_KEYS } from '../constants/storageKeys.js'
import { logger } from '../utils/logger.js'

const STORAGE_KEY = STORAGE_KEYS.SIP_CONTACTS

export function makeContactId() {
  return `contact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function normaliseContact(input = {}) {
  const now = new Date().toISOString()
  return {
    id: input.id || makeContactId(),
    name: (input.name || '').trim(),
    email: (input.email || '').trim(),
    phone: (input.phone || '').trim(),
    website: (input.website || '').trim(),
    businessName: (input.businessName || '').trim(),
    address1: (input.address1 || '').trim(),
    address2: (input.address2 || '').trim(),
    city: (input.city || '').trim(),
    postcode: (input.postcode || '').trim(),
    country: (input.country || '').trim(),
    source: input.source || 'manual',
    createdAt: input.createdAt || now,
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normaliseContact) : []
  } catch (err) {
    logger.warn('contacts', `failed to read ${STORAGE_KEY}: ${err?.message ?? err}`)
    return []
  }
}

function persist(contacts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
}

function dedupeKey(c) {
  if (c.email) return `e:${c.email.toLowerCase()}`
  if (c.phone) return `p:${c.phone.replace(/\s+/g, '')}`
  if (c.name) return `n:${c.name.toLowerCase()}`
  return `i:${c.id}`
}

export function useContacts() {
  const [contacts, setContacts] = useState(load)
  const ref = useRef(contacts)
  ref.current = contacts

  const commit = useCallback((next) => {
    ref.current = next
    persist(next)
    setContacts(next)
  }, [])

  const addContact = useCallback(
    (input) => {
      const next = normaliseContact(input)
      commit([...ref.current, next])
      return next
    },
    [commit],
  )

  const updateContact = useCallback(
    (id, patch) => {
      const normalisedPatch = { ...patch }
      if (patch.business !== undefined) {
        normalisedPatch.businessName = patch.business
        delete normalisedPatch.business
      }
      commit(
        ref.current.map((c) =>
          c.id === id ? normaliseContact({ ...c, ...normalisedPatch, id }) : c,
        ),
      )
    },
    [commit],
  )

  const deleteContact = useCallback(
    (id) => {
      commit(ref.current.filter((c) => c.id !== id))
    },
    [commit],
  )

  const mergeContacts = useCallback(
    (incoming) => {
      if (!incoming?.length) return { added: 0, skipped: 0 }
      const seen = new Map(ref.current.map((c) => [dedupeKey(c), c]))
      let added = 0
      let skipped = 0
      incoming.forEach((raw) => {
        const c = normaliseContact(raw)
        if (!c.name && !c.email && !c.phone) {
          skipped += 1
          return
        }
        const key = dedupeKey(c)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.set(key, c)
        added += 1
      })
      commit(Array.from(seen.values()))
      return { added, skipped }
    },
    [commit],
  )

  const getContact = useCallback((id) => ref.current.find((c) => c.id === id) ?? null, [])

  return { contacts, addContact, updateContact, deleteContact, mergeContacts, getContact }
}
