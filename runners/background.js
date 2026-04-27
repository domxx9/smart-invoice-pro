import { SyncManager } from '../src/sync/core/SyncManager.js'
import { SquarespaceAdapter } from '../src/sync/adapters/SquarespaceAdapter.js'
import { LocalStorageSync } from '../src/sync/storage/LocalStorageSync.js'

const HARD_LIMIT_MS = 30_000

async function run() {
  const start = Date.now()
  const storage = new LocalStorageSync('sip')

  const apiKey = await storage.get('squarespace_api_key')
  if (!apiKey) {
    console.warn('[background] no squarespace api key — skipping enrichment')
    return
  }

  const adapter = new SquarespaceAdapter({ apiKey, storage })
  const manager = new SyncManager({ adapter, storage })

  try {
    const result = await Promise.race([
      manager.runEnrichmentChunk(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('HARD_LIMIT')), HARD_LIMIT_MS)),
    ])
    const elapsed = Date.now() - start
    console.info(`[background] enrichment chunk done in ${elapsed}ms — checkpoint: ${result}`)
  } catch (err) {
    if (err.message === 'HARD_LIMIT') {
      const elapsed = Date.now() - start
      console.warn(`[background] hard limit hit after ${elapsed}ms — checkpoint saved`)
    } else {
      console.error('[background] enrichment error', err)
    }
  }
}

run()
