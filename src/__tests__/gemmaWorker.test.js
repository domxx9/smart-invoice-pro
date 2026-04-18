/**
 * Tests for gemmaWorker facade (SMA-39).
 *
 * We inject a MockWorker via globalThis.Worker. Each test reloads the module
 * so global-state inside the facade (_worker, _capability, …) is fresh.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// --- Mock Worker ----------------------------------------------------------

class MockWorker {
  constructor(url, opts) {
    this.url = url
    this.opts = opts
    this.onmessage = null
    this.onerror = null
    this.posted = []
    this.transfers = []
    this.terminated = false
    MockWorker.last = this
  }
  postMessage(msg, transfer) {
    this.posted.push(msg)
    this.transfers.push(transfer ?? null)
    MockWorker.lastInstance = this
    // Async-dispatch handler so facade code sees Promise scheduling
    queueMicrotask(() => this._handle(msg))
  }
  _handle(msg) {
    const script = MockWorker.script
    if (!script) return
    const reply = script(msg, this)
    if (!reply) return
    const replies = Array.isArray(reply) ? reply : [reply]
    for (const r of replies) {
      if (typeof r === 'function') {
        r((data) => this._emit(data))
      } else {
        this._emit(r)
      }
    }
  }
  _emit(data) {
    this.onmessage?.({ data })
  }
  terminate() {
    this.terminated = true
  }
}

// --- Helpers --------------------------------------------------------------

async function loadFacade() {
  vi.resetModules()
  return await import('../gemmaWorker.js')
}

beforeEach(() => {
  MockWorker.script = null
  MockWorker.last = null
  globalThis.Worker = MockWorker
})

afterEach(() => {
  delete globalThis.Worker
})

// --- Capability gate ------------------------------------------------------

describe('capability gate', () => {
  it('returns unavailable when Worker global is missing', async () => {
    delete globalThis.Worker
    const { initGemma, inferGemma, isGemmaWorkerAvailable } = await loadFacade()

    expect(isGemmaWorkerAvailable()).toBe(false)
    await expect(initGemma({})).resolves.toEqual({
      unavailable: true,
      reason: 'no-worker',
    })
    await expect(inferGemma('hi')).resolves.toEqual({
      unavailable: true,
      reason: 'no-worker',
    })
  })

  it('returns unavailable when worker reports no WebGPU (Capacitor WebView case)', async () => {
    MockWorker.script = (msg) => {
      if (msg.type === 'CAPCHECK') return { type: 'CAPCHECK_RESULT', webgpu: false }
      return null
    }
    const { initGemma } = await loadFacade()
    const result = await initGemma({})
    expect(result).toEqual({
      unavailable: true,
      reason: 'no-webgpu-in-worker',
    })
  })
})

// --- LOAD protocol --------------------------------------------------------

describe('LOAD protocol', () => {
  it('forwards progress events and resolves on LOAD_DONE', async () => {
    MockWorker.script = (msg) => {
      if (msg.type === 'CAPCHECK') return { type: 'CAPCHECK_RESULT', webgpu: true }
      if (msg.type === 'LOAD') {
        return [
          { type: 'LOAD_PROGRESS', progress: 0, stage: 'wasm' },
          { type: 'LOAD_PROGRESS', progress: 0.5, stage: 'model' },
          { type: 'LOAD_PROGRESS', progress: 1, stage: 'ready' },
          { type: 'LOAD_DONE' },
        ]
      }
      return null
    }
    const { initGemma, resetGemmaWorker } = await loadFacade()
    const progress = []
    const result = await initGemma({}, (p, stage) => progress.push([p, stage]))

    expect(result).toEqual({ ready: true })
    expect(progress).toEqual([
      [0, 'wasm'],
      [0.5, 'model'],
      [1, 'ready'],
    ])
    resetGemmaWorker()
  })

  it('transfers the underlying ArrayBuffer (not the Uint8Array view) to the worker (SMA-46)', async () => {
    let capturedLoad = null
    let capturedTransfer = null
    MockWorker.script = (msg, worker) => {
      if (msg.type === 'CAPCHECK') return { type: 'CAPCHECK_RESULT', webgpu: true }
      if (msg.type === 'LOAD') {
        capturedLoad = msg
        capturedTransfer = worker.transfers[worker.transfers.length - 1]
        return { type: 'LOAD_DONE' }
      }
      return null
    }
    const { initGemma, resetGemmaWorker } = await loadFacade()
    const modelAssetBuffer = new Uint8Array(8)
    await initGemma({ baseOptions: { modelAssetBuffer } })

    expect(capturedLoad?.modelOptions?.baseOptions?.modelAssetBuffer).toBeInstanceOf(Uint8Array)
    expect(capturedTransfer).toHaveLength(1)
    expect(capturedTransfer[0]).toBeInstanceOf(ArrayBuffer)
    expect(capturedTransfer[0]).toBe(modelAssetBuffer.buffer)
    resetGemmaWorker()
  })

  it('rejects with ERROR during LOAD', async () => {
    MockWorker.script = (msg) => {
      if (msg.type === 'CAPCHECK') return { type: 'CAPCHECK_RESULT', webgpu: true }
      if (msg.type === 'LOAD') return { type: 'ERROR', message: 'wasm fetch failed' }
      return null
    }
    const { initGemma, resetGemmaWorker } = await loadFacade()
    await expect(initGemma({})).rejects.toThrow('wasm fetch failed')
    resetGemmaWorker()
  })
})

// --- INFER protocol -------------------------------------------------------

describe('INFER protocol', () => {
  async function primeLoadedFacade() {
    MockWorker.script = (msg) => {
      if (msg.type === 'CAPCHECK') return { type: 'CAPCHECK_RESULT', webgpu: true }
      if (msg.type === 'LOAD') return { type: 'LOAD_DONE' }
      return null
    }
    const facade = await loadFacade()
    await facade.initGemma({})
    return facade
  }

  it('streams INFER_TOKEN and resolves on INFER_DONE', async () => {
    const { inferGemma, resetGemmaWorker } = await primeLoadedFacade()

    MockWorker.script = (msg) => {
      if (msg.type === 'INFER') {
        return [
          { type: 'INFER_TOKEN', id: msg.id, token: 'he', partial: 'he' },
          { type: 'INFER_TOKEN', id: msg.id, token: 'llo', partial: 'hello' },
          { type: 'INFER_DONE', id: msg.id, text: 'hello' },
        ]
      }
      return null
    }

    const tokens = []
    const final = await inferGemma('hi', (token, partial, done) => {
      tokens.push({ token, partial, done })
    })

    expect(final).toBe('hello')
    // Final INFER_DONE also fires the callback with done=true
    expect(tokens[0]).toEqual({ token: 'he', partial: 'he', done: false })
    expect(tokens[1]).toEqual({ token: 'llo', partial: 'hello', done: false })
    expect(tokens[2]).toEqual({ token: 'hello', partial: 'hello', done: true })
    resetGemmaWorker()
  })

  it('propagates ERROR for a specific inference id', async () => {
    const { inferGemma, resetGemmaWorker } = await primeLoadedFacade()

    MockWorker.script = (msg) => {
      if (msg.type === 'INFER') {
        return { type: 'ERROR', id: msg.id, message: 'generate failed' }
      }
      return null
    }

    await expect(inferGemma('hi')).rejects.toThrow('generate failed')
    resetGemmaWorker()
  })
})
