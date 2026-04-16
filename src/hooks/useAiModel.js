import { useState, useEffect } from 'react'
import {
  MODELS as AI_MODELS,
  isModelDownloaded,
  downloadModel as gemmaDownload,
  deleteModel as gemmaDelete,
  initModel as gemmaInit,
  isGemmaReady,
  getLoadedModelId,
} from '../gemma.js'

export function useAiModel(toast) {
  const [aiModelId, setAiModelId] = useState(() => localStorage.getItem('sip_ai_model') || 'small')
  const [aiDownloaded, setAiDownloaded] = useState({})
  const [aiDownloadProgress, setAiDownloadProgress] = useState({})
  const [aiDownloading, setAiDownloading] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReady, setAiReady] = useState(false)
  const [byokStatus] = useState('idle')
  const [byokError] = useState('')

  useEffect(() => {
    const check = async () => {
      const results = {}
      for (const id of Object.keys(AI_MODELS)) {
        results[id] = await isModelDownloaded(id)
      }
      setAiDownloaded(results)
      const modelToLoad = localStorage.getItem('sip_ai_model') || 'small'
      if (results[modelToLoad]) {
        setAiLoading(true)
        try {
          await gemmaInit(modelToLoad)
          setAiReady(isGemmaReady())
        } catch (e) {
          console.error('[AI] auto-init error:', e)
        } finally {
          setAiLoading(false)
        }
      }
    }
    check()
  }, [])

  const handleAiSelect = (id) => {
    setAiModelId(id)
    localStorage.setItem('sip_ai_model', id)
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
        console.error('[AI] download error:', e)
        toast?.('Download failed — check your connection', 'error')
      }
    } finally {
      setAiDownloading(null)
    }
  }

  const handleAiDelete = async (id) => {
    await gemmaDelete(id)
    setAiDownloaded((p) => ({ ...p, [id]: false }))
    if (getLoadedModelId() === id) setAiReady(false)
  }

  const handleAiLoad = async (id) => {
    setAiLoading(true)
    try {
      await gemmaInit(id)
      setAiReady(isGemmaReady())
      toast?.('AI model loaded and ready', 'success', '⚡')
    } catch (e) {
      console.error('[AI] load error:', e)
      toast?.('Failed to load AI model', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  return {
    aiModelId,
    aiDownloaded,
    aiDownloadProgress,
    aiDownloading,
    aiLoading,
    aiReady,
    byokStatus,
    byokError,
    handleAiSelect,
    handleAiDownload,
    handleAiDelete,
    handleAiLoad,
  }
}
