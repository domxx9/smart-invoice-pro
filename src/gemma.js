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
    // Served through Vercel edge proxy (adds CORS headers) for web.
    // Native uses CapacitorHttp directly to GitHub, so no CORS needed there.
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
  alt: {
    id: 'alt',
    label: 'Llama 3.2 1B',
    description: 'Alternative · Meta model',
    size: '~1 GB',
    url: 'https://huggingface.co/litert-community/Llama-3.2-1B-Instruct-it-litert-lm/resolve/main/Llama-3.2-1B-Instruct-it-litert-lm.task',
    filename: 'sip_gemma_alt.task',
  },
}

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'

// ─── Platform detection ───────────────────────────────────────────────────────

function isNative() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()
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
  console.log('[SIP] download start:', model.id, url)

  const progressListener = await Filesystem.addListener('progress', (event) => {
    if (event.url === url && event.contentLength > 0) {
      const pct = Math.round((event.bytes / event.contentLength) * 100)
      if (pct % 10 === 0) console.log(`[SIP] download ${model.id}: ${pct}%`)
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
    console.log('[SIP] download complete:', model.id)
  } finally {
    progressListener.remove()
  }
}

// ── Web download via fetch → OPFS ─────────────────────────────────────────────

async function _downloadWeb(model, onProgress, hfToken) {
  _abortCtrl = new AbortController()

  const headers = {}
  if (hfToken && !model.public) headers['Authorization'] = `Bearer ${hfToken}`

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

  const total = parseInt(res.headers.get('content-length') || '0', 10)
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
      if (total > 0) onProgress?.(received / total)
    }
    await writable.close()
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

  const { FilesetResolver, LlmInference } = await import('@mediapipe/tasks-genai')
  const genai = await FilesetResolver.forGenAiTasks(WASM_CDN)

  let modelOptions

  if (isNative()) {
    // Get native URI then convert to http://localhost/_capacitor_file_/...
    // so MediaPipe's internal fetch() can load it without reading into JS heap
    const { Filesystem, Directory } = await nativeFs()
    const { uri } = await Filesystem.getUri({
      path: MODELS[modelId].filename,
      directory: Directory.Data,
    })
    const { Capacitor } = await import('@capacitor/core')
    const webUrl = Capacitor.convertFileSrc(uri)
    console.log('[SIP] initModel native uri:', uri)
    console.log('[SIP] initModel webUrl:', webUrl)
    modelOptions = { baseOptions: { modelAssetPath: webUrl } }
  } else {
    const root = await opfsRoot()
    const fh = await root.getFileHandle(MODELS[modelId].filename)
    const file = await fh.getFile()
    const buffer = await file.arrayBuffer()
    modelOptions = { baseOptions: { modelAssetBuffer: buffer } }
  }

  console.log('[SIP] LlmInference.createFromOptions start:', modelId)
  _llm = await LlmInference.createFromOptions(genai, {
    ...modelOptions,
    maxTokens: 10000,
    temperature: 0.1,
    topK: 1,
  })
  _loadedModelId = modelId
  console.log('[SIP] model loaded OK:', modelId)
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

// ─── Full-text order parsing ──────────────────────────────────────────────────

/**
 * Send raw order text (WhatsApp, email, etc.) to the LLM along with the
 * known product catalog so the model can match items directly.
 *
 * @param {string}   text      - Raw pasted text (WhatsApp, email, list…)
 * @param {Array}    products  - Full product catalog [{name, price, …}]
 * @param {Function} onToken   - Optional streaming callback (partialOutput, done)
 * @returns {Promise<Array<{name:string, qty:number}>>}
 *          name is the matched product name from the catalog (or best attempt).
 */
/**
 * Stage 1 — LLM pre-processor.
 * Strips WhatsApp timestamps, contact names, greetings, questions.
 * Splits combined lines ("scissors and probe") into one item per line.
 * Returns plain text — no catalog needed, tiny prompt, fast.
 */
export async function cleanOrderText(text, onToken) {
  if (!_llm) throw new Error('Model not loaded')

  const prompt = gemmaPrompt(
    `Clean up this order message. Your job:
- Remove timestamps (e.g. [12:00, 11/04/2026]), contact names, phone numbers
- Remove greetings, questions, delivery instructions, anything not an item order
- If a line mentions multiple items, split them onto separate lines
- Keep any quantities (numbers) next to their item
- Return ONLY the cleaned order lines, one item per line, nothing else

Message:
${text.slice(0, 800)}

Cleaned lines:`,
  )

  return new Promise((resolve) => {
    let out = ''
    try {
      _llm.generateResponse(prompt, (chunk, done) => {
        out += chunk
        onToken?.(out, done)
        if (done) {
          console.log('[SIP] cleanOrderText raw:', JSON.stringify(out))
          resolve(out.trim() || text)
        }
      })
    } catch (e) {
      console.error('[SIP] cleanOrderText error:', e)
      try {
        _llm?.cancelProcessing?.()
      } catch {
        /* ignore */
      }
      resolve(text) // fallback: use original text unchanged
    }
  })
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
