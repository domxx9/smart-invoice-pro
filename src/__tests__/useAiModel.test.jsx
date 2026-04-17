/**
 * Tests for useAiModel handleAiLoad routing through the worker facade (SMA-47).
 *
 * The hook builds modelOptions via gemma.buildModelOptions and delegates to
 * gemmaWorker.initGemma. On worker unavailable + native we must surface the
 * BYOK prompt; on desktop we fall back to main-thread gemmaInit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

const gemmaMocks = {
  MODELS: { small: { id: 'small', label: 'Gemma 3 1B (int4)', filename: 'sip_gemma_small.task' } },
  isModelDownloaded: vi.fn().mockResolvedValue(false),
  downloadModel: vi.fn(),
  deleteModel: vi.fn(),
  initModel: vi.fn().mockResolvedValue(undefined),
  buildModelOptions: vi
    .fn()
    .mockResolvedValue({ baseOptions: { modelAssetBuffer: new ArrayBuffer(4) } }),
  isNativePlatform: vi.fn().mockReturnValue(false),
}

const workerMocks = {
  initGemma: vi.fn(),
}

vi.mock('../gemma.js', () => gemmaMocks)
vi.mock('../gemmaWorker.js', () => workerMocks)
vi.mock('../byok.js', () => ({ testConnection: vi.fn() }))
vi.mock('../secure-storage.js', () => ({
  getSecret: vi.fn().mockResolvedValue(null),
  deleteSecret: vi.fn(),
}))

async function importHook() {
  const mod = await import('../hooks/useAiModel.js')
  return mod.useAiModel
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  gemmaMocks.isModelDownloaded.mockResolvedValue(false)
  gemmaMocks.initModel.mockReset().mockResolvedValue(undefined)
  gemmaMocks.buildModelOptions
    .mockReset()
    .mockResolvedValue({ baseOptions: { modelAssetBuffer: new ArrayBuffer(4) } })
  gemmaMocks.isNativePlatform.mockReset().mockReturnValue(false)
  workerMocks.initGemma.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAiModel.handleAiLoad — worker facade', () => {
  it('marks the model loaded when the worker returns ready', async () => {
    workerMocks.initGemma.mockResolvedValue({ ready: true })
    const toast = vi.fn()
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(toast))

    await act(async () => {
      await result.current.handleAiLoad('small')
    })

    expect(gemmaMocks.buildModelOptions).toHaveBeenCalledWith('small')
    expect(workerMocks.initGemma).toHaveBeenCalledTimes(1)
    expect(gemmaMocks.initModel).not.toHaveBeenCalled()
    expect(result.current.aiReady).toBe(true)
    expect(result.current.loadedModelId).toBe('small')
    expect(toast).toHaveBeenCalledWith('AI model loaded and ready', 'success', '⚡')
  })

  it('falls back to main-thread gemmaInit when the worker is unavailable on desktop', async () => {
    workerMocks.initGemma.mockResolvedValue({ unavailable: true, reason: 'no-worker' })
    gemmaMocks.isNativePlatform.mockReturnValue(false)
    const toast = vi.fn()
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(toast))

    await act(async () => {
      await result.current.handleAiLoad('small')
    })

    expect(workerMocks.initGemma).toHaveBeenCalledTimes(1)
    expect(gemmaMocks.initModel).toHaveBeenCalledWith('small')
    expect(result.current.aiReady).toBe(true)
    expect(result.current.loadedModelId).toBe('small')
    expect(toast).toHaveBeenCalledWith('AI model loaded and ready', 'success', '⚡')
  })

  it('prompts the user to switch to BYOK when the worker is unavailable on native', async () => {
    workerMocks.initGemma.mockResolvedValue({
      unavailable: true,
      reason: 'no-webgpu-in-worker',
    })
    gemmaMocks.isNativePlatform.mockReturnValue(true)
    const toast = vi.fn()
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(toast))

    await act(async () => {
      await result.current.handleAiLoad('small')
    })

    expect(gemmaMocks.initModel).not.toHaveBeenCalled()
    expect(result.current.aiReady).toBe(false)
    expect(result.current.loadedModelId).toBeNull()
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/BYOK/i), 'error')
  })

  it('surfaces the underlying error message in the toast when load throws', async () => {
    workerMocks.initGemma.mockRejectedValue(new Error('wasm fetch failed'))
    const toast = vi.fn()
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(toast))

    await act(async () => {
      await result.current.handleAiLoad('small')
    })

    expect(toast).toHaveBeenCalledWith('wasm fetch failed', 'error')
    expect(result.current.aiReady).toBe(false)
  })

  it('auto-loads a downloaded model on mount via the worker facade', async () => {
    gemmaMocks.isModelDownloaded.mockResolvedValue(true)
    workerMocks.initGemma.mockResolvedValue({ ready: true })
    localStorage.setItem('sip_ai_model', 'small')
    const toast = vi.fn()
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(toast))

    await waitFor(() => {
      expect(result.current.aiReady).toBe(true)
    })
    expect(workerMocks.initGemma).toHaveBeenCalled()
    expect(result.current.loadedModelId).toBe('small')
  })
})
