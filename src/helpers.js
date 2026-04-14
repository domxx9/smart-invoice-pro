// Module-level vars — updated via setters so fmt/nextId need no prop threading
let _currency      = 'GBP'
let _invoicePrefix = 'INV'
let _invoicePadding = 4

export const setCurrency       = (v) => { _currency = v }
export const setInvoicePrefix  = (v) => { _invoicePrefix = v }
export const setInvoicePadding = (v) => { _invoicePadding = v }

export const fmt   = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: _currency }).format(n || 0)
export const today = () => new Date().toISOString().slice(0, 10)

export function nextId(invoices) {
  const num = invoices.length + 1
  const pad = parseInt(_invoicePadding) || 4
  return `${_invoicePrefix}${String(num).padStart(pad, '0')}`
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
    tax: defaultTax,
    notes: '',
  }
}

export function calcTotals(items, taxRate) {
  const sub = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0)
  const tax = sub * ((parseFloat(taxRate) || 0) / 100)
  return { sub, tax, total: sub + tax }
}

export function timeAgo(ts) {
  if (!ts) return null
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ─── Smart Paste ──────────────────────────────────────────────────────────────

export function cleanWhatsApp(text) {
  return text
    .split('\n')
    .map(l => l.replace(/^\[\d{1,2}:\d{2}(?:[^\]]*)?\]\s*[^:]+:\s*/, '').trim())
    .filter(l => {
      if (!l || l.length < 2) return false
      if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|good morning|good afternoon)\b/i.test(l)) return false
      if (/^\?/.test(l) || (/\?$/.test(l) && l.split(/\s+/).length < 5)) return false
      return true
    })
    .join('\n')
}

export function extractItems(text) {
  const results = []
  const lines = text.split(/\n|,(?!\s*\d)/)
  for (const line of lines) {
    const seg = line.trim()
    if (!seg || seg.length < 2) continue
    let qty = 1, name = seg

    const pre = seg.match(/^(\d+)\s*(?:x|×|of(?:\s+the)?)\s+(.+)$/i)
    if (pre) { qty = parseInt(pre[1], 10); name = pre[2].trim() }
    else {
      const suf = seg.match(/^(.+?)\s*(?:x|×)\s*(\d+)$/i)
      if (suf) { qty = parseInt(suf[2], 10); name = suf[1].trim() }
    }
    name = name.replace(/\b(the|a|an|some|please|need|want|order|get|for|me|us|of|i|we)\b/gi, '').replace(/\s+/g, ' ').trim()
    if (name) results.push({ raw: seg, name, qty })
  }
  return results
}

function wordSim(a, b) {
  if (a === b) return 1
  if (a.startsWith(b) || b.startsWith(a)) return 0.75
  if (Math.abs(a.length - b.length) <= 3 && a.length >= 4) {
    let diff = 0
    const min = Math.min(a.length, b.length)
    for (let i = 0; i < min; i++) if (a[i] !== b[i]) diff++
    diff += Math.abs(a.length - b.length)
    if (diff <= 2) return Math.max(0, 1 - diff * 0.25)
  }
  return 0
}

function matchConfidence(queryName, productName) {
  const stopWords = new Set(['and', 'the', 'with', 'for', 'of', 'a', 'an'])
  const qw = queryName.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w))
  const pw = productName.toLowerCase().split(/[\s\-—\/]+/).filter(w => w.length > 1 && !stopWords.has(w))
  if (!qw.length || !pw.length) return 0
  const qScore = qw.reduce((s, q) => s + Math.max(...pw.map(p => wordSim(q, p))), 0)
  const pScore = pw.reduce((s, p) => s + Math.max(...qw.map(q => wordSim(q, p))), 0)
  const coverage    = qScore / qw.length
  const specificity = pScore / pw.length
  if (coverage + specificity === 0) return 0
  return (2 * coverage * specificity) / (coverage + specificity)
}

export function matchItems(extracted, products) {
  return extracted.map(({ raw, name, qty }) => {
    let best = null, bestConf = 0
    for (const p of products) {
      const c = matchConfidence(name, p.name)
      if (c > bestConf) { bestConf = c; best = p }
    }
    const pct = Math.round(bestConf * 100)
    return {
      raw, name, qty,
      product:   pct >= 80 ? best : null,
      bestGuess: pct >= 30 && pct < 80 ? best : null,
      confidence: pct,
    }
  })
}

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
  return words.filter(w => n.includes(w)).length
}

export function searchGroups(groups, query) {
  if (!query.trim()) return groups
  const wordCount = query.trim().split(/\s+/).filter(Boolean).length
  return groups
    .map(g => ({ g, score: scoreGroup(g.name, query) }))
    .filter(({ score }) => score === Infinity || score === wordCount)
    .sort((a, b) => b.score - a.score)
    .map(({ g }) => g)
}

const CANDIDATE_MIN_SCORE = 0.15
export function getTopCandidates(name, products, n = 5) {
  return products
    .map(p => ({ p, c: matchConfidence(name, p.name) }))
    .filter(({ c }) => c >= CANDIDATE_MIN_SCORE)
    .sort((a, b) => b.c - a.c)
    .slice(0, n)
    .map(({ p }) => p)
}
