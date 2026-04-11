import { useState, useEffect, useCallback, useRef, Component } from 'react'
import {
  MODELS as AI_MODELS,
  hasWebGPU,
  isModelDownloaded,
  downloadModel as gemmaDownload,
  deleteModel as gemmaDelete,
  initModel as gemmaInit,
  isGemmaReady,
  getLoadedModelId,
  matchWithGemma,
  cancelDownload as gemmaCancelDownload,
} from './gemma.js'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) { console.error('[SIP] Render crash:', err, info.componentStack) }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 24, color: '#f87171', background: '#0a0a0b', minHeight: '100dvh' }}>
        <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
        <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{String(this.state.err)}</pre>
      </div>
    )
    return this.props.children
  }
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #0a0a0b;
    --surface:   #141416;
    --card:      #1c1c1f;
    --border:    #2a2a2e;
    --accent:    #f5a623;
    --accent-d:  #c87f0a;
    --text:      #f0f0f0;
    --muted:     #888;
    --danger:    #e05252;
    --success:   #4caf84;
    --radius:    12px;
    --radius-sm: 8px;
    --shadow:    0 4px 24px rgba(0,0,0,.5);
  }

  body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; min-height: 100dvh; }

  .app { display: flex; flex-direction: column; min-height: 100dvh; padding-top: env(safe-area-inset-top, 0); }
  .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 16px; height: 56px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
  .header-inner { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .header h1 { font-size: 1rem; font-weight: 700; color: var(--accent); letter-spacing: .5px; }
  .content { flex: 1; padding: 16px; max-width: 900px; width: 100%; margin: 0 auto; }
  .nav { display: flex; gap: 4px; background: var(--surface); border-top: 1px solid var(--border); padding: 8px 8px env(safe-area-inset-bottom, 0); position: sticky; bottom: 0; z-index: 10; }
  .nav-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border: none; background: none; color: var(--muted); font-size: 0.65rem; cursor: pointer; border-radius: var(--radius-sm); transition: color .15s, background .15s; }
  .nav-btn.active { color: var(--accent); background: rgba(245,166,35,.08); }
  .nav-btn svg { width: 22px; height: 22px; }
  .btn svg { width: 16px; height: 16px; flex-shrink: 0; }
  @keyframes navGlow { 0%,100% { background: rgba(245,166,35,.08); color: var(--accent); } 50% { background: rgba(245,166,35,.28); box-shadow: 0 0 14px rgba(245,166,35,.5); } }
  .nav-btn.glow { animation: navGlow 1s ease-in-out infinite; color: var(--accent); }

  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 18px; border-radius: var(--radius-sm); font-size: .9rem; font-weight: 600; cursor: pointer; border: none; transition: opacity .15s, transform .1s; }
  .btn:active { transform: scale(.97); }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-primary:hover { opacity: .9; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--text); border-color: var(--muted); }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-sm { padding: 6px 12px; font-size: .8rem; }
  .btn-full { width: 100%; }

  label { font-size: .8rem; color: var(--muted); display: block; margin-bottom: 4px; }
  input, textarea, select { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: .9rem; padding: 10px 12px; outline: none; }
  input:focus, textarea:focus, select:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 80px; }
  .field { margin-bottom: 12px; }

  .invoice-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .line-item { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .line-item:last-child { border-bottom: none; }
  .li-row2 { display: flex; align-items: center; gap: 6px; }
  .li-qty  { width: 64px; flex-shrink: 0; }
  .li-price{ flex: 1; }
  .li-total{ font-size: .9rem; font-weight: 600; color: var(--accent); white-space: nowrap; min-width: 64px; text-align: right; }
  .li-del  { flex-shrink: 0; }
  .totals  { text-align: right; padding: 12px 0; border-top: 1px solid var(--border); }
  .totals .total-line { display: flex; justify-content: flex-end; gap: 16px; font-size: .9rem; color: var(--muted); margin-bottom: 4px; }
  .totals .grand { font-size: 1.25rem; font-weight: 700; color: var(--accent); }

  .ai-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 14px; }
  .ai-output { font-size: .85rem; line-height: 1.6; white-space: pre-wrap; color: var(--text); }
  .ai-typing::after { content: '▋'; animation: blink .7s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .ptr-spinner { width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid var(--border); border-top-color: var(--accent); flex-shrink: 0; }
  .chip { display: inline-block; background: rgba(245,166,35,.12); color: var(--accent); border-radius: 20px; padding: 3px 10px; font-size: .75rem; margin: 2px; cursor: pointer; border: 1px solid rgba(245,166,35,.2); }
  .chip:hover { background: rgba(245,166,35,.22); }

  .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .product-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; cursor: pointer; transition: border-color .15s, transform .1s; }
  .product-card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .product-card h3 { font-size: .9rem; font-weight: 600; margin-bottom: 4px; }
  .product-card .price { color: var(--accent); font-weight: 700; }
  .product-card .stock { font-size: .75rem; color: var(--muted); }
  .low-stock { color: var(--danger) !important; }

  .inv-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
  .inv-id { font-weight: 600; font-size: .9rem; }
  .inv-customer { font-size: .8rem; color: var(--muted); }
  .badge { display: inline-block; font-size: .7rem; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
  .badge-paid      { background: rgba(76,175,132,.15);  color: var(--success); }
  .badge-pending   { background: rgba(245,166,35,.12);  color: var(--accent);  }
  .badge-overdue   { background: rgba(224,82,82,.12);   color: var(--danger);  }
  .badge-draft     { background: rgba(136,136,136,.15); color: var(--muted);   }
  .badge-FULFILLED { background: rgba(76,175,132,.15);  color: var(--success); }
  .badge-PENDING   { background: rgba(245,166,35,.12);  color: var(--accent);  }
  .badge-CANCELED  { background: rgba(224,82,82,.12);   color: var(--danger);  }

  .settings-section { margin-bottom: 24px; }
  .settings-section h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }

  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
  .stat-card .label { font-size: .75rem; color: var(--muted); margin-bottom: 4px; }
  .stat-card .value { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
  .stat-card .sub { font-size: .75rem; color: var(--success); margin-top: 2px; }

  .divider { height: 1px; background: var(--border); margin: 16px 0; }
  .text-muted { color: var(--muted); font-size: .85rem; }
  .text-accent { color: var(--accent); }
  .text-success { color: var(--success); }
  .text-danger { color: var(--danger); }
  .flex-between { display: flex; justify-content: space-between; align-items: center; }
  .mb-8 { margin-bottom: 8px; }
  .mb-16 { margin-bottom: 16px; }
  .mt-8 { margin-top: 8px; }
  .mt-16 { margin-top: 16px; }
`

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ name }) => {
  const icons = {
    dashboard: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    invoice:   <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
    inventory: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></>,
    plus:      <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    trash:     <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></>,
    send:      <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    refresh:   <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
    check:     <polyline points="20 6 9 17 4 12"/>,
    download:  <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    orders:    <><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  )
}

// ─── Currency + tax lookup ────────────────────────────────────────────────────
const CURRENCY_TAX = {
  GBP: { label: 'GBP — British Pound (£)',         tax: 20   },
  USD: { label: 'USD — US Dollar ($)',              tax: 0    },
  EUR: { label: 'EUR — Euro (€)',                   tax: 20   },
  AUD: { label: 'AUD — Australian Dollar (A$)',     tax: 10   },
  CAD: { label: 'CAD — Canadian Dollar (C$)',       tax: 5    },
  NZD: { label: 'NZD — New Zealand Dollar (NZ$)',   tax: 15   },
  SGD: { label: 'SGD — Singapore Dollar (S$)',      tax: 9    },
  AED: { label: 'AED — UAE Dirham',                 tax: 5    },
  ZAR: { label: 'ZAR — South African Rand (R)',     tax: 15   },
  INR: { label: 'INR — Indian Rupee (₹)',           tax: 18   },
  CHF: { label: 'CHF — Swiss Franc',                tax: 8.1  },
  JPY: { label: 'JPY — Japanese Yen (¥)',           tax: 10   },
  HKD: { label: 'HKD — Hong Kong Dollar (HK$)',     tax: 0    },
  MYR: { label: 'MYR — Malaysian Ringgit (RM)',     tax: 8    },
  NOK: { label: 'NOK — Norwegian Krone (kr)',       tax: 25   },
  SEK: { label: 'SEK — Swedish Krona (kr)',         tax: 25   },
  DKK: { label: 'DKK — Danish Krone (kr)',          tax: 25   },
  SAR: { label: 'SAR — Saudi Riyal (ر.س)',          tax: 15   },
}

// Module-level — updated on settings save/load so fmt() needs no prop threading
let _currency = 'GBP'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat(undefined, { style: 'currency', currency: _currency }).format(n || 0)
const today = () => new Date().toISOString().slice(0, 10)
const nextId = (invoices) => `INV-${String(invoices.length + 1).padStart(4, '0')}`

function blankInvoice(invoices) {
  return {
    id: nextId(invoices),
    customer: '',
    email: '',
    date: today(),
    due: '',
    status: 'pending',
    items: [{ desc: '', qty: 1, price: '' }],
    tax: 10,
    notes: '',
  }
}

function calcTotals(items, taxRate) {
  const sub = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0)
  const tax = sub * ((parseFloat(taxRate) || 0) / 100)
  return { sub, tax, total: sub + tax }
}

// ─── Smart Paste — extraction + matching ─────────────────────────────────────

// Strip WhatsApp message formatting before passing to extractItems.
// Removes: [HH:MM, DD/MM/YYYY] Name: prefixes, pure questions, greetings.
function cleanWhatsApp(text) {
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

// Layer 1: extract structured items from raw text (swap this for Gemma in Phase 4)
function extractItems(text) {
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
    // strip common filler words
    name = name.replace(/\b(the|a|an|some|please|need|want|order|get|for|me|us|of|i|we)\b/gi, '').replace(/\s+/g, ' ').trim()
    if (name) results.push({ raw: seg, name, qty })
  }
  return results
}

// Layer 2: fuzzy word similarity — handles misspellings + partial words
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

// Layer 2: match extracted items against flat product list
function matchItems(extracted, products) {
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

// ─── Groups + search ──────────────────────────────────────────────────────────

// Groups flat product list by base name (before " — "), sorted A→Z
function groupProducts(products) {
  const map = {}
  for (const p of products) {
    const base = p.name.includes(' — ') ? p.name.split(' — ')[0] : p.name
    if (!map[base]) map[base] = { name: base, category: p.category, variants: [] }
    map[base].variants.push(p)
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
}

// Score a group name against a query string.
// Returns Infinity for exact substring, word-match count otherwise, 0 for no match.
function scoreGroup(name, query) {
  const n = name.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 1
  if (n.includes(q)) return Infinity
  const words = q.split(/\s+/).filter(Boolean)
  const hits = words.filter(w => n.includes(w)).length
  return hits
}

// Filter and sort groups by relevance to query.
// All words must match (AND logic). Exact substring ranked above word matches.
function searchGroups(groups, query) {
  if (!query.trim()) return groups
  const wordCount = query.trim().split(/\s+/).filter(Boolean).length
  return groups
    .map(g => ({ g, score: scoreGroup(g.name, query) }))
    .filter(({ score }) => score === Infinity || score === wordCount)
    .sort((a, b) => b.score - a.score)
    .map(({ g }) => g)
}

// ─── Top candidates for Gemma fallback ───────────────────────────────────────
// Returns top N products that have at least a minimal word-overlap score.
// MIN_SCORE filters out completely unrelated products so the LLM isn't
// forced to pick from irrelevant options.
const CANDIDATE_MIN_SCORE = 0.15
function getTopCandidates(name, products, n = 5) {
  return products
    .map(p => ({ p, c: matchConfidence(name, p.name) }))
    .filter(({ c }) => c >= CANDIDATE_MIN_SCORE)
    .sort((a, b) => b.c - a.c)
    .slice(0, n)
    .map(({ p }) => p)
}

// ─── Squarespace Commerce API ─────────────────────────────────────────────────
async function fetchSquarespaceProducts(apiKey, onProgress) {
  const winCap = window.Capacitor
  const isNative = winCap?.isNativePlatform?.()
  const allProducts = []
  let cursor = null

  do {
    const url = `https://api.squarespace.com/1.0/commerce/products${cursor ? `?cursor=${cursor}` : ''}`
    const devUrl = `/api/sqsp/1.0/commerce/products${cursor ? `?cursor=${cursor}` : ''}`
    let data

    if (isNative) {
      const res = await winCap.Plugins.CapacitorHttp.get({
        url,
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (res.status < 200 || res.status >= 300)
        throw new Error(`Squarespace API ${res.status} — ${JSON.stringify(res.data)}`)
      data = res.data
    } else {
      const res = await fetch(devUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
      if (!res.ok) throw new Error(`Squarespace API ${res.status}: ${res.statusText}`)
      data = await res.json()
    }

    if (!Array.isArray(data.products))
      throw new Error(`Unexpected API response — products field missing. Got: ${JSON.stringify(data).slice(0, 200)}`)

    allProducts.push(...data.products)
    onProgress?.(allProducts.length)
    cursor = data.pagination?.nextPageCursor ?? null
  } while (cursor)

  const category = (p) => p.type ? p.type.charAt(0) + p.type.slice(1).toLowerCase() : 'Product'
  // Strip HTML tags and truncate to 80 chars for LLM context
  const stripDesc = (html) => {
    if (!html) return ''
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  }
  console.log(`[SIP] SQSP synced ${allProducts.length} products`)
  return allProducts.flatMap((p) => {
    const variants = p.variants ?? []
    const desc = stripDesc(p.description || p.body || '')
    if (!variants.length) return [{ id: p.id, name: p.name, desc, price: 0, stock: 99, category: category(p) }]

    // If single variant with no meaningful attributes, don't append a suffix
    const expand = variants.length > 1 || Object.values(variants[0]?.attributes ?? {}).some(v => v)
    return variants.map((v, idx) => {
      const price = parseFloat(v.pricing?.basePrice?.value ?? 0)
      const unlimited = v.stock?.unlimited ?? true
      const qty = v.stock?.quantity ?? 0
      const attrs = Object.values(v.attributes ?? {}).filter(Boolean)
      const suffix = expand && attrs.length ? ` — ${attrs.join(' / ')}` : ''
      return {
        id: `${p.id}_v${idx}`,
        name: `${p.name}${suffix}`,
        desc,
        price,
        stock: unlimited ? 99 : qty,
        category: category(p),
      }
    })
  })
}

async function fetchSquarespaceOrders(apiKey, onProgress) {
  const winCap = window.Capacitor
  const isNative = winCap?.isNativePlatform?.()
  const all = []
  let cursor = null

  do {
    const url  = `https://api.squarespace.com/1.0/commerce/orders${cursor ? `?cursor=${cursor}` : ''}`
    const dUrl = `/api/sqsp/1.0/commerce/orders${cursor ? `?cursor=${cursor}` : ''}`
    let data

    if (isNative) {
      const res = await winCap.Plugins.CapacitorHttp.get({ url, headers: { Authorization: `Bearer ${apiKey}` } })
      if (res.status < 200 || res.status >= 300)
        throw new Error(`Squarespace Orders API ${res.status} — ${JSON.stringify(res.data)}`)
      data = res.data
    } else {
      const res = await fetch(dUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
      if (!res.ok) throw new Error(`Squarespace Orders API ${res.status}: ${res.statusText}`)
      data = await res.json()
    }

    const batch = data.result ?? data.orders ?? []
    if (!Array.isArray(batch)) throw new Error(`Unexpected orders response: ${JSON.stringify(data).slice(0, 200)}`)

    all.push(...batch.map(o => ({
      id:          o.id,
      orderNumber: o.orderNumber ?? o.id,
      createdOn:   o.createdOn,
      modifiedOn:  o.modifiedOn ?? o.createdOn,
      customer:    [o.billingAddress?.firstName, o.billingAddress?.lastName].filter(Boolean).join(' ') || o.customerEmail || '—',
      email:       o.customerEmail ?? '',
      status:      o.fulfillmentStatus ?? 'PENDING',
      payStatus:   o.paymentStatus ?? '',
      total:       parseFloat(o.grandTotal?.value ?? 0),
      currency:    o.grandTotal?.currency ?? 'USD',
      lineItems:   (o.lineItems ?? []).map(li => ({
        name:  li.productName ?? li.variantLabel ?? 'Item',
        qty:   li.quantity ?? 1,
        price: parseFloat(li.unitPricePaid?.value ?? 0),
      })),
    })))
    onProgress?.(all.length)

    cursor = data.pagination?.nextPageCursor ?? null
  } while (cursor)

  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const filtered = all.filter(o => {
    if (o.status === 'PENDING') return true
    const refDate = new Date(o.modifiedOn || o.createdOn).getTime()
    return now - refDate <= THIRTY_DAYS
  })
  console.log(`[SIP] SQSP synced ${all.length} orders (${filtered.length} within window)`)
  return filtered.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn))
}

// ─── Sample data ──────────────────────────────────────────────────────────────
const SAMPLE_PRODUCTS = [
  { id: 1, name: 'Web Design — Full Site', price: 2500, stock: 99, category: 'Services' },
  { id: 2, name: 'Logo Design Package', price: 500, stock: 99, category: 'Services' },
  { id: 3, name: 'Monthly SEO Retainer', price: 800, stock: 99, category: 'Services' },
  { id: 4, name: 'Brand Identity Kit', price: 1200, stock: 3, category: 'Services' },
  { id: 5, name: 'Social Media Management', price: 600, stock: 99, category: 'Services' },
  { id: 6, name: 'Photography Session', price: 350, stock: 5, category: 'Services' },
]

const SAMPLE_INVOICES = [
  { id: 'INV-0001', customer: 'Acme Corp', email: 'billing@acme.com', date: '2026-03-15', due: '2026-04-15', status: 'paid',    items: [{ desc: 'Web Design', qty: 1, price: 2500 }], tax: 10, notes: '' },
  { id: 'INV-0002', customer: 'Bright Ideas', email: 'hi@bright.io', date: '2026-03-28', due: '2026-04-28', status: 'pending', items: [{ desc: 'Logo Design', qty: 1, price: 500 }, { desc: 'Brand Kit', qty: 1, price: 1200 }], tax: 10, notes: '' },
  { id: 'INV-0003', customer: 'DevStudio', email: 'pay@devstudio.co', date: '2026-02-10', due: '2026-03-10', status: 'overdue', items: [{ desc: 'SEO Retainer', qty: 2, price: 800 }], tax: 10, notes: 'Follow up sent.' },
]

// ════════════════════════════════════════════════════════════════════════════════
// Screens
// ════════════════════════════════════════════════════════════════════════════════

function Dashboard({ invoices, onNewInvoice }) {
  const paid    = invoices.filter(i => i.status === 'paid')
  const pending = invoices.filter(i => i.status === 'pending')
  const overdue = invoices.filter(i => i.status === 'overdue')
  const revenue     = paid.reduce((s, inv) => s + calcTotals(inv.items, inv.tax).total, 0)
  const outstanding = [...pending, ...overdue].reduce((s, inv) => s + calcTotals(inv.items, inv.tax).total, 0)

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Dashboard</h2>
          <p className="text-muted">{today()}</p>
        </div>
        <button className="btn btn-primary" data-tour="new-invoice" onClick={onNewInvoice}>
          <Icon name="plus" /> New Invoice
        </button>
      </div>

      <div className="stat-grid" data-tour="stat-grid">
        <div className="stat-card">
          <div className="label">Total Revenue</div>
          <div className="value">{fmt(revenue)}</div>
          <div className="sub">{paid.length} paid invoices</div>
        </div>
        <div className="stat-card">
          <div className="label">Outstanding</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{fmt(outstanding)}</div>
          <div className="sub" style={{ color: 'var(--danger)' }}>{overdue.length} overdue</div>
        </div>
        <div className="stat-card">
          <div className="label">Pending</div>
          <div className="value" style={{ color: 'var(--accent)' }}>{pending.length}</div>
          <div className="sub">awaiting payment</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Invoices</div>
          <div className="value" style={{ color: 'var(--text)' }}>{invoices.length}</div>
          <div className="sub">all time</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '.9rem', fontWeight: 600, marginBottom: 10 }}>Recent Activity</h3>
        {invoices.slice().reverse().slice(0, 5).map(inv => {
          const { total } = calcTotals(inv.items, inv.tax)
          return (
            <div key={inv.id} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{inv.id}</div>
                <div className="text-muted">{inv.customer}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(total)}</div>
                <span className={`badge badge-${inv.status}`}>{inv.status}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// paste item status: auto_match | confirmed | best_guess | discarded | no_match | dismissed
function getPasteStatus(r, i, decisions) {
  const d = decisions[i]
  if (d === 'dismissed') return 'dismissed'
  if (d === 'confirmed') return 'confirmed'
  if (d === 'discarded') return 'discarded'
  if (r.product)   return 'auto_match'
  if (r.bestGuess) return 'best_guess'
  return 'no_match'
}
const PASTE_SORT = { no_match: 0, discarded: 0, best_guess: 1, auto_match: 2, confirmed: 2, dismissed: 3 }

function InvoiceEditor({ invoice, originalInvoice, products, onSave, onCancel, onDiscard, onDraftChange, aiReady }) {
  const [inv, setInv] = useState(invoice)
  const [pasteText, setPasteText] = useState('')
  const [pasteResults, setPasteResults] = useState(null) // null | array
  const [pasteDecisions, setPasteDecisions] = useState({}) // { [index]: 'confirmed'|'discarded'|'dismissed' }
  const [pasteAiLoading, setPasteAiLoading] = useState(false)
  const [pasteAiTokens, setPasteAiTokens] = useState('')
  const [pasteAiStage, setPasteAiStage] = useState('')
  const [search, setSearch] = useState('')

  const setField = (k, v) => setInv(p => ({ ...p, [k]: v }))
  const setItem  = (idx, k, v) => setInv(p => {
    const items = [...p.items]
    items[idx] = { ...items[idx], [k]: v }
    return { ...p, items }
  })
  const addItem    = () => setInv(p => ({ ...p, items: [...p.items, { desc: '', qty: 1, price: '' }] }))
  const removeItem = (idx) => setInv(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
  const addProduct = (prod) => {
    setInv(p => ({ ...p, items: [...p.items, { desc: prod.name, qty: 1, price: prod.price }] }))
    setSearch('')
  }

  const decide = (i, val) => setPasteDecisions(d => ({ ...d, [i]: val }))
  const unmatch = (i) => setPasteResults(prev => {
    const updated = [...prev]
    updated[i] = { ...updated[i], product: null, bestGuess: null, confidence: 0, aiEnhanced: false }
    return updated
  })

  // Auto-save draft on every change and notify parent
  useEffect(() => {
    localStorage.setItem('sip_draft_edit', JSON.stringify(inv))
    onDraftChange?.(inv)
  }, [inv]) // eslint-disable-line react-hooks/exhaustive-deps

  const { sub, tax, total } = calcTotals(inv.items, inv.tax)

  const filteredGroups = search.trim() ? searchGroups(groupProducts(products), search) : []

  const runParse = async () => {
    if (!pasteText.trim()) return
    setPasteResults(null)
    setPasteDecisions({})

    console.log('[SIP] runParse aiReady:', aiReady, 'text:', pasteText.length, 'products:', products.length)

    if (aiReady) {
      setPasteAiLoading(true)
      setPasteAiTokens('')
      try {
        // ── Stage 1: regex strips WhatsApp noise ────────────────────────────
        setPasteAiStage('Cleaning order text…')
        const cleaned = cleanWhatsApp(pasteText)
        console.log('[SIP] cleaned text:', cleaned)

        // ── Stage 2: regex extraction + fuzzy match ──────────────────────────
        setPasteAiStage('Matching products…')
        const extracted = extractItems(cleaned)
        const initial = matchItems(extracted, products)
        setPasteResults(initial)
        setPasteDecisions({})

        // ── Stage 3: LLM disambiguates low-confidence items ──────────────────
        const lowConf = initial.filter(r => r.confidence < 65)
        if (lowConf.length) {
          setPasteAiStage(`Resolving ${lowConf.length} uncertain item${lowConf.length > 1 ? 's' : ''}…`)
          const updated = [...initial]
          for (let i = 0; i < initial.length; i++) {
            if (initial[i].confidence >= 65) continue
            const candidates = getTopCandidates(initial[i].name, products, 5)
            if (!candidates.length) continue
            const match = await matchWithGemma(initial[i].name, candidates)
            if (match) {
              updated[i] = { ...updated[i], product: match, bestGuess: null, confidence: 90, aiEnhanced: true }
              setPasteResults([...updated])
            }
          }
        }
      } catch (e) {
        console.error('[SIP] runParse error:', e?.message)
        const extracted = extractItems(pasteText)
        setPasteResults(matchItems(extracted, products))
        setPasteDecisions({})
      } finally {
        setPasteAiLoading(false)
        setPasteAiTokens('')
        setPasteAiStage('')
      }
    } else {
      console.log('[SIP] aiReady false — regex only')
      const extracted = extractItems(pasteText)
      setPasteResults(matchItems(extracted, products))
      setPasteDecisions({})
    }
  }

  const addMatched = () => {
    if (!pasteResults) return
    const newDecisions = { ...pasteDecisions }
    const toAdd = []
    pasteResults.forEach((r, i) => {
      const s = getPasteStatus(r, i, pasteDecisions)
      if (s === 'auto_match' || s === 'confirmed') {
        const prod = r.product ?? r.bestGuess
        toAdd.push({ desc: prod.name, qty: r.qty, price: prod.price })
        newDecisions[i] = 'dismissed'
      }
    })
    if (!toAdd.length) return
    setInv(p => ({ ...p, items: [...p.items, ...toAdd] }))
    const allGone = pasteResults.every((_, i) => newDecisions[i] === 'dismissed')
    if (allGone) { setPasteResults(null); setPasteDecisions({}); setPasteText('') }
    else setPasteDecisions(newDecisions)
  }

  return (
    <div>
      <div className="flex-between mb-16">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{inv.id}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', borderColor: 'rgba(224,82,82,.3)' }} onClick={onDiscard}>Discard</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onCancel(originalInvoice)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(inv)}>
            <Icon name="check" /> Save
          </button>
        </div>
      </div>

      {/* Smart Paste */}
      <div className="ai-box">
        <div className="flex-between mb-8">
          <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--accent)' }}>Smart Paste</span>
          <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Paste order text · auto-match catalog</span>
        </div>
        <textarea
          value={pasteText}
          onChange={e => { setPasteText(e.target.value); setPasteResults(null) }}
          placeholder={'Paste an order, email, or list here…\n\nExample:\n4 x Blue Molar Extractor\n2 x 10 Instruments Sterilisation Cassette'}
          style={{ minHeight: 90, marginBottom: 8, fontSize: '.82rem' }}
        />
        <button
          className="btn btn-primary btn-full"
          onClick={runParse}
          disabled={!pasteText.trim() || pasteAiLoading}
          style={{ marginBottom: (pasteResults || pasteAiLoading) ? 12 : 0 }}
        >
          <Icon name="send" /> Parse &amp; Match
        </button>
        {pasteAiLoading && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '.75rem', color: 'var(--accent)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="ptr-spinner" style={{ animation: 'spin 1s linear infinite' }} />
              {pasteAiStage || 'Thinking…'}
            </div>
            {pasteAiTokens && (
              <div style={{ fontSize: '.72rem', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 80, overflow: 'hidden' }}>
                {pasteAiTokens}<span className="ai-typing" />
              </div>
            )}
          </div>
        )}

        {pasteResults && (() => {
          const sorted = pasteResults
            .map((r, i) => ({ r, i, s: getPasteStatus(r, i, pasteDecisions) }))
            .filter(({ s }) => s !== 'dismissed')
            .sort((a, b) => PASTE_SORT[a.s] - PASTE_SORT[b.s])
          const matchCount = sorted.filter(({ s }) => s === 'auto_match' || s === 'confirmed').length
          if (!sorted.length) return null
          return (
            <div style={{ marginTop: 8 }}>
              {sorted.map(({ r, i, s }) => {
                const isGreen  = s === 'auto_match' || s === 'confirmed'
                const isAmber  = s === 'best_guess'
                const isRed    = s === 'no_match' || s === 'discarded'
                const bg     = isGreen ? 'rgba(76,175,132,.1)'  : isAmber ? 'rgba(245,166,35,.08)' : 'rgba(224,82,82,.08)'
                const border = isGreen ? 'rgba(76,175,132,.3)'  : isAmber ? 'rgba(245,166,35,.25)' : 'rgba(224,82,82,.3)'
                const prod   = r.product ?? r.bestGuess

                return (
                  <div key={i} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 6, background: bg, border: `1px solid ${border}` }}>
                    {isGreen && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--success)' }}>✓ {r.qty} × {prod.name}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                            {r.aiEnhanced ? '🤖 AI matched' : `${r.confidence}% match`} · {fmt(prod.price)} each
                            {s === 'confirmed' && <span style={{ color: 'var(--success)', marginLeft: 6 }}>· Confirmed</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.85rem' }}>{fmt(r.qty * prod.price)}</span>
                          <button
                            className="btn btn-sm"
                            title="Wrong match — remove"
                            style={{ padding: '3px 7px', fontSize: '.75rem', color: 'var(--muted)', border: '1px solid var(--border)', background: 'transparent' }}
                            onClick={() => unmatch(i)}
                          >✕</button>
                        </div>
                      </div>
                    )}

                    {isAmber && (
                      <div>
                        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 2 }}>"{r.name}" — {r.confidence}% match</div>
                        <div style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: 8 }}>Best guess: {r.bestGuess.name}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            style={{ flex: 1, background: 'rgba(76,175,132,.15)', color: 'var(--success)', border: '1px solid rgba(76,175,132,.3)', fontSize: '.78rem' }}
                            onClick={() => decide(i, 'confirmed')}
                          >
                            ✓ Confirm
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ flex: 1, background: 'rgba(224,82,82,.1)', color: 'var(--danger)', border: '1px solid rgba(224,82,82,.25)', fontSize: '.78rem' }}
                            onClick={() => decide(i, 'discarded')}
                          >
                            ✗ Discard
                          </button>
                        </div>
                      </div>
                    )}

                    {isRed && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: '.82rem', color: 'var(--danger)' }}>
                          ✗ No match — "{r.name}"
                          {s === 'discarded' && <span style={{ fontSize: '.72rem', color: 'var(--muted)', marginLeft: 6 }}>Discarded</span>}
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Add manually then tap Handled</div>
                        </div>
                        <button
                          onClick={() => decide(i, 'dismissed')}
                          style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', fontSize: '.72rem', padding: '4px 8px', cursor: 'pointer' }}
                        >
                          Handled
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              {matchCount > 0 && (
                <button className="btn btn-primary btn-full mt-8" onClick={addMatched}>
                  Add {matchCount} matched item{matchCount !== 1 ? 's' : ''} to invoice
                </button>
              )}
            </div>
          )
        })()}
      </div>

      {/* Customer details */}
      <div className="card">
        <div className="invoice-meta">
          <div className="field">
            <label>Customer Name</label>
            <input value={inv.customer} onChange={e => setField('customer', e.target.value)} placeholder="Acme Corp" />
          </div>
          <div className="field">
            <label>Email</label>
            <input value={inv.email} onChange={e => setField('email', e.target.value)} placeholder="billing@acme.com" type="email" />
          </div>
          <div className="field">
            <label>Invoice Date</label>
            <input value={inv.date} onChange={e => setField('date', e.target.value)} type="date" />
          </div>
          <div className="field">
            <label>Due Date</label>
            <input value={inv.due} onChange={e => setField('due', e.target.value)} type="date" />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={inv.status} onChange={e => setField('status', e.target.value)}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          <div className="field">
            <label>Tax %</label>
            <input value={inv.tax} onChange={e => setField('tax', e.target.value)} type="number" min="0" max="100" />
          </div>
        </div>

        {/* Product search */}
        <div className="field">
          <label>Add from catalog</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" />
          {filteredGroups.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
              {filteredGroups.map((g, gi) => {
                const single = g.variants.length === 1 && !g.variants[0].name.includes(' — ')
                return (
                  <div key={g.name} style={{ borderBottom: gi < filteredGroups.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    {/* Single variant — tap to add directly */}
                    {single && (
                      <div onClick={() => addProduct(g.variants[0])}
                        style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '.88rem' }}>{g.name}</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '.85rem' }}>{fmt(g.variants[0].price)}</span>
                      </div>
                    )}
                    {/* Multi-variant — show group label then variants */}
                    {!single && (
                      <>
                        <div style={{ padding: '8px 12px 4px', fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600, letterSpacing: .3 }}>{g.name}</div>
                        {g.variants.map((v, vi) => {
                          const label = v.name.includes(' — ') ? v.name.split(' — ').slice(1).join(' — ') : v.name
                          return (
                            <div key={v.id} onClick={() => addProduct(v)}
                              style={{
                                padding: '8px 12px 8px 22px', cursor: 'pointer', display: 'flex',
                                justifyContent: 'space-between', alignItems: 'center',
                                borderTop: vi === 0 ? '1px solid var(--border)' : 'none',
                                background: 'var(--card)',
                              }}>
                              <span style={{ fontSize: '.85rem' }}>{label}</span>
                              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '.85rem' }}>{fmt(v.price)}</span>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Line items */}
        <div>
          {inv.items.map((item, idx) => (
            <div key={idx} className="line-item">
              <div className="field" style={{ marginBottom: 0 }}>
                {idx === 0 && <label>Description</label>}
                <input value={item.desc} onChange={e => setItem(idx, 'desc', e.target.value)} placeholder="Service or product description" />
              </div>
              <div className="li-row2">
                <div className="li-qty field" style={{ marginBottom: 0 }}>
                  {idx === 0 && <label>Qty</label>}
                  <input value={item.qty} onChange={e => setItem(idx, 'qty', e.target.value)} type="number" min="1" />
                </div>
                <div className="li-price field" style={{ marginBottom: 0 }}>
                  {idx === 0 && <label>Unit Price</label>}
                  <input value={item.price} onChange={e => setItem(idx, 'price', e.target.value)} type="number" min="0" placeholder="0.00" />
                </div>
                <div className="li-total">{fmt((parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0))}</div>
                <div className="li-del">
                  <button className="btn btn-ghost btn-sm" onClick={() => removeItem(idx)} style={{ padding: '6px 8px' }}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-ghost btn-sm btn-full mt-8" onClick={addItem}>
          <Icon name="plus" /> Add Line Item
        </button>

        <div className="totals">
          <div className="total-line"><span>Subtotal</span><span>{fmt(sub)}</span></div>
          <div className="total-line"><span>Tax ({inv.tax}%)</span><span>{fmt(tax)}</span></div>
          <div className="total-line grand"><span>Total</span><span>{fmt(total)}</span></div>
        </div>

        <div className="field mt-8">
          <label>Notes</label>
          <textarea value={inv.notes} onChange={e => setField('notes', e.target.value)} placeholder="Payment terms, thank-you note, etc." />
        </div>
      </div>
    </div>
  )
}

function Invoices({ invoices, onNewInvoice, onEdit, editingDraft }) {
  const [filter, setFilter] = useState('all')

  // Merge draft into display — replace existing entry or prepend as new
  const displayInvoices = editingDraft
    ? invoices.some(i => i.id === editingDraft.id)
      ? invoices.map(i => i.id === editingDraft.id ? { ...editingDraft, status: 'draft' } : i)
      : [{ ...editingDraft, status: 'draft' }, ...invoices]
    : invoices

  const visible = filter === 'all' ? displayInvoices : displayInvoices.filter(i => i.status === filter)

  return (
    <div>
      <div className="flex-between mb-16">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Invoices</h2>
        <button className="btn btn-primary btn-sm" onClick={onNewInvoice}>
          <Icon name="plus" /> New
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['all', 'draft', 'paid', 'pending', 'overdue'].map(f => (
          <span
            key={f}
            className="chip"
            style={filter === f ? { background: 'rgba(245,166,35,.3)' } : {}}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </span>
        ))}
      </div>
      <div>
        {visible.length === 0 && <p className="text-muted" style={{ padding: '20px 0' }}>No invoices.</p>}
        {[
          ...visible.filter(i => i.status === 'draft'),
          ...visible.filter(i => i.status !== 'draft').reverse(),
        ].map(inv => {
          const { total } = calcTotals(inv.items, inv.tax)
          const isDraft = inv.status === 'draft'
          return (
            <div key={inv.id} className="inv-row" onClick={() => onEdit(inv)}
              style={isDraft ? { borderLeft: '3px solid var(--muted)', paddingLeft: 10 } : {}}>
              <div>
                <div className="inv-id">{inv.id}</div>
                <div className="inv-customer">{inv.customer || '—'} · {isDraft ? 'Unsaved draft' : `Due ${inv.due || '—'}`}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: isDraft ? 'var(--muted)' : 'var(--accent)', fontWeight: 700 }}>{fmt(total)}</div>
                <span className={`badge badge-${inv.status}`}>{inv.status}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Inventory({ products, onSync, syncStatus, syncCount, hasApiKey, lastSynced }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(new Set())

  const syncLabel = {
    idle: 'Sync',
    syncing: syncCount > 0 ? `${syncCount} synced…` : 'Syncing…',
    ok: 'Synced ✓',
    error: 'Retry Sync',
  }
  const groups = search.trim()
    ? searchGroups(groupProducts(products), search)
    : groupProducts(products)

  const toggle = (name) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Catalog <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '.8rem' }}>({groups.length})</span></h2>
            {lastSynced && <p style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Last synced {timeAgo(lastSynced)}</p>}
          </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onSync}
          disabled={!hasApiKey || syncStatus === 'syncing'}
          title={!hasApiKey ? 'Add Squarespace API key in Settings first' : ''}
        >
          <Icon name="refresh" /> {syncLabel[syncStatus] ?? 'Sync'}
        </button>
      </div>
      {!hasApiKey && (
        <p className="text-muted" style={{ fontSize: '.8rem', marginBottom: 12 }}>
          Add your Squarespace API key in Settings to sync your live catalog.
        </p>
      )}
      {syncStatus === 'error' && (
        <p style={{ color: 'var(--danger)', fontSize: '.8rem', marginBottom: 12 }}>
          Sync failed — check your API key and try again.
        </p>
      )}
      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" />
      </div>
      {groups.length === 0 && <p className="text-muted" style={{ padding: '20px 0' }}>No products found.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map(g => {
          const isOpen = expanded.has(g.name)
          const hasVariants = g.variants.length > 1 || g.variants[0]?.name !== g.name
          return (
            <div key={g.name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Group header */}
              <div
                onClick={() => hasVariants && toggle(g.name)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', cursor: hasVariants ? 'pointer' : 'default',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: 2 }}>{g.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>
                    {g.category}{hasVariants ? ` · ${g.variants.length} variants` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {!hasVariants && (
                    <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.9rem' }}>{fmt(g.variants[0].price)}</span>
                  )}
                  {hasVariants && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      style={{ color: 'var(--muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  )}
                </div>
              </div>
              {/* Variants (expanded) */}
              {hasVariants && isOpen && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {g.variants.map((v, i) => {
                    const variantLabel = v.name.includes(' — ') ? v.name.split(' — ').slice(1).join(' — ') : v.name
                    return (
                      <div key={v.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px 10px 24px',
                        borderBottom: i < g.variants.length - 1 ? '1px solid var(--border)' : 'none',
                        background: 'var(--surface)',
                      }}>
                        <div>
                          <div style={{ fontSize: '.85rem' }}>{variantLabel}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                            Stock: {v.stock >= 99 ? '∞' : v.stock}{v.stock < 5 && v.stock < 99 ? ' · Low' : ''}
                          </div>
                        </div>
                        <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.9rem' }}>{fmt(v.price)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Single variant — show stock inline */}
              {!hasVariants && (
                <div style={{ padding: '0 14px 10px', fontSize: '.72rem', color: g.variants[0].stock < 5 ? 'var(--danger)' : 'var(--muted)' }}>
                  Stock: {g.variants[0].stock >= 99 ? '∞' : g.variants[0].stock}{g.variants[0].stock < 5 ? ' · Low' : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AiSetupScreen({ onDone }) {
  const [hfToken, setHfToken] = useState(() => localStorage.getItem('sip_hf_token') || '')
  const [phase, setPhase]     = useState('prompt') // prompt | downloading | done | error
  const [progress, setProgress] = useState(0)
  const [errMsg, setErrMsg]   = useState('')

  const model = AI_MODELS.small

  const isPublic = !!model.public && model.url !== 'GDRIVE_PLACEHOLDER'

  const startDownload = async (token) => {
    const t = token.trim()
    if (t) localStorage.setItem('sip_hf_token', t)
    setPhase('downloading')
    setProgress(0)
    try {
      await gemmaDownload('small', (frac) => setProgress(frac), isPublic ? undefined : (t || undefined))
      setPhase('done')
    } catch (e) {
      if (e.name === 'AbortError') { setPhase('prompt'); return }
      setErrMsg(e.message)
      setPhase('error')
    }
  }

  const wrap = (children) => (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'calc(env(safe-area-inset-top, 0) + 32px) 24px 32px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>{children}</div>
    </div>
  )

  if (phase === 'prompt') return wrap(
    <>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>Set up on-device AI</h2>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.6 }}>
          Download a small AI model ({model.size}) that runs fully on your device to improve product matching in Smart Paste.
        </p>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: '.9rem' }}>{model.label}</span>
          <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{model.size}</span>
        </div>
        <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{model.description} · one-time download · zero network after</p>
      </div>
      {!isPublic && (
        <div className="field">
          <label>HuggingFace Token <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(required)</span></label>
          <input
            type="password"
            placeholder="hf_…"
            value={hfToken}
            onChange={e => setHfToken(e.target.value)}
          />
          <p style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>
            Free account at huggingface.co → Settings → Tokens → New token (Read).
            Accept the model licence at huggingface.co/litert-community/gemma-3-270m-it-litert-lm first.
          </p>
        </div>
      )}
      <button
        className="btn btn-primary btn-full"
        style={{ marginBottom: 10 }}
        disabled={!isPublic && !hfToken.trim()}
        onClick={() => startDownload(hfToken)}
      >
        Download &amp; Set Up AI
      </button>
      <button className="btn btn-ghost btn-full" onClick={onDone}>Skip for now</button>
    </>
  )

  if (phase === 'downloading') return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⬇️</div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>Downloading AI model…</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.82rem', marginBottom: 24 }}>This happens once. The model stays on your device.</p>
      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width .4s' }} />
      </div>
      <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 20 }}>{Math.round(progress * 100)}% — {model.size}</p>
      <button className="btn btn-ghost btn-sm" onClick={() => { gemmaCancelDownload(); setPhase('prompt') }}>Cancel</button>
    </div>
  )

  if (phase === 'done') return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success)', marginBottom: 8 }}>AI ready!</h2>
      <p style={{ color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 28 }}>
        Smart Paste will now use on-device AI to improve low-confidence matches automatically.
      </p>
      <button className="btn btn-primary btn-full" onClick={onDone}>Let's go →</button>
    </div>
  )

  // error
  return wrap(
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>Download failed</h2>
      <div style={{ background: 'rgba(224,82,82,.08)', border: '1px solid rgba(224,82,82,.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 12, textAlign: 'left' }}>
        <p style={{ fontSize: '.75rem', color: '#f87171', fontFamily: 'monospace', wordBreak: 'break-all' }}>{errMsg}</p>
      </div>
      <button className="btn btn-primary btn-full" style={{ marginBottom: 10 }} onClick={() => setPhase('prompt')}>Try again</button>
      <button className="btn btn-ghost btn-full" onClick={onDone}>Skip for now</button>
    </div>
  )
}

function HfTokenGuide() {
  const [open, setOpen] = useState(false)
  const step = (n, text) => (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: '.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</div>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>{text}</p>
    </div>
  )
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ fontSize: '.75rem', marginBottom: open ? 10 : 0, width: '100%', justifyContent: 'space-between' }}
        onClick={() => setOpen(o => !o)}
      >
        <span>How to get a HuggingFace token</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 14px 4px' }}>
          {step(1, 'Go to huggingface.co and click Sign Up. Create a free account — no payment needed.')}
          {step(2, 'Once logged in, open the model page: huggingface.co/litert-community/gemma-3-1b-it-litert-lm')}
          {step(3, 'Click "Agree and access repository" to accept the Gemma licence. You must do this or downloads will fail with 401.')}
          {step(4, 'Go to huggingface.co/settings/tokens and click "New token". Give it any name, set role to Read, and click Generate.')}
          {step(5, 'Copy the token (starts with hf_…) and paste it into the field below. Then click Download on your chosen model.')}
        </div>
      )}
    </div>
  )
}

function Settings({ settings, onSave, aiModelId, aiDownloaded, aiDownloadProgress, aiDownloading, aiLoading, aiReady, onAiSelect, onAiDownload, onAiDelete, onAiLoad }) {
  const [s, setS] = useState(settings)
  const [testStatus, setTestStatus] = useState('idle') // idle | testing | ok | error
  const [testError, setTestError] = useState('')
  const set = (k, v) => setS(p => ({ ...p, [k]: v }))

  const handleTest = async () => {
    if (!s.sqApiKey) return
    setTestStatus('testing')
    try {
      await fetchSquarespaceProducts(s.sqApiKey)
      setTestStatus('ok')
      setTestError('')
    } catch (e) {
      setTestStatus('error')
      setTestError(e.message)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 20 }}>Settings</h2>

      <div className="settings-section">
        <h2>Business</h2>
        <div className="field"><label>Business Name</label><input value={s.businessName} onChange={e => set('businessName', e.target.value)} /></div>
        <div className="field"><label>Email</label><input value={s.email} onChange={e => set('email', e.target.value)} type="email" /></div>
        <div className="field"><label>Phone</label><input value={s.phone} onChange={e => set('phone', e.target.value)} type="tel" /></div>
        <div className="field"><label>Address</label><textarea value={s.address} onChange={e => set('address', e.target.value)} /></div>
        <div className="field">
          <label>Currency</label>
          <select
            value={s.currency || 'GBP'}
            onChange={e => {
              const cur = e.target.value
              const suggested = CURRENCY_TAX[cur]?.tax
              set('currency', cur)
              if (suggested !== undefined) set('defaultTax', suggested)
            }}
          >
            {Object.entries(CURRENCY_TAX).map(([code, { label }]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Default Tax %</label>
          <input value={s.defaultTax} onChange={e => set('defaultTax', e.target.value)} type="number" min="0" max="100" step="0.1" />
          <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
            Auto-suggested from currency. Override if needed.
          </p>
        </div>
      </div>

      <div className="settings-section">
        <h2>Squarespace Integration</h2>
        <div className="field">
          <label>API Key</label>
          <input value={s.sqApiKey} onChange={e => set('sqApiKey', e.target.value)} type="password" placeholder="sq_…" />
        </div>
        <div className="field">
          <label>Store Domain</label>
          <input value={s.sqDomain} onChange={e => set('sqDomain', e.target.value)} placeholder="yourstore.squarespace.com" />
        </div>
        <button
          className="btn btn-ghost btn-sm mb-8"
          onClick={handleTest}
          disabled={!s.sqApiKey || testStatus === 'testing'}
        >
          {{ idle: 'Test Connection', testing: 'Testing…', ok: '✓ Connected', error: '✗ Failed — check key' }[testStatus]}
        </button>
        {testError ? <p style={{ fontSize: '0.75rem', color: '#f87171', marginTop: 6, wordBreak: 'break-all' }}>{testError}</p> : null}
      </div>

      <div className="settings-section">
        <h2>On-Device AI</h2>
        {!hasWebGPU() ? (
          <div className="card" style={{ marginBottom: 0 }}>
            <p style={{ fontSize: '.82rem', color: 'var(--danger)' }}>⚠ WebGPU not available in this browser. AI matching requires Chrome 113+ or Edge 113+.</p>
          </div>
        ) : (
          <>
            <p className="text-muted" style={{ fontSize: '.78rem', marginBottom: 12, lineHeight: 1.5 }}>
              Download once · runs fully on-device · used to improve Smart Paste matches below 65% confidence.
            </p>
            <HfTokenGuide />
            <div className="field">
              <label>HuggingFace Token</label>
              <input
                type="password"
                placeholder="hf_…"
                defaultValue={localStorage.getItem('sip_hf_token') || ''}
                onChange={e => localStorage.setItem('sip_hf_token', e.target.value.trim())}
              />
            </div>
            {Object.values(AI_MODELS).map(m => {
              const isSelected   = aiModelId === m.id
              const downloaded   = !!aiDownloaded[m.id]
              const downloading  = aiDownloading === m.id
              const progress     = aiDownloadProgress[m.id] ?? 0
              const loaded       = aiReady && getLoadedModelId() === m.id

              return (
                <div key={m.id} className="card" style={{ marginBottom: 8, border: isSelected ? '1px solid var(--accent)' : undefined }}
                  onClick={() => onAiSelect(m.id)}>
                  <div className="flex-between mb-4">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`, background: isSelected ? 'var(--accent)' : 'transparent', flexShrink: 0 }} />
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '.88rem' }}>{m.label}</span>
                        {m.id === 'small' && <span style={{ fontSize: '.68rem', color: 'var(--accent)', marginLeft: 6 }}>Recommended</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{m.size}</span>
                  </div>
                  <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginBottom: downloading || downloaded ? 8 : 0 }}>{m.description}</p>

                  {downloading && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--muted)', marginBottom: 4 }}>
                        <span>Downloading…</span><span>{Math.round(progress * 100)}%</span>
                      </div>
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${progress * 100}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width .3s' }} />
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: '.72rem' }} onClick={e => { e.stopPropagation(); gemmaCancelDownload() }}>Cancel</button>
                    </div>
                  )}

                  {downloaded && !downloading && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {loaded ? (
                        <span style={{ fontSize: '.75rem', color: 'var(--success)', alignSelf: 'center' }}>✓ Loaded &amp; ready</span>
                      ) : (
                        <button className="btn btn-primary btn-sm" style={{ fontSize: '.75rem' }}
                          disabled={aiLoading}
                          onClick={e => { e.stopPropagation(); onAiLoad(m.id) }}>
                          {aiLoading && aiModelId === m.id ? 'Loading…' : 'Load into memory'}
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: '.75rem', color: 'var(--danger)' }}
                        onClick={e => { e.stopPropagation(); onAiDelete(m.id) }}>
                        Delete
                      </button>
                    </div>
                  )}

                  {!downloaded && !downloading && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '.75rem', alignSelf: 'flex-start' }}
                      onClick={e => { e.stopPropagation(); onAiDownload(m.id) }}>
                      Download {m.size}
                    </button>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      <button className="btn btn-primary btn-sm" style={{ marginTop: 16, alignSelf: 'flex-start' }} onClick={() => onSave(s)}>
        <Icon name="check" /> Save Settings
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// Pick sheet
// ════════════════════════════════════════════════════════════════════════════════

function PickSheet({ order, picks, onPickChange, onClose }) {
  const orderPicks = picks[order.id] ?? {}
  const totalQty  = order.lineItems.reduce((s, li) => s + li.qty, 0)
  const pickedQty = order.lineItems.reduce((s, li, i) => s + Math.min(orderPicks[i] ?? 0, li.qty), 0)
  const allDone   = totalQty > 0 && pickedQty === totalQty

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top, 0)',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Pick #{order.orderNumber}</h2>
          <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>{order.customer}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Done</button>
      </div>

      {/* Progress */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', marginBottom: 6 }}>
          <span style={{ color: 'var(--muted)' }}>{pickedQty} of {totalQty} items picked</span>
          {allDone && <span style={{ color: 'var(--success)', fontWeight: 600 }}>All picked ✓</span>}
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3, transition: 'width .25s, background .25s',
            width: `${totalQty > 0 ? (pickedQty / totalQty) * 100 : 0}%`,
            background: allDone ? 'var(--success)' : 'var(--accent)',
          }} />
        </div>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {order.lineItems.map((li, i) => {
          const picked = orderPicks[i] ?? 0
          const done   = picked >= li.qty
          return (
            <div key={i} className="card" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: done ? 0.7 : 1, transition: 'opacity .2s',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '.88rem', fontWeight: 600,
                  textDecoration: done ? 'line-through' : 'none',
                  color: done ? 'var(--success)' : 'var(--text)',
                }}>{li.name}</div>
                {li.qty > 1 && (
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>Need {li.qty}</div>
                )}
              </div>

              {li.qty === 1 ? (
                /* Checkbox for single items */
                <button
                  onClick={() => onPickChange(order.id, i, done ? 0 : 1)}
                  style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                    border: `2px solid ${done ? 'var(--success)' : 'var(--border)'}`,
                    background: done ? 'var(--success)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  {done && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </button>
              ) : (
                /* Stepper for qty > 1 */
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => onPickChange(order.id, i, Math.max(0, picked - 1))}
                    disabled={picked === 0}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)',
                      background: 'var(--surface)', cursor: 'pointer', fontSize: '1.3rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text)', opacity: picked === 0 ? 0.3 : 1,
                    }}>−</button>
                  <span style={{
                    minWidth: 44, textAlign: 'center', fontWeight: 700, fontSize: '.95rem',
                    color: done ? 'var(--success)' : 'var(--text)',
                  }}>{picked}/{li.qty}</span>
                  <button
                    onClick={() => onPickChange(order.id, i, Math.min(li.qty, picked + 1))}
                    disabled={picked >= li.qty}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border)',
                      background: 'var(--surface)', cursor: 'pointer', fontSize: '1.3rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text)', opacity: picked >= li.qty ? 0.3 : 1,
                    }}>+</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// Orders screen
// ════════════════════════════════════════════════════════════════════════════════

function Orders({ orders, onSync, syncStatus, syncCount, hasApiKey, lastSynced, picks, onPickChange }) {
  const [expanded, setExpanded] = useState(null)
  const [picking, setPicking]   = useState(null) // order being picked
  const [filter, setFilter] = useState('all')
  const syncLabel = {
    idle: 'Sync',
    syncing: syncCount > 0 ? `${syncCount} fetched…` : 'Syncing…',
    ok: 'Synced ✓',
    error: 'Retry',
  }

  const visible = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Orders <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '.8rem' }}>({visible.length})</span></h2>
          {lastSynced && <p style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Last synced {timeAgo(lastSynced)}</p>}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onSync}
          disabled={!hasApiKey || syncStatus === 'syncing'}
          title={!hasApiKey ? 'Add Squarespace API key in Settings first' : ''}
        >
          <Icon name="refresh" /> {syncLabel[syncStatus] ?? 'Sync'}
        </button>
      </div>

      {!hasApiKey && (
        <p className="text-muted" style={{ fontSize: '.8rem', marginBottom: 12 }}>
          Add your Squarespace API key in Settings to sync orders.
        </p>
      )}
      {syncStatus === 'error' && (
        <p style={{ color: 'var(--danger)', fontSize: '.8rem', marginBottom: 12 }}>Sync failed — check API key.</p>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {['all', 'PENDING', 'FULFILLED', 'CANCELED'].map(f => (
          <span key={f} className="chip"
            style={filter === f ? { background: 'rgba(245,166,35,.3)' } : {}}
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </span>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-muted" style={{ padding: '20px 0' }}>
          {orders.length === 0 ? 'No orders synced yet.' : 'No orders match this filter.'}
        </p>
      )}

      {visible.map(o => {
        const isOpen    = expanded === o.id
        const isPending = o.status === 'PENDING'
        const dateStr   = o.createdOn ? new Date(o.createdOn).toLocaleDateString() : '—'
        const orderPicks = picks[o.id] ?? {}
        const totalQty   = o.lineItems.reduce((s, li) => s + li.qty, 0)
        const pickedQty  = o.lineItems.reduce((s, li, i) => s + Math.min(orderPicks[i] ?? 0, li.qty), 0)
        const pickStarted = pickedQty > 0

        return (
          <div key={o.id} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 10 }}>
            <div
              onClick={() => setExpanded(isOpen ? null : o.id)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: '.9rem' }}>#{o.orderNumber}</span>
                  <span className={`badge badge-${o.status}`}>{o.status.charAt(0) + o.status.slice(1).toLowerCase()}</span>
                  {pickStarted && (
                    <span style={{ fontSize: '.68rem', color: pickedQty === totalQty ? 'var(--success)' : 'var(--accent)', fontWeight: 600 }}>
                      {pickedQty === totalQty ? '✓ Picked' : `${pickedQty}/${totalQty} picked`}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{o.customer} · {dateStr}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.9rem' }}>{fmt(o.total)}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{ color: 'var(--muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 14px' }}>
                {o.email && <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8 }}>{o.email}</p>}
                {o.lineItems.map((li, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>{li.name} × {li.qty}</span>
                    <span style={{ color: 'var(--text)' }}>{fmt(li.price * li.qty)}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Total</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmt(o.total)}</span>
                </div>
                {isPending && (
                  <button
                    className="btn btn-primary btn-full"
                    style={{ marginTop: 10 }}
                    onClick={(e) => { e.stopPropagation(); setPicking(o) }}
                  >
                    {pickStarted ? `Resume Pick (${pickedQty}/${totalQty})` : 'Start Pick'}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {picking && (
        <PickSheet
          order={picking}
          picks={picks}
          onPickChange={onPickChange}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════════════════

function timeAgo(ts) {
  if (!ts) return null
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ════════════════════════════════════════════════════════════════════════════════
// Pull-to-refresh
// ════════════════════════════════════════════════════════════════════════════════

function PullToRefresh({ onRefresh, enabled = true, children }) {
  const [ptState, setPtState] = useState('idle') // idle | pulling | refreshing
  const [pullPct, setPullPct] = useState(0)
  const startY = useRef(null)
  const THRESHOLD = 80

  useEffect(() => {
    if (!enabled) return
    const onStart = (e) => {
      if (window.scrollY <= 0) startY.current = e.touches[0].clientY
    }
    const onMove = (e) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy > 0) {
        setPtState('pulling')
        setPullPct(Math.min(dy / THRESHOLD, 1))
      }
    }
    const onEnd = async (e) => {
      if (startY.current === null) return
      const dy = e.changedTouches[0].clientY - startY.current
      const didPull = dy >= THRESHOLD
      startY.current = null
      setPullPct(0)
      if (didPull) {
        setPtState('refreshing')
        try { await onRefresh() } finally { setPtState('idle') }
      } else {
        setPtState('idle')
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [enabled, onRefresh])

  const visible = ptState === 'pulling' || ptState === 'refreshing'
  return (
    <>
      {visible && (
        <div style={{
          position: 'fixed',
          top: 'calc(56px + env(safe-area-inset-top, 0))',
          left: 0, right: 0, display: 'flex', justifyContent: 'center',
          padding: '8px 0', zIndex: 50, pointerEvents: 'none',
        }}>
          <div className="ptr-spinner" style={{
            animation: ptState === 'refreshing' ? 'spin .7s linear infinite' : 'none',
            transform: ptState === 'pulling' ? `rotate(${pullPct * 270}deg)` : undefined,
            opacity: ptState === 'pulling' ? 0.4 + pullPct * 0.6 : 1,
          }} />
        </div>
      )}
      {children}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// Onboarding (multi-phase: key → details → ready)
// ════════════════════════════════════════════════════════════════════════════════

function Onboarding({ onConnect, onDemo }) {
  const [phase, setPhase] = useState('key') // key | details | ready
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState('idle') // idle | connecting | error
  const [errMsg, setErrMsg] = useState('')
  const [fetchedProducts, setFetchedProducts] = useState([])
  const [biz, setBiz] = useState({ businessName: '', email: '', phone: '', address: '', currency: 'GBP', defaultTax: '20' })
  const [syncCount, setSyncCount] = useState(0)

  const handleConnect = async () => {
    if (!apiKey.trim()) return
    setStatus('connecting')
    setErrMsg('')
    setSyncCount(0)
    try {
      const prods = await fetchSquarespaceProducts(apiKey.trim(), setSyncCount)
      setFetchedProducts(prods)
      setStatus('idle')
      setPhase('details')
    } catch (e) {
      setStatus('error')
      setErrMsg(e.message || 'Could not connect — check your API key and try again.')
    }
  }

  const wrap = (children) => (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 'calc(env(safe-area-inset-top, 0) + 32px) 24px 32px',
    }}>
      {children}
    </div>
  )

  if (phase === 'key') return wrap(
    <div style={{ width: '100%', maxWidth: 400 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 8 }}>Smart Invoice Pro</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Connect your Squarespace store to get started.</p>
      </div>
      <div className="field">
        <label>Squarespace API Key</label>
        <input
          type="password"
          placeholder="Paste your API key here"
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); setStatus('idle'); setErrMsg('') }}
          onKeyDown={e => e.key === 'Enter' && handleConnect()}
        />
      </div>
      {errMsg && (
        <div style={{ background: 'rgba(224,82,82,.1)', border: '1px solid rgba(224,82,82,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ color: '#f87171', fontSize: '.85rem', fontWeight: 600, marginBottom: 4 }}>Connection failed</p>
          <p style={{ color: 'var(--muted)', fontSize: '.78rem', wordBreak: 'break-all', lineHeight: 1.5 }}>{errMsg}</p>
          <p style={{ color: 'var(--muted)', fontSize: '.78rem', marginTop: 6 }}>Double-check your key in Squarespace → Settings → Advanced → API Keys and try again.</p>
        </div>
      )}
      <button
        className="btn btn-primary btn-full"
        onClick={handleConnect}
        disabled={!apiKey.trim() || status === 'connecting'}
        style={{ marginBottom: 12 }}
      >
        {status === 'connecting'
          ? (syncCount > 0 ? `${syncCount} products synced…` : 'Connecting…')
          : 'Connect Store'}
      </button>
      <button className="btn btn-ghost btn-full" onClick={onDemo}>Try Demo</button>
      <p style={{ color: 'var(--muted)', fontSize: '.75rem', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
        Squarespace → Settings → Advanced → API Keys
      </p>
    </div>
  )

  if (phase === 'details') return wrap(
    <div style={{ width: '100%', maxWidth: 400 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(76,175,132,.15)', border: '2px solid var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 24 }}>✓</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 6 }}>Store connected!</h2>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem' }}>{fetchedProducts.length} product{fetchedProducts.length !== 1 ? 's' : ''} synced. Now set up your business details.</p>
      </div>
      {[
        ['Business Name *', 'businessName', 'text', 'Acme Services'],
        ['Email', 'email', 'email', 'billing@example.com'],
        ['Phone', 'phone', 'tel', '+1 555 000 0000'],
        ['Address', 'address', 'text', '123 Main St, City, State'],
      ].map(([lbl, key, type, ph]) => (
        <div className="field" key={key}>
          <label>{lbl}</label>
          <input type={type} placeholder={ph} value={biz[key]} onChange={e => setBiz(b => ({ ...b, [key]: e.target.value }))} />
        </div>
      ))}
      <div className="field">
        <label>Currency</label>
        <select
          value={biz.currency}
          onChange={e => {
            const cur = e.target.value
            const suggested = CURRENCY_TAX[cur]?.tax
            setBiz(b => ({ ...b, currency: cur, ...(suggested !== undefined ? { defaultTax: String(suggested) } : {}) }))
          }}
        >
          {Object.entries(CURRENCY_TAX).map(([code, { label }]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Default Tax Rate (%)</label>
        <input type="number" placeholder="20" min="0" max="100" step="0.1" value={biz.defaultTax} onChange={e => setBiz(b => ({ ...b, defaultTax: e.target.value }))} />
        <p style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>Auto-suggested from currency. Override if needed.</p>
      </div>
      <button
        className="btn btn-primary btn-full"
        disabled={!biz.businessName.trim()}
        onClick={() => setPhase('ready')}
      >
        Save & Continue
      </button>
    </div>
  )

  // phase === 'ready'
  return wrap(
    <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent)', marginBottom: 10 }}>You're all set!</h2>
      <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: 28, fontSize: '.9rem' }}>
        You can update your business name, tax rate, and other details anytime from the{' '}
        <strong style={{ color: 'var(--text)' }}>Settings</strong> tab.
      </p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 8px', display: 'flex', justifyContent: 'space-around', marginBottom: 28 }}>
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'invoices',  label: 'Invoices'  },
          { id: 'inventory', label: 'Catalog'   },
          { id: 'settings',  label: 'Settings'  },
        ].map(item => (
          <div key={item.id} style={{ pointerEvents: 'none' }}
            className={`nav-btn${item.id === 'settings' ? ' glow' : ''}`}>
            <Icon name={item.id === 'inventory' ? 'inventory' : item.id} />
            <span style={{ fontSize: '.6rem' }}>{item.label}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-full" onClick={() => onConnect(apiKey.trim(), fetchedProducts, biz)}>
        Let's Go →
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// Tour overlay (6 steps on top of running app)
// ════════════════════════════════════════════════════════════════════════════════

const TOUR_STEPS = [
  {
    title: 'Your dashboard at a glance',
    body: 'Revenue collected, outstanding balances, and recent activity — all updated in real time as you create and update invoices.',
    target: 'stat-grid',
    cta: 'Next →',
  },
  {
    title: 'Create an invoice in seconds',
    body: 'Tap New Invoice to start. Add customer details, pick products from your catalog, and totals calculate automatically.',
    target: 'new-invoice',
    cta: 'Next →',
  },
  {
    title: 'Invoice history',
    body: 'See all your invoices — paid, pending, and overdue. Tap any row to edit or resend it.',
    target: 'nav-invoices',
    cta: 'Next →',
  },
  {
    title: 'Squarespace orders',
    body: 'Orders sync directly from your store. Open a pending order and tap Start Pick to track what you\'ve packed.',
    target: 'nav-orders',
    cta: 'Next →',
  },
  {
    title: 'Your live product catalog',
    body: 'All your Squarespace products, synced and ready to add to any invoice. Tap a group to see variants and pricing.',
    target: 'nav-inventory',
    cta: 'Next →',
  },
  {
    title: 'Settings & Smart Paste',
    body: 'Manage your API key and business details here. In the invoice editor, Smart Paste reads an order email and auto-matches your catalog.',
    target: 'nav-settings',
    cta: "Got it — let's go!",
  },
]

function TourOverlay({ step, onNext, onSkip }) {
  const [rect, setRect] = useState(null)
  const s = TOUR_STEPS[step]

  useEffect(() => {
    if (!s) return
    const read = () => {
      const el = document.querySelector(`[data-tour="${s.target}"]`)
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom })
      } else {
        setRect(null)
      }
    }
    read()
    const t = setTimeout(read, 380)
    return () => clearTimeout(t)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null

  const PAD = 8
  const MARGIN = 14
  const WIN_H = typeof window !== 'undefined' ? window.innerHeight : 800

  const sTop    = rect ? rect.top - PAD    : 0
  const sBottom = rect ? rect.bottom + PAD : 0

  const spaceBelow = WIN_H - sBottom
  const tipBelow   = !rect || spaceBelow >= sTop

  return (
    <>
      {/* Click blocker — prevents accidental taps on app while tour is open */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} />

      {/* Spotlight — cuts a hole in the dark overlay via box-shadow */}
      {rect ? (
        <div style={{
          position: 'fixed',
          top: sTop,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          borderRadius: 12,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.75)',
          zIndex: 200,
          pointerEvents: 'none',
        }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, pointerEvents: 'none' }} />
      )}

      {/* Tooltip card */}
      <div style={{
        position: 'fixed',
        left: 16,
        right: 16,
        zIndex: 201,
        ...(tipBelow
          ? { top: rect ? sBottom + MARGIN : WIN_H / 2 - 80 }
          : { bottom: WIN_H - sTop + MARGIN }
        ),
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '16px 16px 12px',
        boxShadow: '0 8px 40px rgba(0,0,0,.7)',
      }}>
        {/* Progress dots + skip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 20 : 6, height: 6, borderRadius: 3,
                background: i <= step ? 'var(--accent)' : 'var(--border)',
                transition: 'width .25s, background .25s',
              }} />
            ))}
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '.8rem', cursor: 'pointer', padding: '4px 0' }}
            onClick={onSkip}
          >
            Skip tour
          </button>
        </div>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>{s.title}</h2>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, fontSize: '.86rem', marginBottom: 14 }}>{s.body}</p>
        <button className="btn btn-primary btn-full" style={{ marginBottom: 4 }} onClick={onNext}>
          {s.cta}
        </button>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// Root App
// ════════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('sip_onboarded'))
  const [aiSetupDone, setAiSetupDone] = useState(() => !!localStorage.getItem('sip_ai_setup_done'))
  const [tourStep, setTourStep]   = useState(null) // null = no tour, 0-5 = tour active
  const [tab, setTab]             = useState(() => localStorage.getItem('sip_draft_edit') ? 'invoices' : 'dashboard')
  const [invoices, setInvoices]   = useState([])
  const [products, setProducts]   = useState(() => {
    const s = localStorage.getItem('sip_products')
    return s ? JSON.parse(s) : SAMPLE_PRODUCTS
  })
  const [lastSynced, setLastSynced] = useState(() => {
    const ts = localStorage.getItem('sip_products_synced_at')
    return ts ? parseInt(ts, 10) : null
  })
  const [orders, setOrders] = useState(() => {
    const s = localStorage.getItem('sip_orders')
    return s ? JSON.parse(s) : []
  })
  const [lastOrderSync, setLastOrderSync] = useState(() => {
    const ts = localStorage.getItem('sip_orders_synced_at')
    return ts ? parseInt(ts, 10) : null
  })
  const [orderSyncStatus, setOrderSyncStatus] = useState('idle')
  const [orderSyncCount, setOrderSyncCount] = useState(0)
  const [picks, setPicks] = useState(() => {
    const s = localStorage.getItem('sip_picks')
    return s ? JSON.parse(s) : {}
  })
  const [syncStatus, setSyncStatus] = useState('idle') // idle | syncing | ok | error
  const [syncCount, setSyncCount] = useState(0)
  const [editing, setEditing]     = useState(() => {
    const draft = localStorage.getItem('sip_draft_edit')
    return draft ? JSON.parse(draft) : null
  })
  const [editingOriginal, setEditingOriginal] = useState(() => {
    const orig = localStorage.getItem('sip_draft_original')
    return orig ? JSON.parse(orig) : null
  })
  const [editorOpen, setEditorOpen] = useState(() => !!localStorage.getItem('sip_draft_edit'))
  const [settings, setSettings]   = useState(() => {
    const saved = localStorage.getItem('sip_settings')
    const s = saved ? JSON.parse(saved) : {}
    const defaults = {
      businessName: 'My Business',
      email: '',
      phone: '',
      address: '',
      defaultTax: 20,
      currency: 'GBP',
      sqApiKey: '',
      sqDomain: '',
    }
    const merged = { ...defaults, ...s }
    _currency = merged.currency || 'GBP'
    return merged
  })

  useEffect(() => {
    const saved = localStorage.getItem('sip_invoices')
    if (saved) setInvoices(JSON.parse(saved))
  }, [])

  // Keep module-level currency in sync
  useEffect(() => { _currency = settings.currency || 'GBP' }, [settings.currency])

  const saveInvoices = useCallback((invs) => {
    setInvoices(invs)
    localStorage.setItem('sip_invoices', JSON.stringify(invs))
  }, [])

  const saveProducts = useCallback((prods) => {
    setProducts(prods)
    const ts = Date.now()
    setLastSynced(ts)
    localStorage.setItem('sip_products', JSON.stringify(prods))
    localStorage.setItem('sip_products_synced_at', String(ts))
  }, [])

  const handleSyncCatalog = useCallback(async () => {
    if (!settings.sqApiKey) return
    setSyncStatus('syncing')
    setSyncCount(0)
    try {
      const fetched = await fetchSquarespaceProducts(settings.sqApiKey, setSyncCount)
      saveProducts(fetched)
      setSyncStatus('ok')
    } catch {
      setSyncStatus('error')
    }
  }, [settings.sqApiKey, saveProducts])

  const savePick = useCallback((orderId, itemIndex, qty) => {
    setPicks(prev => {
      const next = { ...prev, [orderId]: { ...(prev[orderId] ?? {}), [itemIndex]: qty } }
      localStorage.setItem('sip_picks', JSON.stringify(next))
      return next
    })
  }, [])

  const handleSyncOrders = useCallback(async () => {
    if (!settings.sqApiKey) return
    setOrderSyncStatus('syncing')
    setOrderSyncCount(0)
    try {
      const fetched = await fetchSquarespaceOrders(settings.sqApiKey, setOrderSyncCount)
      setOrders(fetched)
      // Clean up picks: remove if order gone or no longer PENDING
      const pendingIds = new Set(fetched.filter(o => o.status === 'PENDING').map(o => o.id))
      setPicks(prev => {
        const next = {}
        for (const id of Object.keys(prev)) {
          if (pendingIds.has(id)) next[id] = prev[id]
        }
        localStorage.setItem('sip_picks', JSON.stringify(next))
        return next
      })
      const ts = Date.now()
      setLastOrderSync(ts)
      localStorage.setItem('sip_orders', JSON.stringify(fetched))
      localStorage.setItem('sip_orders_synced_at', String(ts))
      setOrderSyncStatus('ok')
    } catch {
      setOrderSyncStatus('error')
    }
  }, [settings.sqApiKey])

  const handleDraftChange = useCallback((inv) => setEditing(inv), [])

  // ── AI / Gemma state ────────────────────────────────────────────────────────
  const [aiModelId, setAiModelId] = useState(() => localStorage.getItem('sip_ai_model') || 'small')
  const [aiDownloaded, setAiDownloaded] = useState({})       // { modelId: bool }
  const [aiDownloadProgress, setAiDownloadProgress] = useState({}) // { modelId: 0-1 }
  const [aiDownloading, setAiDownloading] = useState(null)   // modelId | null
  const [aiLoading, setAiLoading] = useState(false)          // loading into WebGPU
  const [aiReady, setAiReady] = useState(false)              // model is in memory

  // Check downloaded models on mount, then auto-load the selected model if available
  useEffect(() => {
    if (!hasWebGPU()) return
    if (isGemmaReady()) {
      // Already loaded this session (e.g. hot reload)
      setAiModelId(getLoadedModelId() || 'small')
      setAiReady(true)
      Promise.all(Object.keys(AI_MODELS).map(async id => [id, await isModelDownloaded(id)]))
        .then(entries => setAiDownloaded(Object.fromEntries(entries)))
      return
    }
    Promise.all(Object.keys(AI_MODELS).map(async id => [id, await isModelDownloaded(id)]))
      .then(entries => {
        const downloaded = Object.fromEntries(entries)
        setAiDownloaded(downloaded)
        const modelId = localStorage.getItem('sip_ai_model') || 'small'
        if (downloaded[modelId]) {
          setAiLoading(true)
          gemmaInit(modelId)
            .then(() => { setAiReady(true); setAiModelId(modelId) })
            .catch(e => console.warn('[SIP] auto-load failed:', e.message))
            .finally(() => setAiLoading(false))
        }
      })
  }, [])

  const handleAiSelectModel = (id) => {
    setAiModelId(id)
    localStorage.setItem('sip_ai_model', id)
    if (getLoadedModelId() === id) setAiReady(true)
    else setAiReady(false)
  }

  const handleAiDownload = async (id) => {
    setAiDownloading(id)
    setAiDownloadProgress(p => ({ ...p, [id]: 0 }))
    try {
      const hfToken = localStorage.getItem('sip_hf_token') || ''
      await gemmaDownload(id, (frac) => setAiDownloadProgress(p => ({ ...p, [id]: frac })), hfToken)
      setAiDownloaded(d => ({ ...d, [id]: true }))
      setAiDownloadProgress(p => ({ ...p, [id]: 1 }))
    } catch (e) {
      if (e.name !== 'AbortError') alert(`Download failed: ${e.message}`)
    } finally {
      setAiDownloading(null)
    }
  }

  const handleAiDelete = async (id) => {
    await gemmaDelete(id)
    setAiDownloaded(d => ({ ...d, [id]: false }))
    if (aiModelId === id) setAiReady(false)
  }

  const handleAiLoad = async (id) => {
    setAiLoading(true)
    try {
      await gemmaInit(id)
      setAiReady(true)
      setAiModelId(id)
      localStorage.setItem('sip_ai_model', id)
    } catch (e) {
      alert(`Failed to load model: ${e.message}`)
    } finally {
      setAiLoading(false)
    }
  }

  const handleOnboardConnect = (apiKey, fetchedProducts, bizDetails) => {
    const newSettings = {
      ...settings,
      sqApiKey: apiKey,
      businessName: bizDetails.businessName || 'My Business',
      email: bizDetails.email || '',
      phone: bizDetails.phone || '',
      address: bizDetails.address || '',
      currency: bizDetails.currency || 'GBP',
      defaultTax: parseFloat(bizDetails.defaultTax) || 20,
    }
    setSettings(newSettings)
    localStorage.setItem('sip_settings', JSON.stringify(newSettings))
    if (fetchedProducts?.length) saveProducts(fetchedProducts)
    localStorage.setItem('sip_onboarded', 'real')
    setOnboarded(true)
  }

  const handleOnboardDemo = () => {
    saveInvoices(SAMPLE_INVOICES)
    localStorage.setItem('sip_onboarded', 'demo')
    setOnboarded(true)
  }

  const handleAiSetupDone = () => {
    localStorage.setItem('sip_ai_setup_done', '1')
    localStorage.setItem('sip_ai_model', 'small')
    setAiModelId('small')
    setAiSetupDone(true)
    setTourStep(0)
    // Refresh downloaded state so Settings reflects the new model
    Promise.all(
      Object.keys(AI_MODELS).map(async id => [id, await isModelDownloaded(id)])
    ).then(entries => setAiDownloaded(Object.fromEntries(entries)))
  }

  if (!onboarded) {
    return (
      <ErrorBoundary>
        <style>{CSS}</style>
        <Onboarding onConnect={handleOnboardConnect} onDemo={handleOnboardDemo} />
      </ErrorBoundary>
    )
  }

  if (!aiSetupDone && hasWebGPU()) {
    return (
      <ErrorBoundary>
        <style>{CSS}</style>
        <AiSetupScreen onDone={handleAiSetupDone} />
      </ErrorBoundary>
    )
  }

  if (!aiSetupDone) {
    // No WebGPU — skip setup entirely
    localStorage.setItem('sip_ai_setup_done', '1')
    setAiSetupDone(true)
    setTourStep(0)
  }

  const clearDraft = () => {
    localStorage.removeItem('sip_draft_edit')
    localStorage.removeItem('sip_draft_original')
  }

  const openEditor = (inv) => {
    localStorage.setItem('sip_draft_original', JSON.stringify(inv))
    setEditingOriginal(inv)
    setEditing(inv)
    setEditorOpen(true)
    setTab('invoices')
  }

  const handleNewInvoice = () => openEditor(blankInvoice(invoices))
  const handleEdit = (inv) => openEditor({ ...inv })

  const handleSave = (inv) => {
    const idx = invoices.findIndex(i => i.id === inv.id)
    const updated = idx >= 0
      ? invoices.map((i, n) => n === idx ? inv : i)
      : [...invoices, inv]
    saveInvoices(updated)
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  // Cancel: revert to original state, stay in editor
  const handleCancelEdit = (revertTo) => {
    setEditing(revertTo)
    localStorage.setItem('sip_draft_edit', JSON.stringify(revertTo))
  }

  // Discard: clear draft entirely, close editor
  const handleDiscardEdit = () => {
    clearDraft()
    setEditing(null)
    setEditingOriginal(null)
    setEditorOpen(false)
  }

  const handleSaveSettings = (s) => {
    setSettings(s)
    localStorage.setItem('sip_settings', JSON.stringify(s))
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'invoices',  label: 'Invoices',  icon: 'invoice'   },
    { id: 'orders',    label: 'Orders',    icon: 'orders'    },
    { id: 'inventory', label: 'Catalog',   icon: 'inventory' },
    { id: 'settings',  label: 'Settings',  icon: 'settings'  },
  ]

  return (
    <ErrorBoundary>
      <style>{CSS}</style>
      {tourStep !== null && (
        <TourOverlay
          step={tourStep}
          onNext={() => tourStep < TOUR_STEPS.length - 1 ? setTourStep(t => t + 1) : setTourStep(null)}
          onSkip={() => setTourStep(null)}
        />
      )}
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <h1>Smart Invoice Pro</h1>
            <span className="text-muted" style={{ fontSize: '.75rem' }}>v1.0</span>
          </div>
        </header>

        <main className="content">
          <PullToRefresh
            onRefresh={tab === 'orders' ? handleSyncOrders : handleSyncCatalog}
            enabled={(tab === 'inventory' || tab === 'orders') && !!settings.sqApiKey}
          >
            {tab === 'dashboard' && (
              <Dashboard invoices={invoices} onNewInvoice={handleNewInvoice} />
            )}
            {tab === 'invoices' && !editorOpen && (
              <Invoices
                invoices={invoices}
                onNewInvoice={handleNewInvoice}
                onEdit={inv => inv.status === 'draft' ? setEditorOpen(true) : handleEdit(inv)}
                editingDraft={editing}
              />
            )}
            {tab === 'invoices' && editorOpen && editing !== null && (
              <InvoiceEditor
                invoice={editing}
                originalInvoice={editingOriginal ?? editing}
                products={products}
                onSave={handleSave}
                onCancel={handleCancelEdit}
                onDiscard={handleDiscardEdit}
                onDraftChange={handleDraftChange}
                aiReady={aiReady}
              />
            )}
            {tab === 'orders' && (
              <Orders
                orders={orders}
                onSync={handleSyncOrders}
                syncStatus={orderSyncStatus}
                syncCount={orderSyncCount}
                hasApiKey={!!settings.sqApiKey}
                lastSynced={lastOrderSync}
                picks={picks}
                onPickChange={savePick}
              />
            )}
            {tab === 'inventory' && (
              <Inventory
                products={products}
                onSync={handleSyncCatalog}
                syncStatus={syncStatus}
                syncCount={syncCount}
                hasApiKey={!!settings.sqApiKey}
                lastSynced={lastSynced}
              />
            )}
            {tab === 'settings' && (
              <Settings
                settings={settings}
                onSave={handleSaveSettings}
                aiModelId={aiModelId}
                aiDownloaded={aiDownloaded}
                aiDownloadProgress={aiDownloadProgress}
                aiDownloading={aiDownloading}
                aiLoading={aiLoading}
                aiReady={aiReady}
                onAiSelect={handleAiSelectModel}
                onAiDownload={handleAiDownload}
                onAiDelete={handleAiDelete}
                onAiLoad={handleAiLoad}
              />
            )}
          </PullToRefresh>
        </main>

        <nav className="nav">
          {navItems.map(item => (
            <button
              key={item.id}
              data-tour={`nav-${item.id}`}
              className={`nav-btn ${tab === item.id ? 'active' : ''}`}
              onClick={() => { setEditorOpen(false); setTab(item.id) }}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </ErrorBoundary>
  )
}
