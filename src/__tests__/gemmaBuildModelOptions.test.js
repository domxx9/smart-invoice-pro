/**
 * SMA-46 — buildModelOptions must hand MediaPipe a Uint8Array.
 *
 * MediaPipe's typedef (`@mediapipe/tasks-genai/genai.d.ts:46`) declares
 * `modelAssetBuffer: Uint8Array | ReadableStreamDefaultReader`. Passing a raw
 * ArrayBuffer fails its instanceof check at runtime and the worker surfaces
 * "No model asset provided" — the bug reported on SMA-46.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

function installOpfsMock(bytes) {
  const file = {
    arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer ?? bytes),
  }
  const fh = { getFile: vi.fn().mockResolvedValue(file) }
  const root = {
    getFileHandle: vi.fn().mockResolvedValue(fh),
    removeEntry: vi.fn().mockResolvedValue(undefined),
  }
  globalThis.navigator = {
    ...(globalThis.navigator || {}),
    storage: { getDirectory: vi.fn().mockResolvedValue(root) },
  }
  return { root, fh, file }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  delete globalThis.navigator
  vi.restoreAllMocks()
})

describe('buildModelOptions (web/OPFS)', () => {
  it('returns modelAssetBuffer as a Uint8Array view over the OPFS bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    installOpfsMock(bytes)

    const { buildModelOptions } = await import('../gemma.js')
    const options = await buildModelOptions('small')

    expect(options.baseOptions.modelAssetBuffer).toBeInstanceOf(Uint8Array)
    expect(options.baseOptions.modelAssetBuffer.byteLength).toBe(8)
  })

  it('removes a 0-byte OPFS entry and throws a re-download hint (SMA-69)', async () => {
    const { root } = installOpfsMock(new Uint8Array(0))

    const { buildModelOptions, MODELS } = await import('../gemma.js')
    await expect(buildModelOptions('small')).rejects.toThrow(/0 bytes.*re-download/i)

    expect(root.removeEntry).toHaveBeenCalledTimes(1)
    expect(root.removeEntry).toHaveBeenCalledWith(MODELS.small.filename)
  })

  it('throws a re-download hint when the OPFS file handle is missing', async () => {
    const root = {
      getFileHandle: vi.fn().mockRejectedValue(new DOMException('NotFound', 'NotFoundError')),
    }
    globalThis.navigator = {
      ...(globalThis.navigator || {}),
      storage: { getDirectory: vi.fn().mockResolvedValue(root) },
    }

    const { buildModelOptions } = await import('../gemma.js')
    await expect(buildModelOptions('small')).rejects.toThrow(/re-download/i)
  })
})
