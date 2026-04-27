import { describe, it, expect, vi } from 'vitest'
import { SyncManager } from '../core/SyncManager.js'

const noop = () => {}

const makeAdapter = (overrides = {}) => ({
  fetchInitial: vi.fn().mockResolvedValue([]),
  fetchEnrichment: vi.fn().mockResolvedValue({ done: true, checkpoint: {} }),
  getCheckpoint: vi.fn().mockResolvedValue(null),
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

const makeStorage = (overrides = {}) => {
  let store = {}
  const s = {
    async get(k) {
      return store[k] ?? null
    },
    async set(k, v) {
      store[k] = v
    },
    async remove(k) {
      delete store[k]
    },
    ...overrides,
  }
  return s
}

describe('SyncManager', () => {
  describe('runInitialSync', () => {
    it('fetches initial products and merges with local', async () => {
      const remote = [{ id: 'p1', name: 'Remote Product', modifiedAt: '2024-01-01T00:00:00Z' }]
      const local = [{ id: 'p2', name: 'Local Only', modifiedAt: '2024-01-02T00:00:00Z' }]
      const adapter = makeAdapter({ fetchInitial: vi.fn().mockResolvedValue(remote) })
      const storage = makeStorage({
        async get(k) {
          if (k === 'products') return local
          return null
        },
      })
      const manager = new SyncManager({ adapter, storage, onProgress: noop })

      const result = await manager.runInitialSync()

      expect(result).toHaveLength(2)
      expect(result.find((p) => p.id === 'p1')).toBeDefined()
      expect(result.find((p) => p.id === 'p2')).toBeDefined()
    })

    it('remote wins when remote modifiedAt > local modifiedAt', async () => {
      const remote = [{ id: 'p1', name: 'Remote', modifiedAt: '2024-01-03T00:00:00Z' }]
      const local = [{ id: 'p1', name: 'Local', modifiedAt: '2024-01-01T00:00:00Z' }]
      const adapter = makeAdapter({ fetchInitial: vi.fn().mockResolvedValue(remote) })
      const storage = makeStorage({
        async get(k) {
          return k === 'products' ? local : null
        },
      })
      const manager = new SyncManager({ adapter, storage, onProgress: noop })

      const result = await manager.runInitialSync()

      expect(result.find((p) => p.id === 'p1').name).toBe('Remote')
    })

    it('local wins when local modifiedAt > remote modifiedAt', async () => {
      const remote = [{ id: 'p1', name: 'Remote', modifiedAt: '2024-01-01T00:00:00Z' }]
      const local = [{ id: 'p1', name: 'Local', modifiedAt: '2024-01-03T00:00:00Z' }]
      const adapter = makeAdapter({ fetchInitial: vi.fn().mockResolvedValue(remote) })
      const storage = makeStorage({
        async get(k) {
          return k === 'products' ? local : null
        },
      })
      const manager = new SyncManager({ adapter, storage, onProgress: noop })

      const result = await manager.runInitialSync()

      expect(result.find((p) => p.id === 'p1').name).toBe('Local')
    })
  })

  describe('runEnrichmentChunk', () => {
    it('skips update when local modifiedAt > remote modifiedAt', async () => {
      const checkpoint = { cursor: '0', processedIds: [] }
      const storage = makeStorage({
        async get(k) {
          return k === 'products'
            ? [{ id: 'p1', name: 'Local Modified', modifiedAt: '2024-01-05T00:00:00Z' }]
            : null
        },
      })
      const setSpy = vi.spyOn(storage, 'set')
      const adapter = makeAdapter({
        getCheckpoint: vi.fn().mockResolvedValue(checkpoint),
        fetchEnrichment: vi.fn().mockResolvedValue({
          done: false,
          checkpoint: { cursor: '1', processedIds: ['p1'] },
          data: [{ id: 'p1', name: 'Remote Enriched', modifiedAt: '2024-01-01T00:00:00Z' }],
        }),
      })
      const manager = new SyncManager({ adapter, storage, onProgress: noop })

      await manager.runEnrichmentChunk()

      const savedArg = setSpy.mock.calls.find(([k]) => k === 'products')
      expect(savedArg[1].find((p) => p.id === 'p1')?.name).toBe('Local Modified')
    })

    it('applies enrichment when remote is newer', async () => {
      const checkpoint = { cursor: '0', processedIds: [] }
      const storage = makeStorage({
        async get(k) {
          return k === 'products'
            ? [{ id: 'p1', name: 'Local Old', modifiedAt: '2024-01-01T00:00:00Z' }]
            : null
        },
      })
      const setSpy = vi.spyOn(storage, 'set')
      const adapter = makeAdapter({
        getCheckpoint: vi.fn().mockResolvedValue(checkpoint),
        fetchEnrichment: vi.fn().mockResolvedValue({
          done: false,
          checkpoint: { cursor: '1', processedIds: ['p1'] },
          data: [{ id: 'p1', name: 'Remote Enriched', modifiedAt: '2024-01-10T00:00:00Z' }],
        }),
      })
      const manager = new SyncManager({ adapter, storage, onProgress: noop })

      await manager.runEnrichmentChunk()

      const savedArg = setSpy.mock.calls.find(([k]) => k === 'products')
      expect(savedArg[1].find((p) => p.id === 'p1')?.name).toBe('Remote Enriched')
    })

    it('marks done when fetchEnrichment returns done=true', async () => {
      const adapter = makeAdapter({
        getCheckpoint: vi.fn().mockResolvedValue({ cursor: '5', processedIds: ['p1'] }),
        fetchEnrichment: vi.fn().mockResolvedValue({ done: true, checkpoint: null }),
      })
      const storage = makeStorage()
      const manager = new SyncManager({ adapter, storage, onProgress: noop })

      const result = await manager.runEnrichmentChunk()

      expect(result).toBeNull()
      expect(adapter.saveCheckpoint).toHaveBeenCalledWith(null)
    })
  })

  describe('resolveConflict', () => {
    it('returns remote when only remote has modifiedAt', () => {
      const adapter = makeAdapter()
      const manager = new SyncManager({ adapter, storage: makeStorage(), onProgress: noop })
      const local = { id: 'p1', name: 'Local', modifiedAt: null }
      const remote = { id: 'p1', name: 'Remote', modifiedAt: '2024-01-01T00:00:00Z' }

      const result = manager.resolveConflict(local, remote)

      expect(result.name).toBe('Remote')
    })

    it('returns local when only local has modifiedAt', () => {
      const adapter = makeAdapter()
      const manager = new SyncManager({ adapter, storage: makeStorage(), onProgress: noop })
      const local = { id: 'p1', name: 'Local', modifiedAt: '2024-01-02T00:00:00Z' }
      const remote = { id: 'p1', name: 'Remote', modifiedAt: null }

      const result = manager.resolveConflict(local, remote)

      expect(result.name).toBe('Local')
    })

    it('returns remote when remote modifiedAt is newer', () => {
      const adapter = makeAdapter()
      const manager = new SyncManager({ adapter, storage: makeStorage(), onProgress: noop })
      const local = { id: 'p1', name: 'Local', modifiedAt: '2024-01-01T00:00:00Z' }
      const remote = { id: 'p1', name: 'Remote', modifiedAt: '2024-01-03T00:00:00Z' }

      const result = manager.resolveConflict(local, remote)

      expect(result.name).toBe('Remote')
    })

    it('returns local when local modifiedAt is newer', () => {
      const adapter = makeAdapter()
      const manager = new SyncManager({ adapter, storage: makeStorage(), onProgress: noop })
      const local = { id: 'p1', name: 'Local', modifiedAt: '2024-01-05T00:00:00Z' }
      const remote = { id: 'p1', name: 'Remote', modifiedAt: '2024-01-03T00:00:00Z' }

      const result = manager.resolveConflict(local, remote)

      expect(result.name).toBe('Local')
    })

    it('returns local when both have equal modifiedAt', () => {
      const adapter = makeAdapter()
      const manager = new SyncManager({ adapter, storage: makeStorage(), onProgress: noop })
      const local = { id: 'p1', name: 'Local', modifiedAt: '2024-01-01T00:00:00Z' }
      const remote = { id: 'p1', name: 'Remote', modifiedAt: '2024-01-01T00:00:00Z' }

      const result = manager.resolveConflict(local, remote)

      expect(result.name).toBe('Local')
    })
  })
})
