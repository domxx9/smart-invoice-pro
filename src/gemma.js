/**
 * Gemma 4 On-Device AI — inference engine
 *
 * Uses MediaPipe LLM Inference API with WebGPU backend.
 * Model: Gemma 4 E2B (effective 2B params) — text-only, on-device, zero network after download.
 *
 * Storage: OPFS (web) or Capacitor Filesystem (native).
 */

import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task'

const MODEL_FILENAME = 'gemma-4-E2B-it-web.task'
const MODEL_SIZE_APPROX = 2.58 * 1024 * 1024 * 1024 // ~2.58 GB

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'

// ─── Module state ────────────────────────────────────────────────────────────

let _llm = null          // LlmInference instance
let _status = 'idle'     // idle | checking | downloading | ready | loading | active | error | no-webgpu
let _error = null
let _abortCtrl = null    // AbortController for download cancellation

// ─── WebGPU detection ────────────────────────────────────────────────────────

export function checkWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

// ─── Status ──────────────────────────────────────────────────────────────────

export function getModelStatus() {
  return { status: _status, error: _error }
}

export function getModelSizeApprox() {
  return MODEL_SIZE_APPROX
}

// ─── OPFS helpers (browser storage for large files) ──────────────────────────

async function opfsRoot() {
  return navigator.storage.getDirectory()
}

async function opfsHasModel() {
  try {
    const root = await opfsRoot()
    await root.getFileHandle(MODEL_FILENAME)
    return true
  } catch {
    return false
  }
}

async function opfsGetModelFile() {
  const root = await opfsRoot()
  const handle = await root.getFileHandle(MODEL_FILENAME)
  return handle.getFile()
}

async function opfsDeleteModel() {
  try {
    const root = await opfsRoot()
    await root.removeEntry(MODEL_FILENAME)
  } catch {
    // File didn't exist — fine
  }
}

// ─── Check if model is already downloaded ────────────────────────────────────

export async function isModelDownloaded() {
  if (!checkWebGPU()) return false
  try {
    return await opfsHasModel()
  } catch {
    return false
  }
}

// ─── Download model ──────────────────────────────────────────────────────────

/**
 * Download the Gemma 4 E2B web model to OPFS.
 * @param {function} onProgress - Callback: (receivedBytes, totalBytes) => void
 * @returns {Promise<void>}
 */
export async function downloadModel(onProgress) {
  if (_status === 'downloading') throw new Error('Download already in progress')
  if (!checkWebGPU()) {
    _status = 'no-webgpu'
    throw new Error('WebGPU is not available in this browser')
  }

  _status = 'downloading'
  _error = null
  _abortCtrl = new AbortController()

  try {
    const res = await fetch(MODEL_URL, { signal: _abortCtrl.signal })
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)

    const total = parseInt(res.headers.get('content-length'), 10) || MODEL_SIZE_APPROX
    const reader = res.body.getReader()
    let received = 0

    // Write directly to OPFS via writable stream for memory efficiency
    const root = await opfsRoot()
    const fileHandle = await root.getFileHandle(MODEL_FILENAME, { create: true })
    const writable = await fileHandle.createWritable()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      received += value.byteLength
      onProgress?.(received, total)
    }

    await writable.close()
    _status = 'ready'
  } catch (err) {
    // Clean up partial download
    await opfsDeleteModel()

    if (err.name === 'AbortError') {
      _status = 'idle'
      _error = 'Download cancelled'
    } else {
      _status = 'error'
      _error = err.message
    }
    throw err
  } finally {
    _abortCtrl = null
  }
}

/**
 * Cancel an in-progress download.
 */
export function cancelDownload() {
  _abortCtrl?.abort()
}

// ─── Delete model ────────────────────────────────────────────────────────────

export async function deleteModel() {
  if (_llm) {
    _llm = null
  }
  await opfsDeleteModel()
  _status = 'idle'
  _error = null
}

// ─── Initialize model ────────────────────────────────────────────────────────

/**
 * Load the downloaded model into the MediaPipe LLM Inference engine.
 * Must be called after downloadModel() completes.
 */
export async function initModel() {
  if (_llm) return // Already loaded

  if (!checkWebGPU()) {
    _status = 'no-webgpu'
    throw new Error('WebGPU is not available')
  }

  const hasModel = await isModelDownloaded()
  if (!hasModel) {
    _status = 'idle'
    throw new Error('Model not downloaded — call downloadModel() first')
  }

  _status = 'loading'
  _error = null

  try {
    const genai = await FilesetResolver.forGenAiTasks(WASM_CDN)

    // Read the model file from OPFS as a ReadableStream
    const file = await opfsGetModelFile()
    const stream = file.stream().getReader()

    _llm = await LlmInference.createFromOptions(genai, {
      baseOptions: { modelAssetBuffer: stream },
      maxTokens: 1024,
      temperature: 0.2,
      topK: 40,
    })

    _status = 'active'
  } catch (err) {
    _status = 'error'
    _error = err.message
    throw err
  }
}

// ─── Generate ────────────────────────────────────────────────────────────────

/**
 * Generate a response from a user prompt with streaming.
 * @param {string} userPrompt - The user's question/instruction
 * @param {function} onToken - Callback: (accumulatedText, isDone) => void
 * @returns {Promise<string>} Full response text
 */
export async function generate(userPrompt, onToken) {
  if (!_llm) {
    throw new Error('Model not initialized — call initModel() first')
  }

  // Gemma turn-based prompt template
  const formatted =
    '<start_of_turn>user\n' +
    userPrompt +
    '<end_of_turn>\n<start_of_turn>model\n'

  return new Promise((resolve, reject) => {
    let accumulated = ''

    try {
      _llm.generateResponse(formatted, (partial, done) => {
        accumulated += partial
        onToken?.(accumulated, done)
        if (done) resolve(accumulated)
      })
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Cancel in-progress generation.
 */
export function cancelGeneration() {
  _llm?.cancelProcessing()
}

// ─── Convenience: check + init in one call ───────────────────────────────────

/**
 * Ensure the model is ready. If downloaded but not loaded, loads it.
 * @returns {Promise<boolean>} true if model is active and ready to generate
 */
export async function ensureReady() {
  if (_llm && _status === 'active') return true

  if (!checkWebGPU()) {
    _status = 'no-webgpu'
    return false
  }

  const downloaded = await isModelDownloaded()
  if (!downloaded) {
    _status = 'idle'
    return false
  }

  try {
    await initModel()
    return true
  } catch {
    return false
  }
}
