/**
 * Tests for gemma._downloadWeb progress behaviour (SMA-47).
 *
 * We stub fetch, OPFS (navigator.storage.getDirectory), and navigator.gpu so
 * the module's web path can run inside jsdom.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// --- Fakes ----------------------------------------------------------------

function makeReader(chunks) {
  let i = 0
  return {
    async read() {
      if (i < chunks.length) return { done: false, value: chunks[i++] }
      return { done: true, value: undefined }
    },
  }
}

function makeResponse({ ok = true, contentLength, chunks = [] }) {
  const headers = new Map()
  if (contentLength != null) headers.set('content-length', String(contentLength))
  return {
    ok,
    status: 200,
    headers: { get: (k) => headers.get(k.toLowerCase()) ?? null },
    body: { getReader: () => makeReader(chunks) },
  }
}

class FakeWritable {
  constructor() {
    this.written = []
    this.closed = false
    this.aborted = false
  }
  async write(v) {
    this.written.push(v)
  }
  async close() {
    this.closed = true
  }
  async abort() {
    this.aborted = true
  }
}

function installOpfs() {
  const writable = new FakeWritable()
  const fileHandle = { createWritable: async () => writable }
  const root = {
    getFileHandle: vi.fn().mockResolvedValue(fileHandle),
    removeEntry: vi.fn().mockResolvedValue(undefined),
  }
  globalThis.navigator ||= {}
  globalThis.navigator.storage = { getDirectory: async () => root }
  globalThis.navigator.gpu = {} // hasWebGPU() → true
  return { writable, root }
}

// --- Tests ----------------------------------------------------------------

describe('gemma._downloadWeb — progress signals', () => {
  beforeEach(() => {
    vi.resetModules()
    installOpfs()
    delete globalThis.window
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.navigator?.storage
    delete globalThis.navigator?.gpu
    delete globalThis.fetch
  })

  it('fires onProgress(null) on connect and emits a fraction when content-length is known', async () => {
    const chunk = new Uint8Array([1, 2, 3, 4])
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(makeResponse({ contentLength: 4, chunks: [chunk] }))

    const { downloadModel } = await import('../gemma.js')
    const calls = []
    await downloadModel('small', (p) => calls.push(p))

    expect(calls[0]).toBeNull()
    // Determinate fraction arrives after the read — last value is 1 (final push).
    expect(calls.some((p) => typeof p === 'number' && p > 0 && p < 2)).toBe(true)
    expect(calls[calls.length - 1]).toBe(1)
  })

  it('keeps emitting null when content-length is absent (indeterminate)', async () => {
    const chunk = new Uint8Array([9, 9, 9])
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(makeResponse({ contentLength: undefined, chunks: [chunk, chunk] }))

    const { downloadModel } = await import('../gemma.js')
    const calls = []
    await downloadModel('small', (p) => calls.push(p))

    // First call is the connect sentinel
    expect(calls[0]).toBeNull()
    // Subsequent reader.read() ticks also report null because total === 0
    const readTicks = calls.slice(1, -1)
    expect(readTicks.length).toBeGreaterThan(0)
    expect(readTicks.every((p) => p === null)).toBe(true)
    // Final flip to 1 so the UI can finish gracefully
    expect(calls[calls.length - 1]).toBe(1)
  })
})
