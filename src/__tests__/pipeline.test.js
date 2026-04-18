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

const workerMocks = { inferGemma: vi.fn() }
const byokMocks = { generate: vi.fn() }
const storageMocks = { getSecret: vi.fn() }

vi.mock('../gemmaWorker.js', () => workerMocks)
vi.mock('../byok.js', () => byokMocks)
vi.mock('../secure-storage.js', () => storageMocks)

async function importPipeline() {
  const mod = await import('../ai/pipeline.js')
  return mod.runInference
}

beforeEach(() => {
  vi.resetModules()
  workerMocks.inferGemma.mockReset()
  byokMocks.generate.mockReset()
  storageMocks.getSecret.mockReset()
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

  it("routes 'small' to the Gemma worker and tags the source", async () => {
    workerMocks.inferGemma.mockResolvedValue('on-device response')
    const runInference = await importPipeline()
    const result = await runInference({
      prompt: 'hello',
      settings: { aiMode: 'small' },
    })
    expect(workerMocks.inferGemma).toHaveBeenCalledWith('hello')
    expect(byokMocks.generate).not.toHaveBeenCalled()
    // On-device Gemma does not surface a finish reason — stopReason is null.
    expect(result).toEqual({ text: 'on-device response', source: 'small', stopReason: null })
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

  it("'byok' mode passes the provider's length-cap stopReason through (SMA-71)", async () => {
    storageMocks.getSecret.mockResolvedValue('sk-test-123')
    byokMocks.generate.mockResolvedValue({ text: 'partial', stopReason: 'length' })
    const runInference = await importPipeline()
    const result = await runInference({
      prompt: 'hi',
      settings: { aiMode: 'byok', byokProvider: 'openai' },
    })
    expect(result).toEqual({ text: 'partial', source: 'byok', stopReason: 'length' })
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
