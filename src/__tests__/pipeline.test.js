/**
 * Tests for the AI inference pipeline (SMA-49).
 *
 * runInference routes by settings.aiMode:
 *   - 'small' → gemmaWorker.inferGemma
 *   - 'byok'  → byok.generate (with API key pulled from secure storage)
 *   - 'off'   → null
 * API keys must never appear in thrown error messages.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const workerMocks = { inferGemma: vi.fn(), cancelGemma: vi.fn() }
const byokMocks = { generate: vi.fn() }
const storageMocks = { getSecret: vi.fn() }
const executorchMocks = { isAvailable: vi.fn(), infer: vi.fn() }

vi.mock('../gemmaWorker.js', () => workerMocks)
vi.mock('../byok.js', () => byokMocks)
vi.mock('../secure-storage.js', () => storageMocks)
vi.mock('../plugins/executorch.js', () => executorchMocks)

async function importPipeline() {
  const mod = await import('../ai/pipeline.js')
  return mod.runInference
}

beforeEach(() => {
  vi.resetModules()
  workerMocks.inferGemma.mockReset()
  workerMocks.cancelGemma.mockReset()
  byokMocks.generate.mockReset()
  storageMocks.getSecret.mockReset()
  executorchMocks.isAvailable.mockReset()
  executorchMocks.infer.mockReset()
})

describe('runInference — routing', () => {
  it("returns null when aiMode is 'off'", async () => {
    const runInference = await importPipeline()
    const result = await runInference({
      prompt: 'hi',
      settings: { aiMode: 'off' },
    })
    expect(result).toBeNull()
    expect(workerMocks.inferGemma).not.toHaveBeenCalled()
    expect(byokMocks.generate).not.toHaveBeenCalled()
  })

  it("routes 'small' to the Gemma worker, forwards maxTokens, and tags the source", async () => {
    workerMocks.inferGemma.mockResolvedValue({ text: 'on-device response', stopReason: null })
    const runInference = await importPipeline()
    const result = await runInference({
      prompt: 'hello',
      maxTokens: 1024,
      settings: { aiMode: 'small' },
    })
    expect(workerMocks.inferGemma).toHaveBeenCalledWith('hello', { maxTokens: 1024 })
    expect(byokMocks.generate).not.toHaveBeenCalled()
    expect(result).toEqual({ text: 'on-device response', source: 'small', stopReason: null })
  })

  it('forwards stopReason=length from the worker when the maxTokens guard trips (SMA-78)', async () => {
    workerMocks.inferGemma.mockResolvedValue({ text: '[{"text":"blade"', stopReason: 'length' })
    const runInference = await importPipeline()
    const result = await runInference({
      prompt: 'extract',
      maxTokens: 2048,
      settings: { aiMode: 'small' },
    })
    expect(workerMocks.inferGemma).toHaveBeenCalledWith('extract', { maxTokens: 2048 })
    expect(result).toEqual({
      text: '[{"text":"blade"',
      source: 'small',
      stopReason: 'length',
    })
  })

  it("'small' mode aborts and throws stage1_timeout when inference exceeds the wall-clock (SMA-78)", async () => {
    vi.useFakeTimers()
    try {
      // Never-resolving inference — the timer must be what rejects the call.
      workerMocks.inferGemma.mockReturnValue(new Promise(() => {}))
      const runInference = await importPipeline()

      const pending = runInference({
        prompt: 'forever',
        maxTokens: 2048,
        settings: { aiMode: 'small', smallModeTimeoutMs: 500 },
      })
      // Swallow the expected rejection so the runner doesn't flag an unhandled
      // promise rejection when we advance the fake timer.
      const settle = pending.catch((err) => err)

      await vi.advanceTimersByTimeAsync(500)
      const err = await settle

      expect(err).toBeInstanceOf(Error)
      expect(err.code).toBe('stage1_timeout')
      expect(err.timeoutMs).toBe(500)
      expect(workerMocks.cancelGemma).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("'small' mode throws when the worker reports unavailable (no WebGPU)", async () => {
    workerMocks.inferGemma.mockResolvedValue({
      unavailable: true,
      reason: 'no-webgpu-in-worker',
    })
    const runInference = await importPipeline()
    await expect(runInference({ prompt: 'hi', settings: { aiMode: 'small' } })).rejects.toThrow(
      /unavailable/i,
    )
  })

  it("routes 'byok' through secure storage + byok.generate", async () => {
    storageMocks.getSecret.mockResolvedValue('sk-test-123')
    byokMocks.generate.mockResolvedValue({ text: 'cloud response', stopReason: 'stop' })
    const runInference = await importPipeline()
    const result = await runInference({
      prompt: 'match this',
      maxTokens: 16,
      settings: {
        aiMode: 'byok',
        byokProvider: 'openai',
        byokBaseUrl: 'https://proxy.example/v1',
        byokModel: 'gpt-4o-mini',
      },
    })
    expect(storageMocks.getSecret).toHaveBeenCalledWith('sip_byok_openai')
    expect(byokMocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        apiKey: 'sk-test-123',
        baseUrl: 'https://proxy.example/v1',
        model: 'gpt-4o-mini',
        prompt: 'match this',
        maxTokens: 16,
      }),
    )
    expect(workerMocks.inferGemma).not.toHaveBeenCalled()
    expect(result).toEqual({ text: 'cloud response', source: 'byok', stopReason: 'stop' })
  })

  it('forwards stopReason=length from byok.generate to the caller (SMA-71)', async () => {
    storageMocks.getSecret.mockResolvedValue('sk-test')
    byokMocks.generate.mockResolvedValue({ text: '[{"text":"blade', stopReason: 'length' })
    const runInference = await importPipeline()
    const result = await runInference({
      prompt: 'extract',
      settings: { aiMode: 'byok', byokProvider: 'openai' },
    })
    expect(result).toEqual({
      text: '[{"text":"blade',
      source: 'byok',
      stopReason: 'length',
    })
  })

  it("'byok' mode throws when no provider is selected", async () => {
    const runInference = await importPipeline()
    await expect(
      runInference({
        prompt: 'hi',
        settings: { aiMode: 'byok', byokProvider: '' },
      }),
    ).rejects.toThrow(/provider/i)
    expect(storageMocks.getSecret).not.toHaveBeenCalled()
  })

  it("'byok' mode throws when no API key is stored", async () => {
    storageMocks.getSecret.mockResolvedValue(null)
    const runInference = await importPipeline()
    await expect(
      runInference({
        prompt: 'hi',
        settings: { aiMode: 'byok', byokProvider: 'openai' },
      }),
    ).rejects.toThrow(/API key/i)
    expect(byokMocks.generate).not.toHaveBeenCalled()
  })

  it("routes 'executorch' to the plugin, tags source, and returns null stopReason", async () => {
    executorchMocks.isAvailable.mockReturnValue(true)
    executorchMocks.infer.mockResolvedValue({ text: 'native inference result' })
    const runInference = await importPipeline()
    const result = await runInference({
      prompt: 'hello executorch',
      maxTokens: 512,
      settings: { aiMode: 'executorch' },
    })
    expect(executorchMocks.isAvailable).toHaveBeenCalled()
    expect(executorchMocks.infer).toHaveBeenCalledWith({
      prompt: 'hello executorch',
      maxTokens: 512,
    })
    expect(result).toEqual({
      text: 'native inference result',
      source: 'executorch',
      stopReason: null,
    })
  })

  it("'executorch' throws descriptive error when isAvailable() is false", async () => {
    executorchMocks.isAvailable.mockReturnValue(false)
    const runInference = await importPipeline()
    await expect(
      runInference({ prompt: 'hi', settings: { aiMode: 'executorch' } }),
    ).rejects.toThrow(/not available/i)
    expect(executorchMocks.infer).not.toHaveBeenCalled()
  })

  it("'executorch' throws when the plugin call fails", async () => {
    executorchMocks.isAvailable.mockReturnValue(true)
    executorchMocks.infer.mockRejectedValue(new Error('plugin error'))
    const runInference = await importPipeline()
    await expect(
      runInference({ prompt: 'hi', settings: { aiMode: 'executorch' } }),
    ).rejects.toThrow('plugin error')
  })

  it('throws on unknown aiMode', async () => {
    const runInference = await importPipeline()
    await expect(runInference({ prompt: 'hi', settings: { aiMode: 'wat' } })).rejects.toThrow(
      /unknown aiMode/i,
    )
  })

  it('throws when prompt is empty', async () => {
    const runInference = await importPipeline()
    await expect(runInference({ prompt: '', settings: { aiMode: 'small' } })).rejects.toThrow(
      /prompt/i,
    )
  })
})

describe('runInference — error sanitization', () => {
  it('strips the API key from thrown error messages if byok.generate leaks it', async () => {
    const key = 'sk-super-secret-abc123'
    storageMocks.getSecret.mockResolvedValue(key)
    byokMocks.generate.mockRejectedValue(new Error(`request to ${key} failed`))
    const runInference = await importPipeline()
    await expect(
      runInference({
        prompt: 'hi',
        settings: { aiMode: 'byok', byokProvider: 'openai' },
      }),
    ).rejects.toThrow(/\[redacted\]/)
    try {
      await runInference({
        prompt: 'hi',
        settings: { aiMode: 'byok', byokProvider: 'openai' },
      })
    } catch (e) {
      expect(e.message).not.toContain(key)
    }
  })

  it('surfaces the raw byok error message when it does not contain the key', async () => {
    storageMocks.getSecret.mockResolvedValue('sk-safe')
    byokMocks.generate.mockRejectedValue(new Error('BYOK 429: rate limited'))
    const runInference = await importPipeline()
    await expect(
      runInference({
        prompt: 'hi',
        settings: { aiMode: 'byok', byokProvider: 'openai' },
      }),
    ).rejects.toThrow(/rate limited/)
  })
})
