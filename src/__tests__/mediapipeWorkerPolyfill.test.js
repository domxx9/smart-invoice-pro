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
        expect(url).toBe('https://example.test/glue.js')
        return new Response(stubScript, { status: 200 })
      }),
    )

    // Run the real polyfill block (not a stub) against a sandbox `self`.
    // Inside indirect eval we want `self` to be the sandbox, so alias it to
    // globalThis — that's how a real worker realm exposes it.
    const polyfillBlock = extractPolyfillBlock(WORKER_SRC)
    const wrapped = `
      globalThis.self = self;
      ${polyfillBlock}
      return self.import;
    `
    const polyfillImport = new Function('self', wrapped)(globalThis)

    await polyfillImport('https://example.test/glue.js')

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
      ${polyfillBlock}
      return self.import;
    `
    const polyfillImport = new Function('self', wrapped)(globalThis)

    await expect(polyfillImport('https://example.test/missing.js')).rejects.toThrow(/404/)

    delete globalThis.self
  })
})
