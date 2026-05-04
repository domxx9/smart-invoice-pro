import { logger } from './logger.js'

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sip_embeddings', 1)
    request.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains('embeddings')) {
        e.target.result.createObjectStore('embeddings')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getEmbedding(key) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('embeddings', 'readonly')
      const store = tx.objectStore('embeddings')
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    logger.error('IndexedDB get error:', e)
    return null
  }
}

export async function setEmbedding(key, vec) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('embeddings', 'readwrite')
      const store = tx.objectStore('embeddings')
      const req = store.put(vec, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    logger.error('IndexedDB set error:', e)
  }
}
