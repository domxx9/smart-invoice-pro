/**
 * gemmaWorker — main-thread facade around the MediaPipe Web Worker.
 *
 * Why: WebGPU + MediaPipe token generation is heavy enough to freeze React
 * rendering. This facade keeps `LlmInference` off the main thread on browsers
 * that support Workers + WebGPU, and returns an explicit `{ unavailable }`
 * signal on Capacitor Android/iOS WebViews so BYOK (SMA-34) can take over.
 *
 * Public API mirrors the recommended usage from gemma.js:
 *   initGemma(modelOptions, onProgress)
 *   inferGemma(prompt, onToken)
 *   cancelGemma()
 *   isGemmaWorkerAvailable()
 *   resetGemmaWorker()  // test seam
 */

let _worker = null
let _capability = null // { webgpu: boolean } once probed
let _capWaiters = []
let _loadState = null // { resolve, reject, onProgress }
let _inferSeq = 0
const _infers = new Map() // id → { onToken, resolve, reject }

function isWorkerGlobalAvailable() {
  return typeof Worker !== 'undefined'
}

export function isGemmaWorkerAvailable() {
  return isWorkerGlobalAvailable()
}

function createWorker() {
  return new Worker(new URL('./workers/mediapipeWorker.js', import.meta.url), {
    type: 'module',
  })
}

function handleMessage(e) {
  const msg = e?.data || {}
  switch (msg.type) {
    case 'CAPCHECK_RESULT': {
      _capability = { webgpu: !!msg.webgpu }
      const waiters = _capWaiters
      _capWaiters = []
      for (const w of waiters) w(_capability)
      break
    }
    case 'LOAD_PROGRESS': {
      _loadState?.onProgress?.(msg.progress, msg.stage)
      break
    }
    case 'LOAD_DONE': {
      _loadState?.resolve?.({ ready: true })
      _loadState = null
      break
    }
    case 'INFER_TOKEN': {
      const entry = _infers.get(msg.id)
      entry?.onToken?.(msg.token, msg.partial, false)
      break
    }
    case 'INFER_DONE': {
      const entry = _infers.get(msg.id)
      entry?.onToken?.(msg.text, msg.text, true)
      // Always resolve with { text, stopReason } so callers can tell a
      // length-cap abort from a natural end (SMA-78). pipeline.js already
      // normalises string vs object shapes so older callers still work.
      const stopReason = 'stopReason' in msg ? msg.stopReason : null
      entry?.resolve?.({ text: msg.text, stopReason })
      _infers.delete(msg.id)
      break
    }
    case 'ERROR': {
      const err = new Error(msg.message || 'Worker error')
      if (msg.id != null && _infers.has(msg.id)) {
        const entry = _infers.get(msg.id)
        entry?.reject?.(err)
        _infers.delete(msg.id)
      } else if (_loadState) {
        _loadState.reject?.(err)
        _loadState = null
      }
      break
    }
    default:
      // Ignore unknown types — forward-compatible.
      break
  }
}

function handleError(e) {
  const err = new Error(e?.message || 'Worker crashed')
  if (_loadState) {
    _loadState.reject?.(err)
    _loadState = null
  }
  for (const [id, entry] of _infers) {
    entry?.reject?.(err)
    _infers.delete(id)
  }
}

function ensureWorker() {
  if (_worker) return _worker
  if (!isWorkerGlobalAvailable()) return null
  _worker = createWorker()
  _worker.onmessage = handleMessage
  _worker.onerror = handleError
  return _worker
}

function probeCapability() {
  const w = ensureWorker()
  if (!w) return Promise.resolve({ webgpu: false })
  if (_capability) return Promise.resolve(_capability)
  return new Promise((resolve) => {
    _capWaiters.push(resolve)
    w.postMessage({ type: 'CAPCHECK' })
  })
}

export async function initGemma(modelOptions, onProgress) {
  if (!isWorkerGlobalAvailable()) {
    return { unavailable: true, reason: 'no-worker' }
  }
  const cap = await probeCapability()
  if (!cap.webgpu) {
    return { unavailable: true, reason: 'no-webgpu-in-worker' }
  }
  const w = ensureWorker()
  return new Promise((resolve, reject) => {
    _loadState = { resolve, reject, onProgress }
    // modelAssetBuffer is a Uint8Array (SMA-46). Only its underlying
    // ArrayBuffer is transferable — Uint8Array itself is not. Structured clone
    // preserves the Uint8Array view on the worker side after transfer.
    const buf = modelOptions?.baseOptions?.modelAssetBuffer
    const underlying = buf?.buffer ?? (buf instanceof ArrayBuffer ? buf : null)
    const transfer = underlying ? [underlying] : undefined
    w.postMessage({ type: 'LOAD', modelOptions }, transfer)
  })
}

export async function inferGemma(prompt, optionsOrOnToken, maybeOnToken) {
  if (!isWorkerGlobalAvailable()) {
    return { unavailable: true, reason: 'no-worker' }
  }
  if (!_capability?.webgpu) {
    const cap = await probeCapability()
    if (!cap.webgpu) {
      return { unavailable: true, reason: 'no-webgpu-in-worker' }
    }
  }
  // Backwards-compat shim: `inferGemma(prompt, onToken)` (pre-SMA-78) and
  // `inferGemma(prompt, { maxTokens }, onToken?)` both work.
  const options = optionsOrOnToken && typeof optionsOrOnToken === 'object' ? optionsOrOnToken : null
  const onToken = typeof optionsOrOnToken === 'function' ? optionsOrOnToken : maybeOnToken || null
  const maxTokens =
    options && typeof options.maxTokens === 'number' && Number.isFinite(options.maxTokens)
      ? options.maxTokens
      : null
  const w = ensureWorker()
  const id = ++_inferSeq
  return new Promise((resolve, reject) => {
    _infers.set(id, { onToken, resolve, reject })
    const msg = { type: 'INFER', id, prompt }
    if (maxTokens != null) msg.maxTokens = maxTokens
    w.postMessage(msg)
  })
}

export function cancelGemma() {
  _worker?.postMessage?.({ type: 'CANCEL' })
}

export function resetGemmaWorker() {
  try {
    _worker?.terminate?.()
  } catch {
    /* ignore */
  }
  _worker = null
  _capability = null
  _capWaiters = []
  _loadState = null
  _inferSeq = 0
  _infers.clear()
}
