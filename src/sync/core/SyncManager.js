export class SyncManager {
  constructor({ adapter, storage, onProgress } = {}) {
    this.adapter = adapter
    this.storage = storage
    this.onProgress = onProgress ?? (() => {})
  }

  async runInitialSync() {
    const products = await this.adapter.fetchInitial()
    const localProducts = (await this.storage.get('products')) ?? []
    const merged = this._merge(products, localProducts)
    await this.storage.set('products', merged)
    await this.storage.set('products_synced_at', Date.now())
    this.onProgress({ phase: 'initial', count: merged.length })
    return merged
  }

  async runEnrichmentChunk() {
    const checkpoint = await this.adapter.getCheckpoint()
    const result = await this.adapter.fetchEnrichment(checkpoint)
    if (result.done) {
      await this.adapter.saveCheckpoint(null)
      this.onProgress({ phase: 'enrichment_done' })
      return null
    }
    const localProducts = (await this.storage.get('products')) ?? []
    const localMap = new Map(localProducts.map((p) => [p.id, p]))
    for (const enriched of result.data ?? []) {
      const existing = localMap.get(enriched.id)
      if (!existing) continue
      if (existing.modifiedAt && enriched.modifiedAt) {
        if (new Date(existing.modifiedAt) > new Date(enriched.modifiedAt)) continue
      }
      localMap.set(enriched.id, { ...existing, ...enriched })
    }
    const merged = Array.from(localMap.values())
    await this.storage.set('products', merged)
    await this.adapter.saveCheckpoint(result.checkpoint)
    this.onProgress({ phase: 'enrichment', processed: result.data?.length ?? 0 })
    return result.checkpoint
  }

  _merge(remote, local) {
    const localMap = new Map(local.map((p) => [p.id, p]))
    for (const remoteProduct of remote ?? []) {
      const localProduct = localMap.get(remoteProduct.id)
      if (!localProduct) {
        localMap.set(remoteProduct.id, remoteProduct)
        continue
      }
      if (localProduct.modifiedAt && remoteProduct.modifiedAt) {
        if (new Date(localProduct.modifiedAt) <= new Date(remoteProduct.modifiedAt)) {
          localMap.set(remoteProduct.id, { ...localProduct, ...remoteProduct })
        }
      } else if (!localProduct.modifiedAt) {
        localMap.set(remoteProduct.id, { ...localProduct, ...remoteProduct })
      }
    }
    return Array.from(localMap.values())
  }

  resolveConflict(local, remote) {
    if (!local.modifiedAt && !remote.modifiedAt) return remote
    if (!local.modifiedAt) return remote
    if (!remote.modifiedAt) return local
    return new Date(local.modifiedAt) >= new Date(remote.modifiedAt) ? local : remote
  }
}
