import { BaseAdapter } from './BaseAdapter.js'
import { fetchSquarespaceProducts } from '../../api/squarespace.js'

export class SquarespaceAdapter extends BaseAdapter {
  constructor({ apiKey, storage, batchSize = 2 }) {
    super()
    this.apiKey = apiKey
    this.storage = storage
    this.batchSize = batchSize
  }

  async fetchInitial(onProgress, onStats) {
    return fetchSquarespaceProducts(this.apiKey, onProgress, onStats)
  }

  async fetchEnrichment(checkpoint) {
    const { processedIds } = checkpoint ?? {}
    const products = await fetchSquarespaceProducts(this.apiKey)
    const pending = products.filter((p) => !processedIds?.includes(p.id))
    const batch = pending.slice(0, this.batchSize)
    if (!batch.length) {
      return { done: true, checkpoint: { cursor: null, processedIds: [] } }
    }
    const enriched = batch.map((p) => ({
      ...p,
      desc: p.desc || '',
      images: p.images?.slice(0, 2) ?? [],
    }))
    const newProcessedIds = [...(processedIds ?? []), ...batch.map((p) => p.id)]
    const nextCursor = products.findIndex((p) => p.id === batch[batch.length - 1].id) + 1
    return {
      done: nextCursor >= products.length,
      checkpoint: {
        cursor: String(nextCursor),
        processedIds: newProcessedIds,
      },
      data: enriched,
    }
  }

  async getCheckpoint() {
    return this.storage.get('sip_sync_checkpoint') ?? null
  }

  async saveCheckpoint(checkpoint) {
    await this.storage.set('sip_sync_checkpoint', checkpoint)
  }
}
