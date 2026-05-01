import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanOrderText, _setLlmForTest } from '../orderTextCleaner.js'
import { logger } from '../../utils/logger.js'

const RAW_ORDER = 'hey can i get 2 front shocks for my lifted Tacoma and an oil filter'

describe('cleanOrderText', () => {
  let infoSpy
  let warnSpy
  let debugSpy
  let errorSpy

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {})
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    warnSpy.mockRestore()
    debugSpy.mockRestore()
    errorSpy.mockRestore()
  })

  describe('runInference path', () => {
    it('calls runInference with the clean prompt and returns result', async () => {
      const cleaned = '2 front shocks\noil filter'
      const runInference = vi.fn().mockResolvedValue({ text: cleaned })
      const out = await cleanOrderText(RAW_ORDER, null, { runInference })
      expect(runInference).toHaveBeenCalledTimes(1)
      const call = runInference.mock.calls[0][0]
      expect(call.prompt).toContain('Clean up this order message')
      expect(call.maxTokens).toBe(256)
      expect(out).toBe(cleaned)
    })

    it('streams partial output via onToken callback', async () => {
      const runInference = vi.fn().mockResolvedValue({ text: '2 front shocks' })
      const onToken = vi.fn()
      await cleanOrderText(RAW_ORDER, onToken, { runInference })
      expect(onToken).toHaveBeenCalled()
      const lastCall = onToken.mock.calls.at(-1)
      expect(lastCall[0]).toBe('2 front shocks')
      expect(lastCall[1]).toBe(true)
    })

    it('returns original text when runInference throws', async () => {
      const runInference = vi.fn().mockRejectedValue(new Error('network down'))
      const onToken = vi.fn()
      const out = await cleanOrderText(RAW_ORDER, onToken, { runInference })
      expect(out).toBe(RAW_ORDER)
      expect(errorSpy).toHaveBeenCalledWith('ai', 'cleanOrderText error:', expect.any(Error))
    })

    it('returns trimmed result or original on empty output', async () => {
      const runInference = vi.fn().mockResolvedValue({ text: '   ' })
      const out = await cleanOrderText(RAW_ORDER, null, { runInference })
      expect(out).toBe(RAW_ORDER)
    })

    it('uses custom maxTokens when provided', async () => {
      const runInference = vi.fn().mockResolvedValue({ text: 'result' })
      await cleanOrderText(RAW_ORDER, null, { runInference, maxTokens: 128 })
      expect(runInference.mock.calls[0][0].maxTokens).toBe(128)
    })
  })

  describe('_llm path (backward compat)', () => {
    it('throws when model not loaded', async () => {
      _setLlmForTest(null)
      await expect(cleanOrderText(RAW_ORDER)).rejects.toThrow('Model not loaded')
    })

    it('streams via _llm.generateResponse', async () => {
      let capturedPrompt = null
      let capturedCallback = null
      const mockLlm = {
        generateResponse: (prompt, cb) => {
          capturedPrompt = prompt
          capturedCallback = cb
        },
      }
      _setLlmForTest(mockLlm)
      const onToken = vi.fn()
      const p = cleanOrderText(RAW_ORDER, onToken)
      expect(capturedPrompt).toContain('Clean up this order message')
      capturedCallback('2 front shocks\noil filter', true)
      expect(onToken).toHaveBeenCalledTimes(1)
      expect(onToken.mock.calls[0][0]).toBe('2 front shocks\noil filter')
      expect(onToken.mock.calls[0][1]).toBe(true)
      const out = await p
      expect(out).toBe('2 front shocks\noil filter')
    })

    it('falls back to original on _llm error', async () => {
      const mockLlm = {
        generateResponse: () => {
          throw new Error('boom')
        },
        cancelProcessing: vi.fn(),
      }
      _setLlmForTest(mockLlm)
      const onToken = vi.fn()
      const out = await cleanOrderText(RAW_ORDER, onToken)
      expect(out).toBe(RAW_ORDER)
      expect(errorSpy).toHaveBeenCalledWith('ai', 'cleanOrderText error:', expect.any(Error))
      expect(mockLlm.cancelProcessing).toHaveBeenCalled()
    })
  })
})
