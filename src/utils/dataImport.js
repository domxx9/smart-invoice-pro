/**
 * Local data import / restore module (SMA-82c).
 *
 * Consumes the snapshot envelope written by `dataExport.js` and replays it
 * back into localStorage + secure storage. Two replay modes are supported:
 *
 *   - `merge` (default) — existing `sip_*` rows are preserved; incoming
 *     invoices/products/orders upsert by `id`; settings and picks are
 *     shallow-merged; scalars are overwritten only when the snapshot
 *     carries a non-null value.
 *
 *   - `replace` — every `KNOWN_STORAGE_KEYS` key is wiped first, then the
 *     snapshot is written verbatim. Current data that is not in the
 *     snapshot is discarded.
 *
 * Secrets in the snapshot (`snapshot.secrets`) are opt-in at export time
 * and only written when present. Restore never deletes a secret the user
 * already has.
 */

import { SCHEMA_VERSION, EXPORT_KIND, KNOWN_STORAGE_KEYS } from './dataExport.js'
import { setSecret } from '../secure-storage.js'
import { STORAGE_KEYS } from '../constants/storageKeys.js'

const EXPECTED_TYPES = {
  invoices: 'array',
  products: 'array',
  productsSyncedAt: 'numberOrNull',
  orders: 'array',
  ordersSyncedAt: 'numberOrNull',
  picks: 'object',
  settings: 'object',
  onboarded: 'stringOrNull',
  aiModelId: 'stringOrNull',
}

const WRITERS = [
  { dataKey: 'invoices', storageKey: STORAGE_KEYS.SIP_INVOICES, shape: 'listById' },
  { dataKey: 'products', storageKey: STORAGE_KEYS.SIP_PRODUCTS, shape: 'listById' },
  { dataKey: 'productsSyncedAt', storageKey: STORAGE_KEYS.SIP_PRODUCTS_SYNCED_AT, shape: 'scalar' },
  { dataKey: 'orders', storageKey: STORAGE_KEYS.SIP_ORDERS, shape: 'listById' },
  { dataKey: 'ordersSyncedAt', storageKey: STORAGE_KEYS.SIP_ORDERS_SYNCED_AT, shape: 'scalar' },
  { dataKey: 'picks', storageKey: STORAGE_KEYS.SIP_PICKS, shape: 'mapMerge' },
  { dataKey: 'settings', storageKey: STORAGE_KEYS.SIP_SETTINGS, shape: 'mapMerge' },
  { dataKey: 'onboarded', storageKey: STORAGE_KEYS.SIP_ONBOARDED, shape: 'scalar' },
  { dataKey: 'aiModelId', storageKey: STORAGE_KEYS.SIP_AI_MODEL, shape: 'scalar' },
]

export function parseSnapshot(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { snapshot: null, issues: ['File is empty.'] }
  }
  try {
    return { snapshot: JSON.parse(text), issues: [] }
  } catch (e) {
    return { snapshot: null, issues: [`File is not valid JSON: ${e.message}`] }
  }
}

export function validateSnapshot(snapshot) {
  const counts = { invoices: 0, products: 0, orders: 0 }
  const issues = []

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { counts, issues: ['Backup file is not a JSON object.'] }
  }

  if (snapshot.kind !== EXPORT_KIND) {
    issues.push(
      `Unexpected backup kind ${JSON.stringify(snapshot.kind)} (expected ${JSON.stringify(EXPORT_KIND)}).`,
    )
  }
  if (snapshot.version !== SCHEMA_VERSION) {
    issues.push(
      `Unsupported schema version ${JSON.stringify(snapshot.version)} (expected ${SCHEMA_VERSION}).`,
    )
  }

  const data = snapshot.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    issues.push('Backup is missing the "data" block.')
    return { counts, issues }
  }

  for (const [key, expected] of Object.entries(EXPECTED_TYPES)) {
    if (!(key in data)) continue
    if (!matchesType(data[key], expected)) {
      issues.push(`data.${key} is the wrong type (expected ${expected}).`)
    }
  }

  counts.invoices = Array.isArray(data.invoices) ? data.invoices.length : 0
  counts.products = Array.isArray(data.products) ? data.products.length : 0
  counts.orders = Array.isArray(data.orders) ? data.orders.length : 0

  return { counts, issues }
}

export async function applySnapshot(snapshot, { mode = 'merge' } = {}) {
  if (mode !== 'merge' && mode !== 'replace') {
    throw new Error(`Unknown apply mode: ${mode}`)
  }
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Snapshot is not a JSON object.')
  }
  const data = snapshot.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Snapshot is missing the "data" block.')
  }

  if (mode === 'replace') {
    for (const k of KNOWN_STORAGE_KEYS) localStorage.removeItem(k)
  }

  for (const w of WRITERS) {
    if (!(w.dataKey in data)) continue
    const value = data[w.dataKey]

    if (mode === 'replace') {
      if (value == null) continue
      writeWithShape(w, value, null)
      continue
    }

    // merge mode — preserve existing when the snapshot is null/undefined
    if (value == null) continue
    writeWithShape(w, value, 'merge')
  }

  if (snapshot.secrets && typeof snapshot.secrets === 'object') {
    const { sqApiKey, shopifyAccessToken, byok } = snapshot.secrets
    if (sqApiKey) await setSecret('sip_sqApiKey', sqApiKey)
    if (shopifyAccessToken) await setSecret('sip_shopifyAccessToken', shopifyAccessToken)
    if (byok && typeof byok === 'object') {
      for (const [provider, key] of Object.entries(byok)) {
        if (key) await setSecret(`sip_byok_${provider}`, key)
      }
    }
  }
}

function matchesType(value, kind) {
  switch (kind) {
    case 'array':
      return Array.isArray(value)
    case 'object':
      return !!value && typeof value === 'object' && !Array.isArray(value)
    case 'numberOrNull':
      return value === null || (typeof value === 'number' && Number.isFinite(value))
    case 'stringOrNull':
      return value === null || typeof value === 'string'
    default:
      return false
  }
}

function writeWithShape(writer, value, merge) {
  switch (writer.shape) {
    case 'listById':
      if (!Array.isArray(value)) return
      if (merge === 'merge') {
        const existing = safeReadJson(writer.storageKey, [])
        writeJson(writer.storageKey, mergeById(existing, value))
      } else {
        writeJson(writer.storageKey, value)
      }
      return
    case 'mapMerge':
      if (!value || typeof value !== 'object' || Array.isArray(value)) return
      if (merge === 'merge') {
        const existing = safeReadJson(writer.storageKey, {})
        writeJson(writer.storageKey, { ...existing, ...value })
      } else {
        writeJson(writer.storageKey, value)
      }
      return
    case 'scalar':
      writeScalar(writer.storageKey, value)
      return
  }
}

function mergeById(existing, incoming) {
  const byId = new Map()
  const withoutId = []
  for (const item of Array.isArray(existing) ? existing : []) {
    if (item && item.id != null) byId.set(item.id, item)
    else withoutId.push(item)
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (item && item.id != null) byId.set(item.id, item)
    else withoutId.push(item)
  }
  return [...byId.values(), ...withoutId]
}

function writeJson(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value))
}

function writeScalar(storageKey, value) {
  if (value == null) {
    localStorage.removeItem(storageKey)
  } else {
    localStorage.setItem(storageKey, String(value))
  }
}

function safeReadJson(key, fallback) {
  const raw = localStorage.getItem(key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}
