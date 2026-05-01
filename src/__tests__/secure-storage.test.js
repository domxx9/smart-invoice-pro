import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setSecret,
  getSecret,
  deleteSecret,
  migrateKeysFromLocalStorage,
} from '../secure-storage.js'

describe('secure-storage (web fallback)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

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

describe('secure-storage (native Android path — thenable mock)', () => {
  const mockPlugin = {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
  }

  beforeEach(async () => {
    mockPlugin.set.mockReset()
    mockPlugin.get.mockReset()
    mockPlugin.remove.mockReset()
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true })
    vi.doMock('capacitor-secure-storage-plugin', async () => ({
      SecureStoragePlugin: mockPlugin,
    }))
  })

  afterEach(() => {
    vi.unmock('capacitor-secure-storage-plugin')
    vi.resetModules()
  })

  it('setSecret resolves thenable returned by Android plugin', async () => {
    mockPlugin.set.mockResolvedValue({ key: 'k', value: 'v' })
    const mod = await import('../secure-storage.js')
    await mod.setSecret('k', 'v')
    expect(mockPlugin.set).toHaveBeenCalledWith({ key: 'k', value: 'v' })
  })

  it('getSecret resolves thenable returned by Android plugin', async () => {
    mockPlugin.get.mockResolvedValue({ value: 'my-secret' })
    const mod = await import('../secure-storage.js')
    const result = await mod.getSecret('k')
    expect(result).toBe('my-secret')
  })

  it('getSecret returns empty string on plugin error', async () => {
    mockPlugin.get.mockRejectedValue(new Error('not found'))
    const mod = await import('../secure-storage.js')
    const result = await mod.getSecret('missing')
    expect(result).toBe('')
  })

  it('deleteSecret resolves thenable returned by Android plugin', async () => {
    mockPlugin.remove.mockResolvedValue({ key: 'k' })
    const mod = await import('../secure-storage.js')
    await expect(mod.deleteSecret('k')).resolves.not.toThrow()
    expect(mockPlugin.remove).toHaveBeenCalledWith({ key: 'k' })
  })

  it('deleteSecret swallows plugin error for missing key', async () => {
    mockPlugin.remove.mockRejectedValue(new Error('key not found'))
    const mod = await import('../secure-storage.js')
    await expect(mod.deleteSecret('missing')).resolves.not.toThrow()
  })
})

describe('migrateKeysFromLocalStorage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

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
