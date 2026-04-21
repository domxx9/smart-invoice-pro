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
const byokMocks = {
  testConnection: vi.fn(),
  listModels: vi.fn(),
}
const secureStorageMocks = {
  getSecret: vi.fn().mockResolvedValue(null),
  deleteSecret: vi.fn(),
}

vi.mock('../byok.js', () => byokMocks)
vi.mock('../secure-storage.js', () => secureStorageMocks)

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
  byokMocks.testConnection.mockReset()
  byokMocks.listModels.mockReset()
  secureStorageMocks.getSecret.mockReset().mockResolvedValue(null)
  secureStorageMocks.deleteSecret.mockReset()
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

describe('useAiModel.handleByokListModels (SMA-96)', () => {
  it('returns a "pick a provider" error when provider is missing', async () => {
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(vi.fn()))

    let out
    await act(async () => {
      out = await result.current.handleByokListModels({})
    })

    expect(out).toEqual({ ok: false, models: [], error: expect.stringMatching(/provider/i) })
    expect(secureStorageMocks.getSecret).not.toHaveBeenCalled()
    expect(byokMocks.listModels).not.toHaveBeenCalled()
  })

  it('returns an "enter a key" error when no key is stored for the provider', async () => {
    secureStorageMocks.getSecret.mockResolvedValue(null)
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(vi.fn()))

    let out
    await act(async () => {
      out = await result.current.handleByokListModels({ provider: 'openai' })
    })

    expect(out).toEqual({ ok: false, models: [], error: expect.stringMatching(/API key/i) })
    expect(secureStorageMocks.getSecret).toHaveBeenCalledWith('sip_byok_openai')
    expect(byokMocks.listModels).not.toHaveBeenCalled()
  })

  it('threads the stored key and baseUrl through to byok.listModels and returns its models', async () => {
    secureStorageMocks.getSecret.mockResolvedValue('sk-abc')
    byokMocks.listModels.mockResolvedValue({ ok: true, models: ['gpt-4o', 'gpt-4o-mini'] })
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(vi.fn()))

    let out
    await act(async () => {
      out = await result.current.handleByokListModels({
        provider: 'openai',
        baseUrl: 'https://proxy.example.com/v1',
      })
    })

    expect(byokMocks.listModels).toHaveBeenCalledWith({
      provider: 'openai',
      apiKey: 'sk-abc',
      baseUrl: 'https://proxy.example.com/v1',
    })
    expect(out).toEqual({ ok: true, models: ['gpt-4o', 'gpt-4o-mini'] })
  })

  it('surfaces byok.listModels errors to the caller', async () => {
    secureStorageMocks.getSecret.mockResolvedValue('sk-abc')
    byokMocks.listModels.mockResolvedValue({ ok: false, error: 'Invalid API key' })
    const useAiModel = await importHook()
    const { result } = renderHook(() => useAiModel(vi.fn()))

    let out
    await act(async () => {
      out = await result.current.handleByokListModels({ provider: 'openai' })
    })

    expect(out).toEqual({ ok: false, models: [], error: 'Invalid API key' })
  })
})
