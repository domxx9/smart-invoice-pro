// Web Worker for ONNX/Transformers.js inference (off-main-thread)

const MODELS = {
  small: {
    id: 'small',
    label: 'Qwen 2.5 0.5B (q4)',
    description: 'Fast · CPU/RAM · no GPU needed',
    size: '~300 MB',
    repo: 'onnx-community/Qwen2.5-0.5B-Instruct',
    dtype: 'q4',
  },
}

let _transformers = null
let _pipe = null
let _loadedModelId = null

async function tx() {
  if (!_transformers) {
    _transformers = await import('@huggingface/transformers')
    const { env } = _transformers
    env.backends.onnx.wasm.wasmPaths = '/'
    // numThreads=1: SharedArrayBuffer is unavailable in Capacitor WebView
    // without COOP/COEP headers. The threaded WASM variant crashes trying
    // to init shared memory even on high-RAM devices (Pixel 10 Pro etc).
    // Single-threaded is slower but actually works.
    env.backends.onnx.wasm.numThreads = 1
    env.useBrowserCache  = true
    env.allowLocalModels = false
  }
  return _transformers
}

function makeProgressCb(onProgress) {
  // p.loaded / p.total are bytes — gives 0-1 fraction
  // Do NOT use p.progress — HuggingFace sends that as 0-100 (percentage)
  const files = new Map()
  return (p) => {
    if ((p.status === 'downloading' || p.status === 'progress') && p.total > 0) {
      files.set(p.file ?? p.name ?? 'f', { loaded: p.loaded, total: p.total })
      let loaded = 0, total = 0
      for (const f of files.values()) { loaded += f.loaded; total += f.total }
      if (total > 0) onProgress(Math.min(loaded / total, 1))
    }
  }
}

async function loadModel(modelId, onProgress) {
  const model = MODELS[modelId]
  if (!model) throw new Error(`Unknown model: ${modelId}`)

  const { pipeline } = await tx()
  const progressCb = makeProgressCb(onProgress)

  _pipe = await pipeline('text-generation', model.repo, {
    dtype: model.dtype,
    device: 'wasm',
    progress_callback: progressCb,
  })

  _loadedModelId = modelId
  // localStorage not available in Web Workers — main thread sets the cached flag
}

async function initModel(modelId) {
  // If same model already loaded, do nothing
  if (_loadedModelId === modelId && _pipe) {
    return
  }

  const model = MODELS[modelId]
  if (!model) throw new Error(`Unknown model: ${modelId}`)

  const { pipeline } = await tx()
  _pipe = await pipeline('text-generation', model.repo, {
    dtype: model.dtype,
    device: 'wasm',
  })

  _loadedModelId = modelId
}

async function unloadModel() {
  if (_pipe?.dispose) {
    await _pipe.dispose()
  }
  _pipe = null
  _loadedModelId = null
}

async function matchWithGemma(itemName, candidates) {
  if (!_pipe) throw new Error('Model not loaded')

  const systemPrompt = `You are a product matcher. Match input items to catalog products. Reply with ONLY the number (1-${candidates.length}) of the best match. If none match, reply 0.`
  const list = candidates
    .map((p, i) => {
      const desc = p.desc ? ` — ${p.desc.slice(0, 40)}` : ''
      return `${i + 1}. ${p.name}${desc}`
    })
    .join('\n')
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Item: "${itemName}"\n\nOptions:\n${list}\n\nNumber:` },
  ]

  const result = await _pipe(messages, { max_new_tokens: 3 })
  const out = result[0]?.generated_text?.at(-1)?.content ?? ''
  const num = parseInt(out.trim().match(/\d+/)?.[0] ?? '0', 10)
  return num >= 1 && num <= candidates.length ? candidates[num - 1] : null
}

async function cleanOrderText(text, onToken) {
  if (!_pipe) throw new Error('Model not loaded')

  const { TextStreamer } = await tx()
  let fullText = ''

  const streamer = new TextStreamer(_pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
  })

  streamer.on('token', (token) => {
    fullText += token
    onToken(token, fullText)
  })

  const systemPrompt = `You are a document cleaning assistant. Clean and normalize raw pasted order text. Output clean, structured text.`
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: text },
  ]

  await _pipe(messages, { streamer, max_new_tokens: 500 })
  return fullText
}

async function generate(userPrompt, onToken) {
  if (!_pipe) throw new Error('Model not loaded')

  const { TextStreamer } = await tx()
  let fullText = ''

  const streamer = new TextStreamer(_pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
  })

  streamer.on('token', (token) => {
    fullText += token
    onToken(token, fullText)
  })

  const messages = [{ role: 'user', content: userPrompt }]

  await _pipe(messages, { streamer, max_new_tokens: 500 })
  return fullText
}

self.onmessage = async (event) => {
  const { type, taskId, modelId, task, payload } = event.data

  try {
    switch (type) {
      case 'LOAD': {
        const onProgress = (progress) => {
          self.postMessage({ type: 'LOAD_PROGRESS', taskId, progress })
        }
        await loadModel(modelId, onProgress)
        self.postMessage({ type: 'LOAD_DONE', taskId })
        break
      }

      case 'INIT': {
        await initModel(modelId)
        self.postMessage({ type: 'INIT_DONE', taskId })
        break
      }

      case 'INFER': {
        if (task === 'match') {
          const { itemName, candidates } = payload
          const result = await matchWithGemma(itemName, candidates)
          self.postMessage({ type: 'INFER_DONE', taskId, result })
        } else if (task === 'clean') {
          const { text } = payload
          const result = await cleanOrderText(text, (token, full) => {
            self.postMessage({ type: 'INFER_TOKEN', taskId, token, full })
          })
          self.postMessage({ type: 'INFER_DONE', taskId, result })
        } else if (task === 'generate') {
          const { prompt } = payload
          const result = await generate(prompt, (token, full) => {
            self.postMessage({ type: 'INFER_TOKEN', taskId, token, full })
          })
          self.postMessage({ type: 'INFER_DONE', taskId, result })
        } else {
          throw new Error(`Unknown task: ${task}`)
        }
        break
      }

      case 'UNLOAD': {
        await unloadModel()
        self.postMessage({ type: 'UNLOAD_DONE', taskId })
        break
      }

      default:
        throw new Error(`Unknown message type: ${type}`)
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', taskId, error: err.message })
  }
}
