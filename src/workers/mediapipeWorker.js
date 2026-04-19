/**
 * MediaPipe LLM Inference dedicated Web Worker (SMA-39 Track B).
 *
 * Owns the `LlmInference` instance off the main thread so long JS tasks
 * from WebGPU + MediaPipe tokenisation do not block React rendering.
 *
 * Protocol (main thread ↔ worker):
 *   CAPCHECK          → CAPCHECK_RESULT { webgpu }
 *   LOAD              → LOAD_PROGRESS { progress, stage } * → LOAD_DONE
 *   INFER { id }      → INFER_TOKEN { id, token, partial } * → INFER_DONE { id, text }
 *   (anything)        → ERROR { id?, message }
 */

// MediaPipe's genai bundle calls `self.import(url)` in module workers as a
// fallback for `importScripts` (which module workers don't expose). The wasm
// glue script it loads (`genai_wasm_internal.js`) declares
// `var ModuleFactory = (() => {...})` and then asserts `self.ModuleFactory`
// is defined. That contract only holds under classic-script semantics, where
// top-level `var` becomes a global property. Native dynamic `import()` parses
// the response as an ES module, so `ModuleFactory` stays module-scoped and
// MediaPipe throws "ModuleFactory not set." (SMA-67 — SMA-47 polyfill
// regression). Fetch the script as text and run it via indirect eval
// (`(0, eval)`) so it evaluates in the worker's global scope.
if (typeof self !== 'undefined' && typeof self.import !== 'function') {
  self.import = async (url) => {
    const res = await fetch(url, { credentials: 'omit' })
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
    const code = await res.text()
    ;(0, eval)(code)
  }
}

import { createCappedStreamer } from './streamingGuard.js'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'

// Session-wide KV-cache budget passed to LlmInference.createFromOptions.
// Per-call limits are enforced first by streamingGuard (SMA-78: Stage 1 = 2048,
// Stage 3 = 512), so this only needs headroom for the largest call plus future
// growth. Keep this >= the max per-call cap; raise it (and document why) if a
// new call site needs more than ~4k tokens. SMA-84.
export const SESSION_MAX_TOKENS = 4096

let _llm = null

function post(msg, transfer) {
  if (transfer && transfer.length) self.postMessage(msg, transfer)
  else self.postMessage(msg)
}

function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}

async function handleLoad({ modelOptions }) {
  post({ type: 'LOAD_PROGRESS', progress: 0, stage: 'wasm' })
  const { FilesetResolver, LlmInference } = await import('@mediapipe/tasks-genai')
  const genai = await FilesetResolver.forGenAiTasks(WASM_CDN)

  post({ type: 'LOAD_PROGRESS', progress: 0.5, stage: 'model' })
  _llm = await LlmInference.createFromOptions(genai, {
    ...modelOptions,
    maxTokens: modelOptions?.maxTokens ?? SESSION_MAX_TOKENS,
    temperature: modelOptions?.temperature ?? 0.1,
    topK: modelOptions?.topK ?? 1,
  })
  post({ type: 'LOAD_PROGRESS', progress: 1, stage: 'ready' })
  post({ type: 'LOAD_DONE' })
}

function handleInfer({ id, prompt, maxTokens }) {
  if (!_llm) {
    post({ type: 'ERROR', id, message: 'Model not loaded' })
    return
  }
  const guard = createCappedStreamer({
    maxTokens,
    onToken: (chunk, partial) => {
      post({ type: 'INFER_TOKEN', id, token: chunk, partial })
    },
    onDone: (text, stopReason) => {
      post({ type: 'INFER_DONE', id, text, stopReason })
    },
    onAbort: () => {
      try {
        _llm.cancelProcessing?.()
      } catch {
        /* best-effort: underlying processor may already be idle */
      }
    },
  })
  try {
    _llm.generateResponse(prompt, (chunk, done) => {
      guard.feed(chunk, done)
    })
  } catch (err) {
    post({ type: 'ERROR', id, message: err?.message || String(err) })
  }
}

self.onmessage = async (e) => {
  const msg = e.data || {}
  try {
    switch (msg.type) {
      case 'CAPCHECK':
        post({ type: 'CAPCHECK_RESULT', webgpu: hasWebGPU() })
        break
      case 'LOAD':
        await handleLoad(msg)
        break
      case 'INFER':
        handleInfer(msg)
        break
      case 'CANCEL':
        try {
          _llm?.cancelProcessing?.()
        } catch {
          /* ignore */
        }
        break
      default:
        post({ type: 'ERROR', message: `Unknown message type: ${msg.type}` })
    }
  } catch (err) {
    post({ type: 'ERROR', id: msg.id, message: err?.message || String(err) })
  }
}
