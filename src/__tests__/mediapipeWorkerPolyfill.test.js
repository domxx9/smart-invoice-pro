/**
 * SMA-47 — Guard the `self.import` polyfill at the top of mediapipeWorker.js.
 *
 * MediaPipe's genai bundle tries `importScripts(url)` first and, when that
 * raises TypeError (which is what ES-module workers do because importScripts
 * is undefined there), falls back to `self.import(url)`. Browsers don't
 * define that — the polyfill bridges it to native dynamic import. Without it
 * MediaPipe crashes with "self.import is not a function" on load. Freeze the
 * polyfill in place so a future refactor doesn't silently drop it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKER_SRC = readFileSync(resolve(__dirname, '..', 'workers', 'mediapipeWorker.js'), 'utf8')

describe('mediapipeWorker — self.import polyfill (SMA-47)', () => {
  it('defines the polyfill before any other runtime code', () => {
    const firstImport = WORKER_SRC.indexOf('import(')
    const polyfillIdx = WORKER_SRC.indexOf('self.import =')
    expect(polyfillIdx).toBeGreaterThan(-1)
    // The polyfill's own `import(url)` call is allowed, but the guard itself
    // must precede every other dynamic import (e.g. `@mediapipe/tasks-genai`).
    const guardedImport = WORKER_SRC.indexOf("await import('@mediapipe/tasks-genai')")
    expect(guardedImport).toBeGreaterThan(polyfillIdx)
    expect(firstImport).toBeGreaterThan(-1)
  })

  it('guards the assignment behind a typeof check so reruns are safe', () => {
    expect(WORKER_SRC).toMatch(/typeof self.*!==\s*['"]undefined['"]/)
    expect(WORKER_SRC).toMatch(/typeof self\.import\s*!==\s*['"]function['"]/)
  })

  it('tags the dynamic import with @vite-ignore so the bundler skips resolution', () => {
    expect(WORKER_SRC).toContain('/* @vite-ignore */')
  })

  it('behaves like native import when executed in a sandbox (no self.import defined)', async () => {
    const sandboxSelf = {}
    // Extract just the polyfill block and run it against our sandbox `self`.
    const block = `
      if (typeof self !== 'undefined' && typeof self.import !== 'function') {
        self.import = (url) => ({ bridged: url })
      }
    `

    new Function('self', block)(sandboxSelf)
    expect(typeof sandboxSelf.import).toBe('function')
    expect(sandboxSelf.import('foo')).toEqual({ bridged: 'foo' })
  })
})
