import { describe, it, expect } from 'vitest'
import { SquarespaceAdapter } from '../adapters/SquarespaceAdapter.js'

const makeStorage = () => {
  let store = {}
  return {
    async get(k) {
      return store[k] ?? null
    },
    async set(k, v) {
      store[k] = v
    },
    async remove(k) {
      delete store[k]
    },
  }
}

describe('SquarespaceAdapter', () => {
  describe('checkpoint', () => {
    it('saves and retrieves checkpoint from storage', async () => {
      const storage = makeStorage()
      const adapter = new SquarespaceAdapter({ apiKey: 'test-key', storage, batchSize: 2 })
      const checkpoint = { cursor: '5', processedIds: ['p1', 'p2'] }

      await adapter.saveCheckpoint(checkpoint)
      const retrieved = await adapter.getCheckpoint()

      expect(retrieved).toEqual(checkpoint)
    })

    it('getCheckpoint returns null when no checkpoint saved', async () => {
      const storage = makeStorage()
      const adapter = new SquarespaceAdapter({ apiKey: 'test-key', storage })

      const result = await adapter.getCheckpoint()

      expect(result).toBeNull()
    })
  })
})
