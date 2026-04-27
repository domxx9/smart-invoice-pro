function localStorageGet(namespace, key) {
  const raw = localStorage.getItem(namespace + '_' + key)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function localStorageSet(namespace, key, value) {
  localStorage.setItem(namespace + '_' + key, JSON.stringify(value))
}

function stripDesc(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function category(p) {
  return p.type ? p.type.charAt(0) + p.type.slice(1).toLowerCase() : 'Product'
}

async function fetchSquarespaceProducts(apiKey) {
  const winCap = window.Capacitor
  const isNative = winCap && winCap.isNativePlatform ? winCap.isNativePlatform() : false
  const allProducts = []
  let cursor = null

  do {
    const url = 'https://api.squarespace.com/1.0/commerce/products' + (cursor ? '?cursor=' + cursor : '')
    let data

    if (isNative) {
      const res = await winCap.Plugins.CapacitorHttp.get({
        url,
        headers: { Authorization: 'Bearer ' + apiKey },
      })
      if (res.status < 200 || res.status >= 300) throw new Error('Squarespace API ' + res.status)
      data = res.data
    } else {
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + apiKey } })
      if (!res.ok) throw new Error('Squarespace API ' + res.status + ': ' + res.statusText)
      data = await res.json()
    }

    if (!Array.isArray(data.products)) throw new Error('No products array in response')
    allProducts.push.apply(allProducts, data.products)
    cursor = data.pagination && data.pagination.nextPageCursor ? data.pagination.nextPageCursor : null
  } while (cursor)

  const flattened = allProducts.map(function(p) {
    const variants = p.variants || []
    const desc = stripDesc(p.description || p.body || '')
    if (!variants.length) {
      return [{ id: p.id, name: p.name, desc: desc, price: 0, stock: 99, category: category(p) }]
    }
    const expand = variants.length > 1 || Object.values(variants[0] && variants[0].attributes || {}).some(function(v) { return v })
    return variants.map(function(v, idx) {
      const price = parseFloat(v.pricing && v.pricing.basePrice && v.pricing.basePrice.value || 0)
      const unlimited = v.stock && v.stock.unlimited != null ? v.stock.unlimited : true
      const qty = v.stock && v.stock.quantity != null ? v.stock.quantity : 0
      const attrs = Object.values(v.attributes || {}).filter(Boolean)
      const suffix = expand && attrs.length ? ' — ' + attrs.join(' / ') : ''
      return {
        id: p.id + '_v' + idx,
        name: p.name + suffix,
        desc: desc,
        price: price,
        stock: unlimited ? 99 : qty,
        category: category(p),
      }
    })
  })
  return [].concat.apply([], flattened)
}

async function run() {
  const start = Date.now()
  const STORAGE_NS = 'sip'

  const apiKey = localStorageGet(STORAGE_NS, 'squarespace_api_key')
  if (!apiKey) {
    console.warn('[background] no squarespace api key — skipping enrichment')
    return
  }

  const checkpointRaw = localStorageGet(STORAGE_NS, 'sync_checkpoint')
  const checkpoint = checkpointRaw != null ? checkpointRaw : null
  const processedIds = checkpoint && checkpoint.processedIds ? checkpoint.processedIds : []

  try {
    const allProducts = await fetchSquarespaceProducts(apiKey)
    const pending = allProducts.filter(function(p) { return processedIds.indexOf(p.id) === -1 })
    const batch = pending.slice(0, 2)
    if (!batch.length) {
      localStorageSet(STORAGE_NS, 'sync_checkpoint', { cursor: null, processedIds: [] })
      console.info('[background] enrichment complete — no pending products')
      return
    }

    const enriched = batch.map(function(p) {
      return {
        id: p.id,
        name: p.name,
        desc: p.desc || '',
        images: (p.images || []).slice(0, 2),
        price: p.price,
        stock: p.stock,
        category: p.category,
      }
    })

    const localRaw = localStorageGet(STORAGE_NS, 'products')
    const localProducts = localRaw != null ? localRaw : []
    const localMap = {}
    for (let i = 0; i < localProducts.length; i++) {
      localMap[localProducts[i].id] = localProducts[i]
    }
    for (let j = 0; j < enriched.length; j++) {
      const ex = localMap[enriched[j].id]
      if (ex) {
        localMap[enriched[j].id] = Object.assign({}, ex, enriched[j])
      }
    }
    const merged = Object.keys(localMap).map(function(k) { return localMap[k] })
    localStorageSet(STORAGE_NS, 'products', merged)

    const newProcessedIds = processedIds.slice()
    for (let k = 0; k < batch.length; k++) {
      if (newProcessedIds.indexOf(batch[k].id) === -1) newProcessedIds.push(batch[k].id)
    }
    const nextCursor = allProducts.findIndex(function(p) { return p.id === batch[batch.length - 1].id }) + 1
    const newCheckpoint = {
      cursor: String(nextCursor),
      processedIds: newProcessedIds,
    }
    localStorageSet(STORAGE_NS, 'sync_checkpoint', newCheckpoint)

    const elapsed = Date.now() - start
    console.info('[background] enrichment chunk done in ' + elapsed + 'ms — processed ' + batch.length)
  } catch (err) {
    console.error('[background] enrichment error', err)
  }
}

run()