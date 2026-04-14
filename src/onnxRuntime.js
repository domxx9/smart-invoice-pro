/**
 * onnxRuntime.js
 * Main-thread facade that wraps a Web Worker for on-device AI inference.
 * Drop-in replacement for gemma.js with the same exported API.
 */

// ============================================================================
// Constants
// ============================================================================

export const MODELS = {
  small: {
    id: 'small',
    label: 'Qwen 2.5 0.5B (q4)',
    description: 'Fast · CPU/RAM · no GPU needed',
    size: '~300 MB',
    repo: 'onnx-community/Qwen2.5-0.5B-Instruct',
    dtype: 'q4',
  },
}

// ============================================================================
// Module-level state
// ============================================================================

let _worker = null
let _loadedModelId = null
let _isReady = false
let _abortCtrl = null
let _taskCounter = 0

const _tasks = new Map()

// ============================================================================
// Worker management
// ============================================================================

function resetWorkerState() {
  _worker = null
  _isReady = false
  _loadedModelId = null
}

function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL('./workers/onnxWorker.js', import.meta.url), { type: 'module' })
    _worker.onmessage = handleWorkerMessage
    _worker.onerror = (e) => {
      console.error('[SIP Worker] uncaught error:', e)
      // Reject all pending tasks then reset so next attempt gets a fresh worker
      for (const [id, task] of _tasks) {
        task.reject(new Error(e.message || 'Worker crashed'))
        _tasks.delete(id)
      }
      _worker?.terminate()
      resetWorkerState()
    }
  }
  return _worker
}

function nextTaskId() {
  return `t${++_taskCounter}`
}

function sendToWorker(type, extra = {}, callbacks = {}) {
  const taskId = nextTaskId()
  return new Promise((resolve, reject) => {
    _tasks.set(taskId, { resolve, reject, ...callbacks })
    getWorker().postMessage({ type, taskId, ...extra })
  })
}

function handleWorkerMessage(event) {
  const { type, taskId, progress, token, full, result, error } = event.data

  const task = _tasks.get(taskId)
  if (!task) {
    console.warn('[SIP Runtime] Received message for unknown taskId:', taskId)
    return
  }

  switch (type) {
    case 'LOAD_PROGRESS':
      task.onProgress?.(progress)
      break

    case 'LOAD_DONE':
      _tasks.delete(taskId)
      task.resolve(result ?? null)
      break

    case 'INIT_DONE':
      _tasks.delete(taskId)
      task.resolve(result ?? null)
      break

    case 'INFER_TOKEN':
      task.onToken?.(token, full)
      break

    case 'INFER_DONE':
      _tasks.delete(taskId)
      task.resolve(result ?? null)
      break

    case 'UNLOAD_DONE':
      _tasks.delete(taskId)
      task.resolve(result ?? null)
      break

    case 'ERROR':
      _tasks.delete(taskId)
      task.reject(new Error(error))
      // Terminate broken worker — next call to getWorker() creates a fresh one
      _worker?.terminate()
      resetWorkerState()
      break

    default:
      console.warn('[SIP Runtime] Unknown message type:', type)
  }
}

// ============================================================================
// Capability checks
// ============================================================================

export function hasWebGPU() {
  return true
}

export async function checkGpuCapability() {
  return true
}

// ============================================================================
// Download state
// ============================================================================

export async function isModelDownloaded(modelId) {
  return !!localStorage.getItem('sip_model_cached_' + modelId)
}

// ============================================================================
// Lifecycle
// ============================================================================

export async function downloadModel(modelId, onProgress) {
  _abortCtrl = new AbortController()
  return sendToWorker('LOAD', { modelId }, { onProgress }).then((result) => {
    _loadedModelId = modelId
    _isReady = true
    // Worker can't access localStorage — set cached flag here on main thread
    localStorage.setItem('sip_model_cached_' + modelId, '1')
    onProgress?.(1)
    return result
  })
}

export function cancelDownload() {
  _abortCtrl?.abort()
}

export async function deleteModel(modelId) {
  // Unload first if it's the current model
  if (_loadedModelId === modelId) {
    await unloadModel()
  }

  // Remove localStorage flags
  localStorage.removeItem('sip_model_cached_' + modelId)
  localStorage.removeItem('sip_model_ok_' + modelId)

  // Best-effort: clear HF Cache API (copied from gemma.js logic)
  try {
    if ('caches' in globalThis) {
      const cacheNames = await caches.keys()
      const modelCacheName = `huggingface-transformers-cache-${modelId}`
      if (cacheNames.includes(modelCacheName)) {
        await caches.delete(modelCacheName)
      }
    }
  } catch (e) {
    console.warn('[SIP Runtime] Failed to clear cache:', e)
  }
}

export async function initModel(modelId) {
  if (_isReady && _loadedModelId === modelId) {
    return
  }

  return sendToWorker('INIT', { modelId }).then((result) => {
    _loadedModelId = modelId
    _isReady = true
    return result
  })
}

export async function unloadModel() {
  if (!_isReady) {
    return
  }

  return sendToWorker('UNLOAD', {}).then((result) => {
    _loadedModelId = null
    _isReady = false
    return result
  })
}

// ============================================================================
// Status
// ============================================================================

export function isGemmaReady() {
  return _isReady
}

export function getLoadedModelId() {
  return _loadedModelId
}

// ============================================================================
// Inference
// ============================================================================

export async function cleanOrderText(text, onToken) {
  if (!_isReady) {
    throw new Error('Model not loaded')
  }

  return sendToWorker(
    'INFER',
    { task: 'clean', payload: { text } },
    { onToken: (token, full) => onToken?.(full, false) }
  ).then((result) => {
    onToken?.(result, true)
    return result
  })
}

export async function matchWithGemma(itemName, candidates) {
  if (!_isReady || !candidates.length) {
    return null
  }

  return sendToWorker('INFER', { task: 'match', payload: { itemName, candidates } })
}

export async function generate(userPrompt, onToken) {
  if (!_isReady) {
    throw new Error('Model not loaded')
  }

  return sendToWorker(
    'INFER',
    { task: 'generate', payload: { prompt: userPrompt } },
    { onToken: (token, full) => onToken?.(full, false) }
  ).then((result) => {
    onToken?.(result, true)
    return result
  })
}

export function cancelGeneration() {
  // Streaming cancel not supported yet
}

// ============================================================================
// Convenience
// ============================================================================

export async function ensureReady(modelId) {
  if (_isReady && _loadedModelId === modelId) {
    return true
  }

  const downloaded = await isModelDownloaded(modelId)
  if (!downloaded) {
    return false
  }

  try {
    await initModel(modelId)
    return true
  } catch (e) {
    console.error('[SIP Runtime] Failed to ensure ready:', e)
    return false
  }
}
