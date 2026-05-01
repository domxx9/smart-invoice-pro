/**
 * Secure storage wrapper for API keys.
 *
 * Native (Android/iOS): uses capacitor-secure-storage-plugin
 *   → Android Keystore / iOS Keychain
 * Web/PWA: falls back to sessionStorage
 *   → keys cleared on tab close (acceptable trade-off)
 */

const isNative = () => !!window.Capacitor?.isNativePlatform?.()

let _plugin = null
async function getPlugin() {
  if (_plugin) return _plugin
  const mod = await import('capacitor-secure-storage-plugin')
  _plugin = mod.SecureStoragePlugin
  return _plugin
}

export async function setSecret(key, value) {
  if (isNative()) {
    const plugin = await getPlugin()
    await Promise.resolve(plugin.set({ key, value }))
  } else {
    sessionStorage.setItem(key, value)
  }
}

export async function getSecret(key) {
  if (isNative()) {
    const plugin = await getPlugin()
    try {
      const { value } = await Promise.resolve(plugin.get({ key }))
      return value ?? ''
    } catch {
      // key not found in secure storage
      return ''
    }
  } else {
    return sessionStorage.getItem(key) || ''
  }
}

export async function deleteSecret(key) {
  if (isNative()) {
    const plugin = await getPlugin()
    try {
      await Promise.resolve(plugin.remove({ key }))
    } catch {
      // key didn't exist — nothing to remove
    }
  } else {
    sessionStorage.removeItem(key)
  }
}

/**
 * One-time migration: move API keys out of the sip_settings localStorage
 * blob and any sip_byok_* localStorage keys into secure storage, then
 * remove them from localStorage so they are never persisted in plaintext
 * again.
 */
export async function migrateKeysFromLocalStorage() {
  const raw = localStorage.getItem('sip_settings')
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      const sqKey = parsed.sqApiKey
      if (sqKey) {
        await setSecret('sip_sqApiKey', sqKey)
        const cleaned = { ...parsed }
        delete cleaned.sqApiKey
        localStorage.setItem('sip_settings', JSON.stringify(cleaned))
      }
    } catch {
      // corrupted settings — skip migration
    }
  }

  const providers = ['openrouter', 'gemini', 'openai', 'anthropic']
  for (const p of providers) {
    const lsKey = `sip_byok_${p}`
    const val = localStorage.getItem(lsKey)
    if (val) {
      await setSecret(lsKey, val)
      localStorage.removeItem(lsKey)
    }
  }
}
