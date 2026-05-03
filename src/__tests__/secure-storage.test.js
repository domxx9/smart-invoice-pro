import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('secure-storage (web fallback)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.resetModules()
  })

  it('round-trips values through sessionStorage', async () => {
    const { setSecret, getSecret } = await import('../secure-storage.js')
    await setSecret('sip_byok_openai', 'sk-test')
    expect(sessionStorage.getItem('sip_byok_openai')).toBe('sk-test')
    expect(await getSecret('sip_byok_openai')).toBe('sk-test')
  })

  it('returns empty string for a missing key', async () => {
    const { getSecret } = await import('../secure-storage.js')
    expect(await getSecret('missing')).toBe('')
  })

  it('removes secrets', async () => {
    const { setSecret, getSecret, deleteSecret } = await import('../secure-storage.js')
    await setSecret('k', 'v')
    await deleteSecret('k')
    expect(await getSecret('k')).toBe('')
  })
})

describe('secure-storage (native Android path)', () => {
  const mockPlugin = {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
  }

  beforeEach(() => {
    mockPlugin.set.mockReset()
    mockPlugin.get.mockReset()
    mockPlugin.remove.mockReset()
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true })
    vi.resetModules()
  })

  afterEach(() => {
    vi.unmock('capacitor-secure-storage-plugin')
    vi.resetModules()
  })

  it('setSecret calls plugin.set', async () => {
    mockPlugin.set.mockResolvedValue({ key: 'k', value: 'v' })
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: mockPlugin,
    }))
    const { setSecret } = await import('../secure-storage.js')
    await setSecret('k', 'v')
    expect(mockPlugin.set).toHaveBeenCalledWith({ key: 'k', value: 'v' })
  })

  it('getSecret returns value from plugin.get', async () => {
    mockPlugin.get.mockResolvedValue({ value: 'my-secret' })
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: mockPlugin,
    }))
    const { getSecret } = await import('../secure-storage.js')
    const result = await getSecret('k')
    expect(result).toBe('my-secret')
  })

  it('getSecret returns empty string on plugin error', async () => {
    mockPlugin.get.mockRejectedValue(new Error('not found'))
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: mockPlugin,
    }))
    const { getSecret } = await import('../secure-storage.js')
    const result = await getSecret('missing')
    expect(result).toBe('')
  })

  it('deleteSecret calls plugin.remove', async () => {
    mockPlugin.remove.mockResolvedValue({ key: 'k' })
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: mockPlugin,
    }))
    const { deleteSecret } = await import('../secure-storage.js')
    await expect(deleteSecret('k')).resolves.not.toThrow()
    expect(mockPlugin.remove).toHaveBeenCalledWith({ key: 'k' })
  })

  it('deleteSecret swallows plugin error for missing key', async () => {
    mockPlugin.remove.mockRejectedValue(new Error('key not found'))
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: mockPlugin,
    }))
    const { deleteSecret } = await import('../secure-storage.js')
    await expect(deleteSecret('missing')).resolves.not.toThrow()
    expect(mockPlugin.remove).toHaveBeenCalledWith({ key: 'missing' })
  })

  it('getPlugin does not invoke .then on SecureStoragePlugin', async () => {
    const brokenPlugin = {
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      then: vi.fn(),
    }
    vi.doMock('capacitor-secure-storage-plugin', () => ({
      SecureStoragePlugin: brokenPlugin,
    }))
    const { setSecret, getSecret, deleteSecret } = await import('../secure-storage.js')
    await setSecret('k', 'v')
    expect(brokenPlugin.then).not.toHaveBeenCalled()
    await getSecret('k')
    expect(brokenPlugin.then).not.toHaveBeenCalled()
    await deleteSecret('k')
    expect(brokenPlugin.then).not.toHaveBeenCalled()
  })
})

describe('migrateKeysFromLocalStorage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false })
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('moves sqApiKey from sip_settings blob into secure storage', async () => {
    const { getSecret } = await import('../secure-storage.js')
    localStorage.setItem(
      'sip_settings',
      JSON.stringify({ currency: 'GBP', sqApiKey: 'sq-old-key' }),
    )
    const { migrateKeysFromLocalStorage } = await import('../secure-storage.js')
    await migrateKeysFromLocalStorage()
    const settings = JSON.parse(localStorage.getItem('sip_settings'))
    expect(settings.sqApiKey).toBeUndefined()
    expect(await getSecret('sip_sqApiKey')).toBe('sq-old-key')
  })

  it('migrates BYOK provider keys from localStorage', async () => {
    const { getSecret } = await import('../secure-storage.js')
    localStorage.setItem('sip_byok_openai', 'sk-legacy')
    const { migrateKeysFromLocalStorage } = await import('../secure-storage.js')
    await migrateKeysFromLocalStorage()
    expect(localStorage.getItem('sip_byok_openai')).toBeNull()
    expect(await getSecret('sip_byok_openai')).toBe('sk-legacy')
  })

  it('no-ops when nothing needs migrating', async () => {
    const { migrateKeysFromLocalStorage } = await import('../secure-storage.js')
    await migrateKeysFromLocalStorage()
    expect(localStorage.getItem('sip_settings')).toBeNull()
  })
})
