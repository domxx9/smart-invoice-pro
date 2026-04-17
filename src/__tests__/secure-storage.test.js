import { describe, it, expect, beforeEach } from 'vitest'
import {
  setSecret,
  getSecret,
  deleteSecret,
  migrateKeysFromLocalStorage,
} from '../secure-storage.js'

// JSDOM provides localStorage/sessionStorage; no Capacitor → web fallback path.

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('secure-storage (web fallback)', () => {
  it('round-trips values through sessionStorage', async () => {
    await setSecret('sip_byok_openai', 'sk-test')
    expect(sessionStorage.getItem('sip_byok_openai')).toBe('sk-test')
    expect(await getSecret('sip_byok_openai')).toBe('sk-test')
  })

  it('returns empty string for a missing key', async () => {
    expect(await getSecret('missing')).toBe('')
  })

  it('removes secrets', async () => {
    await setSecret('k', 'v')
    await deleteSecret('k')
    expect(await getSecret('k')).toBe('')
  })
})

describe('migrateKeysFromLocalStorage', () => {
  it('moves sqApiKey from sip_settings blob into secure storage', async () => {
    localStorage.setItem(
      'sip_settings',
      JSON.stringify({ currency: 'GBP', sqApiKey: 'sq-old-key' }),
    )
    await migrateKeysFromLocalStorage()
    const settings = JSON.parse(localStorage.getItem('sip_settings'))
    expect(settings.sqApiKey).toBeUndefined()
    expect(await getSecret('sip_sqApiKey')).toBe('sq-old-key')
  })

  it('migrates BYOK provider keys from localStorage', async () => {
    localStorage.setItem('sip_byok_openai', 'sk-legacy')
    await migrateKeysFromLocalStorage()
    expect(localStorage.getItem('sip_byok_openai')).toBeNull()
    expect(await getSecret('sip_byok_openai')).toBe('sk-legacy')
  })

  it('no-ops when nothing needs migrating', async () => {
    await migrateKeysFromLocalStorage()
    expect(localStorage.getItem('sip_settings')).toBeNull()
  })
})
