// Module-level vars — updated via setters so fmt/nextId need no prop threading
let _currency = 'GBP'
let _invoicePrefix = 'INV'
let _invoicePadding = 4

export const setCurrency = (v) => {
  _currency = v
}
export const setInvoicePrefix = (v) => {
  _invoicePrefix = v
}
export const setInvoicePadding = (v) => {
  _invoicePadding = v
}

export const fmt = (n) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: _currency }).format(n || 0)
export const today = () => new Date().toISOString().slice(0, 10)

export function nextId(invoices) {
  const pad = parseInt(_invoicePadding) || 4
  const prefix = _invoicePrefix || 'INV'
  const nums = invoices
    .map((inv) => parseInt(String(inv.id).replace(prefix, ''), 10))
    .filter((n) => !isNaN(n))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `${prefix}${String(next).padStart(pad, '0')}`
}

export function blankInvoice(invoices, defaultTax = 20) {
  return {
    id: nextId(invoices),
    customerBusiness: '',
    customer: '',
    email: '',
    address1: '',
    address2: '',
    city: '',
    postcode: '',
    country: '',
    date: today(),
    due: '',
    status: 'new',
    items: [{ desc: '', qty: 1, price: '' }],
    discounts: [],
    tax: defaultTax,
    notes: '',
  }
}

export function calcTotals(items, taxRate, discounts = []) {
  const sub = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0)
  const list = Array.isArray(discounts) ? discounts : []
  const safe = (v) => {
    const n = parseFloat(v)
    return !isFinite(n) || n < 0 ? 0 : n
  }
  let percentAmount = 0
  let fixedAmount = 0
  const lines = []
  for (const d of list) {
    if (!d) continue
    const value = safe(d.value)
    if (d.type === 'percent') {
      const amount = sub * (value / 100)
      percentAmount += amount
      lines.push({ type: 'percent', value, name: d.name || '', amount })
    } else if (d.type === 'fixed') {
      fixedAmount += value
      lines.push({ type: 'fixed', value, name: d.name || '', amount: value })
    }
  }
  const discountTotal = Math.min(sub, percentAmount + fixedAmount)
  const discounted = sub - discountTotal
  const tax = discounted * ((parseFloat(taxRate) || 0) / 100)
  return { sub, discountLines: lines, discountTotal, discounted, tax, total: discounted + tax }
}

export function timeAgo(ts) {
  if (!ts) return null
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Smart Paste ──────────────────────────────────────────────────────────────

export const EXTENDED_STOPWORDS = Object.freeze([
  'the',
  'a',
  'an',
  'some',
  'please',
  'need',
  'order',
  'of',
  'with',
  'for',
  'and',
  'also',
  'plus',
])

const FILLER_WORDS = [...EXTENDED_STOPWORDS, 'want', 'get', 'me', 'us', 'i', 'we']
const FILLER_RE = new RegExp('\\b(?:' + FILLER_WORDS.join('|') + ')\\b', 'gi')

// Joiners split items but must not break numeric expressions like `2 + 3`
// or product tags like `R&D` (no whitespace → already excluded).
const JOINER_SPLIT_RE = /\s+(?:and|also|plus)\s+|(?<![0-9])\s+[&+]\s+(?![0-9])/gi

export function normalizeText(s) {
  if (s == null) return ''
  return String(s)
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim()
}

export function cleanWhatsApp(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/^\[\d{1,2}:\d{2}(?:[^\]]*)?\]\s*[^:]+:\s*/, '').trim())
    .filter((l) => {
      if (!l || l.length < 2) return false
      if (
        /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|good morning|good afternoon)\b/i.test(
          l,
        )
      )
        return false
      if (/^\?/.test(l) || (/\?$/.test(l) && l.split(/\s+/).length < 5)) return false
      return true
    })
    .join('\n')
}

export function extractItems(text) {
  const cleaned = normalizeText(cleanWhatsApp(String(text == null ? '' : text)))
  const results = []
  const segments = cleaned
    .split(/\n|,(?!\s*\d)/)
    .flatMap((s) => s.split(JOINER_SPLIT_RE))
  for (const line of segments) {
    const seg = (line || '').trim()
    if (!seg || seg.length < 2) continue
    let qty = 1,
      name = seg

    const pre = seg.match(/^(\d+)\s*(?:x|×|of(?:\s+the)?)\s+(.+)$/i)
    const container = !pre
      ? seg.match(/^(?:box|pack|case|set|bag|pkg|lot|dozen|pair)\s+of\s+(\d+)\s+(.+)$/i)
      : null
    const plain = !pre && !container ? seg.match(/^(\d+)\s+([A-Za-z].*)$/) : null

    if (pre) {
      qty = parseInt(pre[1], 10)
      name = pre[2].trim()
    } else if (container) {
      qty = parseInt(container[1], 10)
      name = container[2].trim()
    } else if (plain) {
      qty = parseInt(plain[1], 10)
      name = plain[2].trim()
    } else {
      const suf = seg.match(/^(.+?)\s*(?:x|×)\s*(\d+)$/i)
      if (suf) {
        qty = parseInt(suf[2], 10)
        name = suf[1].trim()
      }
    }
    name = name.replace(FILLER_RE, '').replace(/\s+/g, ' ').trim()
    if (name) results.push({ raw: seg, name, qty })
  }
  return results
}

export { matchProduct, matchItems, getTopCandidates, invalidateProductIndex } from './matcher.js'

export function groupProducts(products) {
  const map = {}
  for (const p of products) {
    const base = p.name.includes(' — ') ? p.name.split(' — ')[0] : p.name
    if (!map[base]) map[base] = { name: base, category: p.category, variants: [] }
    map[base].variants.push(p)
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
}

function scoreGroup(name, query) {
  const n = name.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 1
  if (n.includes(q)) return Infinity
  const words = q.split(/\s+/).filter(Boolean)
  return words.filter((w) => n.includes(w)).length
}

export function searchGroups(groups, query) {
  if (!query.trim()) return groups
  const wordCount = query.trim().split(/\s+/).filter(Boolean).length
  return groups
    .map((g) => ({ g, score: scoreGroup(g.name, query) }))
    .filter(({ score }) => score === Infinity || score === wordCount)
    .sort((a, b) => b.score - a.score)
    .map(({ g }) => g)
}
