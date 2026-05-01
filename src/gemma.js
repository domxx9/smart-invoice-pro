/**
 * Gemma on-device inference — Phase 4
 *
 * ⚠️ Dev-only entry point (SMA-39 Track B).
 *    Production code should use `./gemmaWorker.js`, which runs MediaPipe in a
 *    Web Worker and gates on WebGPU availability (Android/iOS WebView returns
 *    `{ unavailable: true }` so BYOK — SMA-34 — picks up). This file still
 *    owns download/storage helpers (OPFS + Capacitor filesystem) and remains
 *    useful for local profiling; keep it in sync with the worker until the
 *    worker owns the download path end-to-end.
 *
 * Tiered model strategy: Nano / Small (default) / Pro / Alt
 * Storage:
 *   Web  → OPFS (Origin Private File System)
 *   Native (Android/iOS) → @capacitor/filesystem Directory.Data
 * Backend: WebGPU (required by MediaPipe LLM Inference API)
 */

import { logger } from './utils/logger.js'

// Session-wide KV-cache budget for LlmInference.createFromOptions. Mirrors the
// constant used by the worker entry (`src/workers/mediapipeWorker.js`). See
// that file for the rationale; SMA-84 tracks the tightening rollout.
export const SESSION_MAX_TOKENS = 4096

// ─── Model registry ───────────────────────────────────────────────────────────

export const MODELS = {
  nano: {
    id: 'nano',
    label: 'Gemma 3 Nano',
    description: 'Fastest · lowest memory',
    size: '~250 MB',
    url: 'https://huggingface.co/litert-community/gemma-3-270m-it-litert-lm/resolve/main/gemma-3-270m-it-litert-lm.task',
    filename: 'sip_gemma_nano.task',
  },
  small: {
    id: 'small',
    label: 'Gemma 3 1B (int4)',
    description: 'Recommended · 4-bit quantised · web optimised',
    size: '~670 MB',
    url: 'https://smart-invoice-pro-six.vercel.app/api/model-proxy?id=small',
    nativeUrl:
      'https://github.com/domxx9/smart-invoice-pro/releases/download/v1.0-models/gemma3-1b-int4-web.task',
    filename: 'sip_gemma_small.task',
    public: true,
  },
  pro: {
    id: 'pro',
    label: 'Gemma 2 2B',
    description: 'Highest accuracy · large download',
    size: '~1.6 GB',
    url: 'https://huggingface.co/litert-community/gemma-2-2b-it-litert-lm/resolve/main/gemma-2-2b-it-litert-lm.task',
    filename: 'sip_gemma_pro.task',
  },
  embedder: {
    id: 'embedder',
    label: 'Universal Sentence Encoder',
    description: 'Lightweight semantic search model',
    size: '~30 MB',
    url: 'https://storage.googleapis.com/mediapipe-models/text_embedder/universal_sentence_encoder/float32/1/universal_sentence_encoder.tflite',
    filename: 'sip_embedder.tflite',
    public: true,
  },
  alt: {
    id: 'alt',
    label: 'Llama 3.2 1B',
    description: 'Alternative · Meta model',
    size: '~1 GB',
    url: 'https://huggingface.co/litert-community/Llama-3.2-1B-Instruct-it-litert-lm/resolve/main/Llama-3.2-1B-Instruct-it-litert-lm.task',
    filename: 'sip_gemma_alt.task',
  },
  llama_et: {
    id: 'llama_et',
    label: 'Llama 3.2 1B (ExecuTorch)',
    description: 'Native Android · ExecuTorch backend · no WebGPU required',
    size: '~1.2 GB',
    url: 'https://huggingface.co/executorch-community/Llama-3.2-1B-Instruct-QLORA_INT4_EO8-ET/resolve/main/Llama-3.2-1B-Instruct-QLORA_INT4_EO8.pte',
    tokenizerUrl:
      'https://huggingface.co/executorch-community/Llama-3.2-1B-Instruct-QLORA_INT4_EO8-ET/resolve/main/tokenizer.model',
    filename: 'sip_llama_et.pte',
    executorch: true,
  },
}

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'

// ─── Platform detection ───────────────────────────────────────────────────────

function isNative() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
}

export function isNativePlatform() {
  return isNative()
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _llm = null
let _loadedModelId = null
let _abortCtrl = null

// ─── WebGPU ───────────────────────────────────────────────────────────────────

export function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

// ─── OPFS helpers (web only) ──────────────────────────────────────────────────

function hasOPFS() {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  )
}

async function opfsRoot() {
  return navigator.storage.getDirectory()
}

// ─── Native filesystem helpers ────────────────────────────────────────────────

async function nativeFs() {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  return { Filesystem, Directory }
}

// ─── Model presence check ─────────────────────────────────────────────────────

export async function isModelDownloaded(modelId) {
  const filename = MODELS[modelId].filename
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await nativeFs()
      await Filesystem.stat({ path: filename, directory: Directory.Data })
      return true
    } catch {
      return false
    }
  }
  if (!hasOPFS()) return false
  try {
    const root = await opfsRoot()
    await root.getFileHandle(filename)
    return true
  } catch {
    return false
  }
}

// ─── Delete model ─────────────────────────────────────────────────────────────

export async function deleteModel(modelId) {
  if (_loadedModelId === modelId) {
    try {
      _llm?.close?.()
    } catch {
      /* ignore */
    }
    _llm = null
    _loadedModelId = null
  }
  const filename = MODELS[modelId].filename
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await nativeFs()
      await Filesystem.deleteFile({ path: filename, directory: Directory.Data })
    } catch {
      /* already gone */
    }
    return
  }
  try {
    const root = await opfsRoot()
    await root.removeEntry(filename)
  } catch {
    /* already gone */
  }
}

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Download a model with progress tracking.
 * Native: uses @capacitor/filesystem (native HTTP, no CORS, no OPFS).
 * Web:    streams via fetch() to OPFS.
 */
export async function downloadModel(modelId, onProgress, hfToken) {
  const model = MODELS[modelId]
  if (!model) throw new Error(`Unknown model: ${modelId}`)
  if (!hasWebGPU()) throw new Error('WebGPU not available in this browser')

  if (isNative()) {
    return _downloadNative(model, onProgress)
  }
  return _downloadWeb(model, onProgress, hfToken)
}

// ── Native download via @capacitor/filesystem ────────────────────────────────

async function _downloadNative(model, onProgress) {
  const { Filesystem, Directory } = await nativeFs()

  // Use nativeUrl if present (direct GitHub, bypasses CORS proxy)
  const url = model.nativeUrl || model.url
  logger.info('ai', 'download start:', model.id, url)

  const progressListener = await Filesystem.addListener('progress', (event) => {
    if (event.url === url && event.contentLength > 0) {
      const pct = Math.round((event.bytes / event.contentLength) * 100)
      if (pct % 10 === 0) logger.debug('ai', `download ${model.id}: ${pct}%`)
      onProgress?.(event.bytes / event.contentLength)
    }
  })

  try {
    await Filesystem.downloadFile({
      url,
      path: model.filename,
      directory: Directory.Data,
      progress: true,
    })
    logger.info('ai', 'download complete:', model.id)
  } finally {
    progressListener.remove()
  }
}

// ── Web download via fetch → OPFS ─────────────────────────────────────────────

async function _downloadWeb(model, onProgress, hfToken) {
  _abortCtrl = new AbortController()

  const headers = {}
  if (hfToken && !model.public) headers['Authorization'] = `Bearer ${hfToken}`

  // Signal "connecting" as soon as the user clicks — the network round-trip
  // can take seconds and the UI must show motion (SMA-47). `null` is strictly
  // the pre-fetch sentinel; once bytes flow we switch to a fraction or `-1`.
  onProgress?.(null)

  let res
  try {
    res = await fetch(model.url, { signal: _abortCtrl.signal, headers })
  } catch (err) {
    _abortCtrl = null
    throw new Error(`Network error — check your connection (${err.message})`)
  }

  if (!res.ok) {
    _abortCtrl = null
    throw new Error(
      `Download failed: HTTP ${res.status}` +
        (res.status === 401 ? ' — check HuggingFace token or model licence' : ''),
    )
  }

  const rawLen = res.headers.get('content-length')
  const total = parseInt(rawLen || '0', 10)
  if (import.meta.env?.DEV) {
    logger.debug('ai', 'download content-length:', rawLen, '→ total bytes:', total)
  }
  const reader = res.body.getReader()

  const root = await opfsRoot()
  const fh = await root.getFileHandle(model.filename, { create: true })
  const writable = await fh.createWritable()

  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      received += value.byteLength
      // Progress sentinel (SMA-47):
      //   null      → pre-fetch "Connecting…"
      //   -1        → bytes flowing, upstream stripped content-length
      //                (Settings.jsx animates + labels "Downloading…")
      //   0..1      → determinate fraction
      //   1 (final) → done
      onProgress?.(total > 0 ? received / total : -1)
    }
    await writable.close()
    onProgress?.(1)
  } catch (err) {
    await writable.abort()
    try {
      await root.removeEntry(model.filename)
    } catch {
      /* ignore */
    }
    throw err
  } finally {
    _abortCtrl = null
  }
}

export function cancelDownload() {
  _abortCtrl?.abort()
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Build the MediaPipe modelOptions payload for a given model id, reading the
 * downloaded file from the platform-appropriate storage (OPFS on web, Capacitor
 * filesystem on native). Throws a specific error if the file is missing so the
 * UI can prompt the user to re-download (SMA-47).
 */
export async function buildModelOptions(modelId) {
  const model = MODELS[modelId]
  if (!model) throw new Error(`Unknown model: ${modelId}`)
  const filename = model.filename

  if (isNative()) {
    const { Filesystem, Directory } = await nativeFs()
    try {
      await Filesystem.stat({ path: filename, directory: Directory.Data })
    } catch {
      throw new Error('Model file missing — please re-download')
    }
    // Get native URI then convert to http://localhost/_capacitor_file_/...
    // so MediaPipe's internal fetch() can load it without reading into JS heap
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Data })
    const { Capacitor } = await import('@capacitor/core')
    const webUrl = Capacitor.convertFileSrc(uri)
    logger.debug('ai', 'buildModelOptions native uri:', uri)
    logger.debug('ai', 'buildModelOptions webUrl:', webUrl)
    return { baseOptions: { modelAssetPath: webUrl } }
  }

  if (!hasOPFS()) {
    throw new Error('Browser storage unavailable — OPFS is required')
  }
  const root = await opfsRoot()
  let fh
  try {
    fh = await root.getFileHandle(filename)
  } catch {
    throw new Error('Model file missing — please re-download')
  }
  const file = await fh.getFile()
  const buffer = await file.arrayBuffer()
  // MediaPipe types `modelAssetBuffer` as `Uint8Array | ReadableStreamDefaultReader`
  // (genai.d.ts:46). A raw ArrayBuffer silently fails its instanceof check and
  // surfaces as "No model asset provided" inside LlmInference.createFromOptions
  // (SMA-46). Wrap before returning.
  const modelAssetBuffer = new Uint8Array(buffer)
  logger.debug(
    'ai',
    'buildModelOptions buffer bytes:',
    modelAssetBuffer.byteLength,
    'file:',
    filename,
  )
  if (modelAssetBuffer.byteLength === 0) {
    try {
      await root.removeEntry(filename)
    } catch {
      /* ignore */
    }
    throw new Error('Model file is 0 bytes — please re-download')
  }
  return { baseOptions: { modelAssetBuffer } }
}

/**
 * Load a downloaded model into memory (WebGPU).
 */
export async function initModel(modelId) {
  if (_llm && _loadedModelId === modelId) return

  if (_llm) {
    try {
      _llm.close?.()
    } catch {
      /* ignore */
    }
    _llm = null
    _loadedModelId = null
  }

  const modelOptions = await buildModelOptions(modelId)

  let FilesetResolver, LlmInference
  try {
    ;({ FilesetResolver, LlmInference } = await import('@mediapipe/tasks-genai'))
  } catch (e) {
    throw new Error(`Failed to load MediaPipe runtime: ${e.message || e}`)
  }

  let genai
  try {
    genai = await FilesetResolver.forGenAiTasks(WASM_CDN)
  } catch (e) {
    throw new Error(`Failed to fetch MediaPipe WASM: ${e.message || e}`)
  }

  logger.info('ai', 'LlmInference.createFromOptions start:', modelId, 'native:', isNative())
  try {
    _llm = await LlmInference.createFromOptions(genai, {
      ...modelOptions,
      // Session KV-cache cap. Per-call enforcement lives in streamingGuard
      // (SMA-78: Stage 1 = 2048, Stage 3 = 512); keep this >= the largest
      // per-call cap and raise it (with rationale) only when a new caller
      // actually needs more headroom. SMA-84.
      maxTokens: SESSION_MAX_TOKENS,
      temperature: 0.1,
      topK: 1,
    })
  } catch (e) {
    const detail = e?.message || String(e)
    throw new Error(`MediaPipe could not load this model: ${detail}`)
  }
  _loadedModelId = modelId
  logger.info('ai', 'model loaded OK:', modelId)
}

export function isGemmaReady() {
  return _llm !== null
}
export function getLoadedModelId() {
  return _loadedModelId
}
export function getBackendInfo() {
  if (!_loadedModelId) return null
  return { device: 'webgpu', dtype: 'float16' }
}

// ─── Prompt formatting ────────────────────────────────────────────────────────

function gemmaPrompt(text) {
  return `<start_of_turn>user\n${text}\n<end_of_turn>\n<start_of_turn>model\n`
}

// ─── General inference ────────────────────────────────────────────────────────

export async function generate(userPrompt, onToken) {
  if (!_llm) throw new Error('Model not loaded — download and load a model first')
  return new Promise((resolve, reject) => {
    let out = ''
    try {
      _llm.generateResponse(gemmaPrompt(userPrompt), (chunk, done) => {
        out += chunk
        onToken?.(out, done)
        if (done) resolve(out)
      })
    } catch (e) {
      reject(e)
    }
  })
}

export function cancelGeneration() {
  _llm?.cancelProcessing?.()
}

// ─── Convenience ─────────────────────────────────────────────────────────────

export async function ensureReady(modelId) {
  if (_llm && _loadedModelId === modelId) return true
  if (!hasWebGPU()) return false
  const downloaded = await isModelDownloaded(modelId)
  if (!downloaded) return false
  try {
    await initModel(modelId)
    return true
  } catch {
    return false
  }
}
