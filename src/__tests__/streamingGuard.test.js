/**
 * SMA-78 — the client-side cap on MediaPipe's generateResponse stream.
 *
 * The cap backs the distinctly-logged `length` stopReason that the smart-paste
 * pipeline already uses to trigger truncation salvage; without it the small
 * Gemma can parrot its input for ~22k chars when the instruction scaffold
 * doesn't land. These tests pin the cap wiring in place so a future refactor
 * can't silently regress maxTokens enforcement on-device.
 */
import { describe, it, expect, vi } from 'vitest'
import { createCappedStreamer, CHAR_PER_TOKEN_UPPER } from '../workers/streamingGuard.js'

describe('createCappedStreamer', () => {
  it('resolves naturally with stopReason=null when the stream ends under the cap', () => {
    const onDone = vi.fn()
    const guard = createCappedStreamer({ maxTokens: 16, onDone })
    guard.feed('hello ', false)
    guard.feed('world', true)
    expect(onDone).toHaveBeenCalledWith('hello world', null)
    expect(guard.aborted).toBe(false)
    expect(guard.text).toBe('hello world')
  })

  it('aborts at the token cap and emits stopReason=length (SMA-78)', () => {
    const onDone = vi.fn()
    const onAbort = vi.fn()
    const guard = createCappedStreamer({ maxTokens: 3, onDone, onAbort })
    const results = []
    for (let i = 0; i < 10 && !guard.aborted; i++) {
      results.push(guard.feed('x', false))
    }
    expect(results).toEqual(['token', 'token', 'aborted'])
    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone.mock.calls[0]).toEqual(['xxx', 'length'])
    expect(guard.aborted).toBe(true)
  })

  it('ignores any further callbacks after abort (MediaPipe can still emit done=true)', () => {
    const onToken = vi.fn()
    const onDone = vi.fn()
    const guard = createCappedStreamer({ maxTokens: 2, onToken, onDone })
    guard.feed('a', false)
    guard.feed('b', false) // hits cap, aborts
    const late = guard.feed('c', true)
    expect(late).toBe('ignored')
    expect(onDone).toHaveBeenCalledTimes(1)
    // The aborted token and the abort callback both fire — but no further
    // onToken call for the post-abort chunk.
    expect(onToken).toHaveBeenCalledTimes(2)
  })

  it('aborts on char-cap even when chunker emits multiple tokens per chunk', () => {
    // maxTokens=4 → charCap = 4*4+64 = 80. Single chunk over the char cap
    // trips the guard without relying on chunk-count semantics.
    const onDone = vi.fn()
    const guard = createCappedStreamer({ maxTokens: 4, onDone })
    const huge = 'x'.repeat(200)
    guard.feed(huge, false)
    expect(guard.aborted).toBe(true)
    expect(onDone).toHaveBeenCalledWith(huge, 'length')
  })

  it('leaves the stream uncapped when maxTokens is omitted', () => {
    const onDone = vi.fn()
    const guard = createCappedStreamer({ onDone })
    for (let i = 0; i < 5000; i++) guard.feed('x', false)
    expect(guard.aborted).toBe(false)
    guard.feed('', true)
    expect(onDone).toHaveBeenCalledWith(expect.any(String), null)
  })

  it('exposes CHAR_PER_TOKEN_UPPER so downstream callers share the heuristic', () => {
    expect(CHAR_PER_TOKEN_UPPER).toBeGreaterThan(0)
  })

  it('ignores non-finite or zero/negative maxTokens values', () => {
    for (const m of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 'a', null, undefined]) {
      const guard = createCappedStreamer({ maxTokens: m })
      expect(guard.tokenCap).toBeNull()
      expect(guard.charCap).toBeNull()
    }
  })
})
