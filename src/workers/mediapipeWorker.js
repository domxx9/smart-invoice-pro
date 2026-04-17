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

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'

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
    maxTokens: modelOptions?.maxTokens ?? 10000,
    temperature: modelOptions?.temperature ?? 0.1,
    topK: modelOptions?.topK ?? 1,
  })
  post({ type: 'LOAD_PROGRESS', progress: 1, stage: 'ready' })
  post({ type: 'LOAD_DONE' })
}

function handleInfer({ id, prompt }) {
  if (!_llm) {
    post({ type: 'ERROR', id, message: 'Model not loaded' })
    return
  }
  let out = ''
  try {
    _llm.generateResponse(prompt, (chunk, done) => {
      out += chunk
      post({ type: 'INFER_TOKEN', id, token: chunk, partial: out })
      if (done) post({ type: 'INFER_DONE', id, text: out })
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
