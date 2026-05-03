/**
 * SMA-67 — Guard the `self.import` polyfill at the top of mediapipeWorker.js.
 *
 * MediaPipe's genai bundle tries `importScripts(url)` first and, when that
 * raises TypeError (which is what ES-module workers do because importScripts
 * is undefined there), falls back to `self.import(url)`. Browsers don't
 * define that. The polyfill fetches the script as text and runs it via
 * indirect eval so top-level `var` declarations (like `ModuleFactory` in
 * MediaPipe's wasm glue) land on the realm's global — the classic-script
 * contract MediaPipe depends on. Freeze that behaviour in place so a future
 * refactor doesn't silently regress it (the first SMA-47 polyfill used native
 * dynamic `import()`, which scoped `ModuleFactory` to the module and broke
 * `LlmInference.createFromOptions` with "ModuleFactory not set.").
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKER_SRC = readFileSync(resolve(__dirname, '..', 'workers', 'mediapipeWorker.js'), 'utf8')

function extractPolyfillBlock(src) {
  const start = src.indexOf("if (typeof self !== 'undefined' && typeof self.import !== 'function')")
  if (start === -1) throw new Error('polyfill guard not found in worker source')
  // Walk forward, tracking brace depth, to capture the whole `if` block.
  const firstBrace = src.indexOf('{', start)
  let depth = 0
  for (let i = firstBrace; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  throw new Error('polyfill block not terminated')
}

describe('mediapipeWorker — self.import polyfill (SMA-67)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defines the polyfill before any other runtime code', () => {
    const polyfillIdx = WORKER_SRC.indexOf('self.import =')
    expect(polyfillIdx).toBeGreaterThan(-1)
    // The polyfill must run before the worker's own dynamic import of the
    // MediaPipe bundle so it's installed by the time MediaPipe's loader runs.
    const guardedImport = WORKER_SRC.indexOf("await import('@mediapipe/tasks-genai')")
    expect(guardedImport).toBeGreaterThan(polyfillIdx)
  })

  it('guards the assignment behind a typeof check so reruns are safe', () => {
    expect(WORKER_SRC).toMatch(/typeof self.*!==\s*['"]undefined['"]/)
    expect(WORKER_SRC).toMatch(/typeof self\.import\s*!==\s*['"]function['"]/)
  })

  it('uses fetch + indirect eval so top-level var lands on the global', () => {
    // The regression we fixed in SMA-67 was using native dynamic `import()`,
    // which scopes top-level `var` to the module. Keep the worker on the
    // classic-script path: fetch then `(0, eval)(code)`.
    expect(WORKER_SRC).toMatch(/fetch\(\s*url/)
    expect(WORKER_SRC).toMatch(/\(0,\s*eval\)\(code\)/)
  })

  it('behaves like native import when executed in a sandbox (no self.import defined)', async () => {
    const sandboxSelf = {}
    const block = `
      if (typeof self !== 'undefined' && typeof self.import !== 'function') {
        self.import = (url) => ({ bridged: url })
      }
    `

    new Function('self', block)(sandboxSelf)
    expect(typeof sandboxSelf.import).toBe('function')
    expect(sandboxSelf.import('foo')).toEqual({ bridged: 'foo' })
  })

  it('installs top-level var from the fetched script onto the global (ModuleFactory contract)', async () => {
    // This is the SMA-67 regression guard: MediaPipe's wasm glue declares
    // `var ModuleFactory = (() => ...)` and then checks `self.ModuleFactory`.
    // Prove that the polyfill, when handed a script like that, actually puts
    // `ModuleFactory` on the global the next `self.ModuleFactory` check sees.
    const stubScript = 'var ModuleFactory = function(){ return 42 }; ' + 'self.__loaded = true;'

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        expect(url).toBe(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
        )
        return new Response(stubScript, {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        })
      }),
    )

    // Run the real polyfill block (not a stub) against a sandbox `self`.
    // Include WASM_GLUE_SRI and TRUSTED_ORIGINS so the polyfill block has access.
    const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
    const wrapped = `
      globalThis.self = self;
      const WASM_GLUE_SRI = '';
      const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
      ${polyfillBlock}
      return self.import;
    `
    const polyfillImport = new Function('self', wrapped)(globalThis)

    await polyfillImport(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
    )

    expect(typeof globalThis.ModuleFactory).toBe('function')
    expect(globalThis.ModuleFactory()).toBe(42)
    expect(globalThis.__loaded).toBe(true)

    // Cleanup globals leaked by the indirect eval so other tests aren't
    // affected.
    delete globalThis.ModuleFactory
    delete globalThis.__loaded
    delete globalThis.self
  })

  it('throws a descriptive error when the script fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )

    const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
    const wrapped = `
      globalThis.self = self;
      const WASM_GLUE_SRI = '';
      const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
      ${polyfillBlock}
      return self.import;
    `
    const polyfillImport = new Function('self', wrapped)(globalThis)

    await expect(polyfillImport('https://cdn.jsdelivr.net/missing.js')).rejects.toThrow(/404/)

    delete globalThis.self
  })

  // ─── SMA-210 Security Guards ────────────────────────────────────────────────

  describe('origin allowlist (SMA-210)', () => {
    it('allows trusted jsDelivr origin', async () => {
      const stubScript = 'var ModuleFactory = function(){ return 42 };'
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url) => {
          expect(url).toBe(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
          )
          return new Response(stubScript, {
            status: 200,
            headers: { 'content-type': 'application/javascript' },
          })
        }),
      )

      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const wrapped = `
        globalThis.self = self;
        const WASM_GLUE_SRI = '';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', wrapped)(globalThis)

      await polyfillImport(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
      )
      expect(globalThis.ModuleFactory()).toBe(42)
      delete globalThis.ModuleFactory
      delete globalThis.self
    })

    it('blocks untrusted origin with SMA-210 error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('x', {
              status: 200,
              headers: { 'content-type': 'application/javascript' },
            }),
        ),
      )

      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const wrapped = `
        globalThis.self = self;
        const WASM_GLUE_SRI = '';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', wrapped)(globalThis)

      await expect(polyfillImport('https://evil.com/malware.js')).rejects.toThrow(
        /not in the trusted CDN allowlist.*SMA-210/,
      )

      delete globalThis.self
    })
  })

  describe('content-type validation (SMA-210)', () => {
    it('allows valid JavaScript MIME types', async () => {
      const validTypes = [
        'application/javascript',
        'text/javascript',
        'application/ecmascript',
        'text/ecmascript',
      ]
      for (const ct of validTypes) {
        vi.stubGlobal(
          'fetch',
          vi.fn(
            async () => new Response('var x = 1', { status: 200, headers: { 'content-type': ct } }),
          ),
        )

        const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
        const wrapped = `
          globalThis.self = self;
          const WASM_GLUE_SRI = '';
          const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
          ${polyfillBlock}
          return self.import;
        `
        const polyfillImport = new Function('self', wrapped)(globalThis)

        await polyfillImport(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
        )

        const fetchCall = vi.mocked(fetch).mock.calls[vi.mocked(fetch).mock.calls.length - 1]
        expect(fetchCall[0]).toBe(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
        )

        delete globalThis.self
        vi.mocked(fetch).mockClear()
      }
    })

    it('blocks non-JavaScript content-type with SMA-210 error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('<html>evil</html>', {
              status: 200,
              headers: { 'content-type': 'text/html' },
            }),
        ),
      )

      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const wrapped = `
        globalThis.self = self;
        const WASM_GLUE_SRI = '';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', wrapped)(globalThis)

      await expect(
        polyfillImport(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
        ),
      ).rejects.toThrow('expected JavaScript MIME')

      delete globalThis.self
    })
  })

  describe('SRI hash verification (SMA-210)', () => {
    it('passes when computed hash matches WASM_GLUE_SRI', async () => {
      const code = 'var ModuleFactory = function(){ return 99 };'
      const validHash =
        'sha256-' +
        btoa(
          String.fromCharCode(
            ...new Uint8Array(
              await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)),
            ),
          ),
        )

      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(code, {
              status: 200,
              headers: { 'content-type': 'application/javascript' },
            }),
        ),
      )

      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const wrapped = `
        globalThis.self = self;
        const WASM_GLUE_SRI = '${validHash}';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', wrapped)(globalThis)

      await polyfillImport(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
      )
      expect(globalThis.ModuleFactory()).toBe(99)
      delete globalThis.ModuleFactory
      delete globalThis.self
    })

    it('throws when computed hash does not match WASM_GLUE_SRI', async () => {
      const fakeFetch = async () =>
        new Response('var x = 1', {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        })
      const fakeCrypto = { subtle: { digest: async () => new Uint8Array([99]) } }

      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const testCode = `
        const globalThis = self;
        const WASM_GLUE_SRI = 'sha256-incorrect';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        const fetch = fakeFetch;
        const crypto = fakeCrypto;
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', 'fakeFetch', 'fakeCrypto', testCode)(
        {},
        fakeFetch,
        fakeCrypto,
      )

      await expect(
        polyfillImport(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
        ),
      ).rejects.toThrow('SRI mismatch')
    })

    it('skips SRI check when WASM_GLUE_SRI is empty (dev mode)', async () => {
      const code = 'var ModuleFactory = function(){ return 77 };'
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(code, {
              status: 200,
              headers: { 'content-type': 'application/javascript' },
            }),
        ),
      )

      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const wrapped = `
        globalThis.self = self;
        const WASM_GLUE_SRI = '';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', wrapped)(globalThis)

      await polyfillImport(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
      )
      expect(globalThis.ModuleFactory()).toBe(77)
      delete globalThis.ModuleFactory
      delete globalThis.self
    })

    it('throws descriptive error when crypto.subtle is unavailable', async () => {
      const fakeFetch = async () =>
        new Response('var x = 1', {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        })
      const fakeCrypto = { subtle: undefined }

      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const testCode = `
        const globalThis = self;
        const WASM_GLUE_SRI = 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        const fetch = fakeFetch;
        const crypto = fakeCrypto;
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', 'fakeFetch', 'fakeCrypto', testCode)(
        {},
        fakeFetch,
        fakeCrypto,
      )

      await expect(
        polyfillImport(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
        ),
      ).rejects.toThrow('crypto.subtle')
    })
  })

  describe('fetch security options (SMA-210)', () => {
    it('sets credentials:omit on the fetch request', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('var x = 1', {
              status: 200,
              headers: { 'content-type': 'application/javascript' },
            }),
        ),
      )

      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const wrapped = `
        globalThis.self = self;
        const WASM_GLUE_SRI = '';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', wrapped)(globalThis)
      await polyfillImport(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js',
      )

      const lastCall = vi.mocked(fetch).mock.calls[vi.mocked(fetch).mock.calls.length - 1]
      expect(lastCall[1]).toMatchObject({ credentials: 'omit' })

      delete globalThis.self
    })
  })

  describe('URL validation (SMA-210)', () => {
    it('throws on malformed URL', async () => {
      const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
      const wrapped = `
        globalThis.self = self;
        const WASM_GLUE_SRI = '';
        const TRUSTED_ORIGINS = new Set(['https://cdn.jsdelivr.net']);
        ${polyfillBlock}
        return self.import;
      `
      const polyfillImport = new Function('self', wrapped)(globalThis)

      await expect(polyfillImport(':::not-a-url:::')).rejects.toThrow(/invalid URL/)

      delete globalThis.self
    })
  })
})
