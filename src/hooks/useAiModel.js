import { useState, useEffect, useCallback, useRef } from 'react'
import { STORAGE_KEYS } from '../constants/storageKeys.js'
import {
  isEmbedderDownloaded,
  handleEmbedderDownload,
  handleEmbedderDelete,
  loadEmbedder,
} from '../ai/embeddings.js'
import {
  MODELS as AI_MODELS,
  isModelDownloaded,
  downloadModel as gemmaDownload,
  deleteModel as gemmaDelete,
  initModel as gemmaInit,
  buildModelOptions,
  isNativePlatform,
} from '../gemma.js'
import { initGemma } from '../gemmaWorker.js'
import { testConnection as byokTestConnection, listModels as byokListModels } from '../byok.js'
import { getSecret, deleteSecret } from '../secure-storage.js'
import { runInference as pipelineRunInference } from '../ai/pipeline.js'
import { logger } from '../utils/logger.js'
import {
  isAvailable as executorchAvailable,
  loadModel as executorchLoadModel,
  unloadModel as executorchUnloadModel,
} from '../plugins/executorch.js'
import { Filesystem, Directory } from '@capacitor/filesystem'

/**
 * Load a model via the worker facade (SMA-39) with a desktop fallback to
 * the main-thread gemma.js path when the worker can't run MediaPipe. On
 * Capacitor/Android where WebGPU isn't available in the worker, surfaces
 * `unavailable: true` so the caller can prompt the user to switch to BYOK.
 * Throws a descriptive error on failure.
 */
async function loadModelViaFacade(id) {
  const modelOptions = await buildModelOptions(id)
  const result = await initGemma(modelOptions)
  if (result?.unavailable) {
    if (isNativePlatform()) {
      return { unavailable: true, reason: result.reason }
    }
    // Desktop browsers without Worker support (very rare) — fall back to
    // the main-thread path so the feature still works.
    await gemmaInit(id)
    return { ready: true, fallback: 'main-thread' }
  }
  return { ready: true }
}

export function useAiModel(toast, settings) {
  const [aiModelId, setAiModelId] = useState(
    () => localStorage.getItem(STORAGE_KEYS.AI_MODEL) || 'small',
  )
  const [aiDownloaded, setAiDownloaded] = useState({})
  const [aiDownloadProgress, setAiDownloadProgress] = useState({})
  const [aiDownloading, setAiDownloading] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [loadedModelId, setLoadedModelId] = useState(null)
  const [embedderDownloaded, setEmbedderDownloaded] = useState(false)
  const [embedderDownloading, setEmbedderDownloading] = useState(false)
  const [embedderProgress, setEmbedderProgress] = useState(0)
  const [embedderLoading, setEmbedderLoading] = useState(false)
  const [embedderReady, setEmbedderReady] = useState(false)
  const [byokStatus, setByokStatus] = useState('idle')
  const [byokError, setByokError] = useState('')
  const [executorchReady, setExecutorchReady] = useState(false)
  const [executorchModelId, setExecutorchModelId] = useState(null)

  // Keep current settings in a ref so `runInference` stays stable but always
  // reads the latest aiMode / byok* values without stale closures.
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    const check = async () => {
      const results = {}
      for (const id of Object.keys(AI_MODELS)) {
        results[id] = await isModelDownloaded(id)
      }
      setAiDownloaded(results)

      const embDownloaded = await isEmbedderDownloaded()
      setEmbedderDownloaded(embDownloaded)
      if (embDownloaded) {
        setEmbedderLoading(true)
        try {
          await loadEmbedder()
          setEmbedderReady(true)
        } catch (e) {
          logger.error('ai-model', 'auto-init embedder error:', e)
        } finally {
          setEmbedderLoading(false)
        }
      }

      const modelToLoad = localStorage.getItem(STORAGE_KEYS.AI_MODEL) || 'small'
      if (results[modelToLoad]) {
        setAiLoading(true)
        try {
          const result = await loadModelViaFacade(modelToLoad)
          if (result?.ready) {
            setAiReady(true)
            setLoadedModelId(modelToLoad)
          }
          // When unavailable on native we stay quiet on auto-init; the
          // BYOK panel in Settings already tells the user what to do.
        } catch (e) {
          logger.error('ai-model', 'auto-init error:', e)
        } finally {
          setAiLoading(false)
        }
      }
    }
    check()
  }, [])

  const handleAiSelect = (id) => {
    setAiModelId(id)
    localStorage.setItem(STORAGE_KEYS.AI_MODEL, id)
  }

  const handleAiDownload = async (id) => {
    setAiDownloading(id)
    setAiDownloadProgress((p) => ({ ...p, [id]: 0 }))
    try {
      await gemmaDownload(id, (frac) => setAiDownloadProgress((p) => ({ ...p, [id]: frac })))
      setAiDownloaded((p) => ({ ...p, [id]: true }))
      toast?.('AI model downloaded', 'success', '🤖')
    } catch (e) {
      if (e.name !== 'AbortError') {
        logger.error('ai-model', 'download error:', e)
        toast?.('Download failed — check your connection', 'error')
      }
    } finally {
      setAiDownloading(null)
    }
  }

  const handleAiDelete = async (id) => {
    await gemmaDelete(id)
    setAiDownloaded((p) => ({ ...p, [id]: false }))
    if (loadedModelId === id) {
      setAiReady(false)
      setLoadedModelId(null)
    }
  }

  const handleEmbedderDownloadAction = async () => {
    setEmbedderDownloading(true)
    setEmbedderProgress(0)
    try {
      await handleEmbedderDownload((frac) => setEmbedderProgress(frac))
      setEmbedderDownloaded(true)
      toast?.('Semantic Search model downloaded', 'success', '🧠')
    } catch (e) {
      if (e.name !== 'AbortError') {
        logger.error('ai-model', 'embedder download error:', e)
        toast?.('Download failed — check your connection', 'error')
      }
    } finally {
      setEmbedderDownloading(false)
    }
  }

  const handleEmbedderDeleteAction = async () => {
    await handleEmbedderDelete()
    setEmbedderDownloaded(false)
    setEmbedderReady(false)
  }

  const handleEmbedderLoadAction = async () => {
    setEmbedderLoading(true)
    try {
      await loadEmbedder()
      setEmbedderReady(true)
      toast?.('Semantic Search model ready', 'success', '⚡')
    } catch (e) {
      logger.error('ai-model', 'embedder load error:', e)
      toast?.(e?.message || 'Failed to load Semantic Search model', 'error')
    } finally {
      setEmbedderLoading(false)
    }
  }

  const handleAiLoad = async (id) => {
    setAiLoading(true)
    try {
      const result = await loadModelViaFacade(id)
      if (result?.unavailable) {
        toast?.(
          'On-device AI not supported on this device — switch to cloud AI (BYOK) in Settings',
          'error',
        )
        return
      }
      setAiReady(true)
      setLoadedModelId(id)
      toast?.('AI model loaded and ready', 'success', '⚡')
    } catch (e) {
      logger.error('ai-model', 'load error:', e)
      toast?.(e?.message || 'Failed to load AI model', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  const handleByokTest = useCallback(
    async ({ provider, baseUrl, model }) => {
      if (!provider) {
        setByokStatus('error')
        setByokError('Pick a provider first')
        return { ok: false, error: 'Pick a provider first' }
      }
      const apiKey = await getSecret(`sip_byok_${provider}`)
      if (!apiKey) {
        setByokStatus('error')
        setByokError('Enter an API key first')
        return { ok: false, error: 'Enter an API key first' }
      }
      setByokStatus('testing')
      setByokError('')
      const result = await byokTestConnection({ provider, apiKey, baseUrl, model })
      if (result.ok) {
        setByokStatus('ok')
        setByokError('')
        toast?.('Cloud AI connected', 'success', '✓')
      } else {
        setByokStatus('error')
        setByokError(result.error || 'Connection failed')
      }
      return result
    },
    [toast],
  )

  const handleByokClear = useCallback(async (provider) => {
    if (!provider) return
    await deleteSecret(`sip_byok_${provider}`)
    setByokStatus('idle')
    setByokError('')
  }, [])

  const handleByokListModels = useCallback(async ({ provider, baseUrl } = {}) => {
    if (!provider) return { ok: false, models: [], error: 'Pick a provider first' }
    const apiKey = await getSecret(`sip_byok_${provider}`)
    if (!apiKey) return { ok: false, models: [], error: 'Enter an API key first' }
    const result = await byokListModels({ provider, apiKey, baseUrl })
    if (!result.ok) return { ok: false, models: [], error: result.error }
    return { ok: true, models: result.models }
  }, [])

  const handleExecutorchLoad = useCallback(
    async (modelId) => {
      if (!executorchAvailable()) {
        toast?.('ExecuTorch not available on this platform', 'error')
        return
      }
      const model = AI_MODELS[modelId]
      if (!model) return
      if (!model.url || !model.tokenizerUrl) {
        toast?.('Model URLs not yet available — pending SMA-134', 'error')
        return
      }
      setAiLoading(true)
      try {
        await executorchLoadModel({
          modelPath: model.filename,
          tokenizerPath: model.filename.replace('.pte', '_tokenizer.bin'),
        })
        setExecutorchReady(true)
        setExecutorchModelId(modelId)
        toast?.('Native AI model loaded', 'success', '⚡')
      } catch (e) {
        logger.error('ai-model', 'executorch load error:', e)
        toast?.(e?.message || 'Failed to load native AI model', 'error')
      } finally {
        setAiLoading(false)
      }
    },
    [toast],
  )

  const handleExecutorchDelete = useCallback(async (modelId) => {
    try {
      await executorchUnloadModel()
    } catch {
      /* best-effort */
    }
    try {
      await Filesystem.deleteFile({ path: AI_MODELS[modelId]?.filename, directory: Directory.Data })
      await Filesystem.deleteFile({
        path: AI_MODELS[modelId]?.filename.replace('.pte', '_tokenizer.bin'),
        directory: Directory.Data,
      })
    } catch {
      /* already gone */
    }
    setExecutorchReady(false)
    setExecutorchModelId(null)
    setAiDownloaded((p) => ({ ...p, [modelId]: false }))
  }, [])

  const runInference = useCallback(
    ({ prompt, maxTokens = 512 } = {}) =>
      pipelineRunInference({ prompt, maxTokens, settings: settingsRef.current }),
    [],
  )

  return {
    aiModelId,
    aiDownloaded,
    aiDownloadProgress,
    aiDownloading,
    aiLoading,
    aiReady,
    loadedModelId,
    embedderDownloaded,
    embedderDownloading,
    embedderProgress,
    embedderLoading,
    embedderReady,
    byokStatus,
    byokError,
    executorchReady,
    executorchModelId,
    handleAiSelect,
    handleAiDownload,
    handleAiDelete,
    handleAiLoad,
    handleEmbedderDownload: handleEmbedderDownloadAction,
    handleEmbedderDelete: handleEmbedderDeleteAction,
    handleEmbedderLoad: handleEmbedderLoadAction,
    handleByokTest,
    handleByokClear,
    handleByokListModels,
    handleExecutorchLoad,
    handleExecutorchDelete,
    runInference,
  }
}
