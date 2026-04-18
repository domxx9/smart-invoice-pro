/**
 * Local data export module (SMA-82a).
 *
 * Pure logic only: snapshots every persisted `sip_*` localStorage key into a
 * structured, versioned JSON object, plus an RFC 4180-ish CSV renderer for
 * invoices. UI/sink wiring (Capacitor Share, blob download) lives in
 * SMA-82b; import/restore lives in SMA-82c.
 */

import { getSecret } from '../secure-storage.js'
import pkg from '../../package.json'

export const SCHEMA_VERSION = 1
export const EXPORT_KIND = 'smart-invoice-pro-backup'

export const KNOWN_STORAGE_KEYS = [
  'sip_invoices',
  'sip_products',
  'sip_products_synced_at',
  'sip_orders',
  'sip_orders_synced_at',
  'sip_picks',
  'sip_settings',
  'sip_onboarded',
  'sip_ai_model',
]

const BYOK_PROVIDERS = ['openrouter', 'gemini', 'openai', 'anthropic']

const SECRET_KEYS = [
  'sip_sqApiKey',
  'sip_shopifyAccessToken',
  ...BYOK_PROVIDERS.map((p) => `sip_byok_${p}`),
]

function readJson(key, fallback) {
  const raw = localStorage.getItem(key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function readNumber(key) {
  const raw = localStorage.getItem(key)
  if (raw == null) return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

function readString(key) {
  const raw = localStorage.getItem(key)
  return raw == null ? null : raw
}

export async function buildExportSnapshot({ includeSecrets = false } = {}) {
  const snapshot = {
    kind: EXPORT_KIND,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: 'Smart Invoice Pro', version: pkg.version },
    data: {
      invoices: readJson('sip_invoices', []),
      products: readJson('sip_products', []),
      productsSyncedAt: readNumber('sip_products_synced_at'),
      orders: readJson('sip_orders', []),
      ordersSyncedAt: readNumber('sip_orders_synced_at'),
      picks: readJson('sip_picks', {}),
      settings: readJson('sip_settings', {}),
      onboarded: readString('sip_onboarded'),
      aiModelId: readString('sip_ai_model'),
    },
    secrets: null,
  }

  if (includeSecrets) {
    const entries = await Promise.all(SECRET_KEYS.map(async (k) => [k, await getSecret(k)]))
    const secrets = { byok: {} }
    for (const [k, v] of entries) {
      if (!v) continue
      if (k === 'sip_sqApiKey') secrets.sqApiKey = v
      else if (k === 'sip_shopifyAccessToken') secrets.shopifyAccessToken = v
      else if (k.startsWith('sip_byok_')) {
        secrets.byok[k.slice('sip_byok_'.length)] = v
      }
    }
    snapshot.secrets = secrets
  }

  return snapshot
}

export function snapshotToJson(snapshot) {
  return JSON.stringify(snapshot, null, 2)
}

const CSV_HEADERS = [
  'invoice_number',
  'customer',
  'email',
  'date',
  'due',
  'status',
  'subtotal',
  'tax',
  'total',
  'notes',
]

function csvEscape(value) {
  if (value == null) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function money(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)
}

function csvRow(invoice) {
  const items = Array.isArray(invoice?.items) ? invoice.items : []
  const taxRate = parseFloat(invoice?.tax) || 0
  const subtotal = items.reduce(
    (acc, item) => acc + (parseFloat(item?.qty) || 0) * (parseFloat(item?.price) || 0),
    0,
  )
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount
  return [
    invoice?.id ?? '',
    invoice?.customer ?? '',
    invoice?.email ?? '',
    invoice?.date ?? '',
    invoice?.due ?? '',
    invoice?.status ?? '',
    money(subtotal),
    money(taxAmount),
    money(total),
    invoice?.notes ?? '',
  ]
    .map(csvEscape)
    .join(',')
}

export function invoicesToCsv(invoices) {
  const list = Array.isArray(invoices) ? invoices : []
  const lines = [CSV_HEADERS.join(','), ...list.map(csvRow)]
  return lines.join('\r\n')
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function backupFilename(kind, now = new Date()) {
  const date = now instanceof Date ? now : new Date(now)
  const yyyy = date.getFullYear()
  const mm = pad2(date.getMonth() + 1)
  const dd = pad2(date.getDate())
  return `${kind}-${yyyy}-${mm}-${dd}.json`
}
