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

  it('fires onProgress(null) on connect, fractions mid-flight, and 1 at the end when content-length is known', async () => {
    // Total = 6, two 2-byte chunks → fractions 1/3 and 2/3 mid-flight, then 1.
    const chunk = new Uint8Array([1, 2])
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(makeResponse({ contentLength: 6, chunks: [chunk, chunk] }))

    const { downloadModel } = await import('../gemma.js')
    const calls = []
    await downloadModel('small', (p) => calls.push(p))

    // First tick: connect sentinel.
    expect(calls[0]).toBeNull()
    // Mid-flight ticks: determinate fractions strictly between 0 and 1.
    const mid = calls.slice(1, -1)
    expect(mid.length).toBeGreaterThan(0)
    expect(mid.every((p) => typeof p === 'number' && p > 0 && p < 1)).toBe(true)
    // Final tick: exact 1 so the UI shows a clean finish.
    expect(calls[calls.length - 1]).toBe(1)
  })

  it('removes the 0-byte OPFS entry when the stream errors mid-flight (SMA-69)', async () => {
    const { root } = installOpfs()
    const streamErr = new Error('stream blew up')
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: {
        getReader: () => ({
          async read() {
            throw streamErr
          },
        }),
      },
    })

    const { downloadModel, MODELS } = await import('../gemma.js')
    await expect(downloadModel('small', () => {})).rejects.toBe(streamErr)

    expect(root.removeEntry).toHaveBeenCalledTimes(1)
    expect(root.removeEntry).toHaveBeenCalledWith(MODELS.small.filename)
  })

  it('emits -1 on chunks when content-length is absent (indeterminate with bytes)', async () => {
    const chunk = new Uint8Array([9, 9, 9])
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(makeResponse({ contentLength: undefined, chunks: [chunk, chunk] }))

    const { downloadModel } = await import('../gemma.js')
    const calls = []
    await downloadModel('small', (p) => calls.push(p))

    // First tick: pre-fetch connect sentinel (null), never repeated for chunks.
    expect(calls[0]).toBeNull()
    // After the first chunk arrives we flip to -1 so Settings can stop saying
    // "Connecting…" and switch the label to "Downloading…" while keeping the
    // striped bar animation running.
    const readTicks = calls.slice(1, -1)
    expect(readTicks.length).toBeGreaterThan(0)
    expect(readTicks.every((p) => p === -1)).toBe(true)
    expect(readTicks.some((p) => p === null)).toBe(false)
    // Final flip to 1 so the UI can finish gracefully.
    expect(calls[calls.length - 1]).toBe(1)
  })
})
