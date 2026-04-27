const CACHE = 'sip-v1'
const PRECACHE = ['/', '/index.html']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return

  if (e.request.url.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    )
  } else {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return res
        })
      )
    )
  }
})

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'ENRICH_CHUNK') return
  const { apiKey, checkpoint } = e.data
  if (!apiKey) {
    e.source.postMessage({ type: 'ENRICH_RESULT', error: 'no api key' })
    return
  }
  self.clients.matchAll({ type: 'window' }).then(clients => {
    const url = `https://api.squarespace.com/1.0/commerce/products`
    fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then(res => res.json())
      .then(data => {
        const products = Array.isArray(data.products) ? data.products : []
        const pending = products.filter(p => !(checkpoint?.processedIds || []).includes(p.id))
        const batch = pending.slice(0, 2).map(p => ({
          ...p,
          desc: p.description || '',
          images: (p.images || []).slice(0, 2),
        }))
        const newProcessedIds = [...(checkpoint?.processedIds || []), ...batch.map(p => p.id)]
        e.source.postMessage({
          type: 'ENRICH_RESULT',
          data: batch,
          checkpoint: { cursor: String(pending.findIndex(x => x.id === batch[batch.length - 1]?.id) + 1), processedIds: newProcessedIds },
          done: batch.length === 0 || pending.length <= 2,
        })
      })
      .catch(err => e.source.postMessage({ type: 'ENRICH_RESULT', error: String(err) }))
  })
})
