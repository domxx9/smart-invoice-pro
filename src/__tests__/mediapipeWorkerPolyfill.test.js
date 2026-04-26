/**
 * SMA-67 — Guard the `self.import` polyfill at the top of mediapipeWorker.js.
 * SMA-210 — Add security: origin allowlist, content-type validation, SRI.
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
 *
 * SMA-210 security measures:
 * - Origin allowlist: only https://cdn.jsdelivr.net is permitted
 * - Content-Type validation: must be application/javascript or text/javascript
 * - SRI (Subresource Integrity): SHA-256 hash verification when WASM_GLUE_SRI
 *   is set (empty = disabled in dev; must be populated for production)
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

function extractSecurityConstants(src) {
  const trusted = []
  const sri = []

  const trustMatch = src.match(/const TRUSTED_ORIGINS = new Set\(\[(.*?)\]\)/s)
  if (trustMatch) {
    const origins = trustMatch[1].match(/'([^']+)'/g) || []
    origins.forEach((o) => trusted.push(o.replace(/'/g, '')))
  }

  const sriMatch = src.match(/const WASM_GLUE_SRI = '([^']*)'/)
  if (sriMatch) sri.push(sriMatch[1])

  return { TRUSTED_ORIGINS: trusted, WASM_GLUE_SRI: sri[0] || '' }
}

function makePolyfillImportFn(polyfillBlock, constants) {
  const { TRUSTED_ORIGINS, WASM_GLUE_SRI } = constants
  const originsLiteral = '[' + TRUSTED_ORIGINS.map((o) => `'${o}'`).join(',') + ']'
  const src = `
    const TRUSTED_ORIGINS = new Set(${originsLiteral});
    const WASM_GLUE_SRI = ${JSON.stringify(WASM_GLUE_SRI)};
    globalThis.self = self;
    ${polyfillBlock}
    return self.import;
  `
  return new Function('self', src)(globalThis)
}

describe('mediapipeWorker — self.import polyfill (SMA-67)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete globalThis.self
    delete globalThis.ModuleFactory
    delete globalThis.__loaded
  })

  it('defines the polyfill before any other runtime code', () => {
    const polyfillIdx = WORKER_SRC.indexOf('self.import =')
    expect(polyfillIdx).toBeGreaterThan(-1)
    const guardedImport = WORKER_SRC.indexOf("await import('@mediapipe/tasks-genai')")
    expect(guardedImport).toBeGreaterThan(polyfillIdx)
  })

  it('guards the assignment behind a typeof check so reruns are safe', () => {
    expect(WORKER_SRC).toMatch(/typeof self.*!==\s*['"]undefined['"]/)
    expect(WORKER_SRC).toMatch(/typeof self\.import\s*!==\s*['"]function['"]/)
  })

  it('uses fetch + indirect eval so top-level var lands on the global', () => {
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

  describe('SMA-210 security', () => {
    const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
    const constants = extractSecurityConstants(WORKER_SRC)

    function makeTrustedImport() {
      return makePolyfillImportFn(polyfillBlock, constants)
    }

    it('blocks origins not in the trusted CDN allowlist', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('fetch should not be called for blocked origin')
        }),
      )
      const polyfillImport = makeTrustedImport()
      await expect(polyfillImport('https://evil.example.com/glue.js')).rejects.toThrow(
        /not in the trusted CDN allowlist/,
      )
    })

    it('rejects invalid URLs with a descriptive error', async () => {
      vi.stubGlobal('fetch', vi.fn())
      const polyfillImport = makeTrustedImport()
      await expect(polyfillImport('not-a-url')).rejects.toThrow(/invalid URL/)
    })

    it('blocks non-JavaScript content-types', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })),
      )
      const polyfillImport = makeTrustedImport()
      await expect(polyfillImport('https://cdn.jsdelivr.net/npm/foo/wasm/glue.js')).rejects.toThrow(
        /unexpected content-type/,
      )
    })

    it('allows text/javascript content-type', async () => {
      const stubScript = 'var ModuleFactory = function(){ return 42 };'
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          return new Response(stubScript, { status: 200, headers: { 'content-type': 'text/javascript' } })
        }),
      )
      const polyfillImport = makeTrustedImport()
      await polyfillImport('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js')
      expect(typeof globalThis.ModuleFactory).toBe('function')
    })

    it('allows application/javascript content-type', async () => {
      const stubScript = 'var ModuleFactory = function(){ return 99 };'
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          return new Response(stubScript, { status: 200, headers: { 'content-type': 'application/javascript' } })
        }),
      )
      const polyfillImport = makeTrustedImport()
      await polyfillImport('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js')
      expect(typeof globalThis.ModuleFactory).toBe('function')
      expect(globalThis.ModuleFactory()).toBe(99)
    })

    it('SRI branch is present in source (SMA-210)', () => {
      expect(WORKER_SRC).toMatch(/WASM_GLUE_SRI/)
      expect(WORKER_SRC).toMatch(/crypto\.subtle\.digest/)
      expect(WORKER_SRC).toMatch(/SRI mismatch/)
    })

    it('installs ModuleFactory on the global from a trusted-origin fetched script', async () => {
      const stubScript = 'var ModuleFactory = function(){ return 42 }; ' + 'self.__loaded = true;'
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          return new Response(stubScript, { status: 200, headers: { 'content-type': 'application/javascript' } })
        }),
      )
      const polyfillImport = makeTrustedImport()
      await polyfillImport('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/genai_wasm_internal.js')
      expect(typeof globalThis.ModuleFactory).toBe('function')
      expect(globalThis.ModuleFactory()).toBe(42)
      expect(globalThis.__loaded).toBe(true)
    })

    it('throws a descriptive error when the script fetch fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('', { status: 404 })),
      )
      const polyfillImport = makeTrustedImport()
      await expect(
        polyfillImport('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm/missing.js'),
      ).rejects.toThrow(/404/)
    })
  })
})
