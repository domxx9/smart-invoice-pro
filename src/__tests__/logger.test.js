import { describe, it, expect, beforeEach, vi } from 'vitest'
import { logger } from '../utils/logger.js'

beforeEach(() => {
  logger.clear()
  logger.setMinLevel('error')
})

describe('logger level gating', () => {
  it('suppresses debug at the default level', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logger.debug('test', 'should not appear')
    expect(logger.getSnapshot()).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('records error at the default level and mirrors to console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('boom', 'something broke')
    expect(logger.getSnapshot()).toHaveLength(1)
    expect(spy).toHaveBeenCalledWith('[boom]', 'something broke')
    spy.mockRestore()
  })

  it('lets debug through after setMinLevel("debug")', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logger.setMinLevel('debug')
    logger.debug('paste', 'hello')
    logger.info('paste', 'world')
    expect(logger.getSnapshot()).toHaveLength(2)
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('ignores unknown level names', () => {
    logger.setMinLevel('debug')
    logger.setMinLevel('verbose')
    expect(logger.getMinLevel()).toBe('debug')
  })
})

describe('logger ring buffer', () => {
  it('evicts the oldest entry when the 1001st is pushed', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.setMinLevel('info')

    for (let i = 0; i < 1000; i++) {
      logger.info('seed', i)
    }
    expect(logger.getSnapshot()).toHaveLength(1000)
    expect(logger.getSnapshot()[0].args[0]).toBe(0)

    logger.info('overflow', 1000)
    const snap = logger.getSnapshot()
    expect(snap).toHaveLength(1000)
    expect(snap[0].args[0]).toBe(1)
    expect(snap[snap.length - 1].args[0]).toBe(1000)
    expect(snap[snap.length - 1].tag).toBe('overflow')
  })

  it('clear() empties the buffer', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('x', 'y')
    expect(logger.getSnapshot()).toHaveLength(1)
    logger.clear()
    expect(logger.getSnapshot()).toHaveLength(0)
  })
})

describe('logger.toText()', () => {
  it('formats entries as "<ISO ts> <LEVEL> [tag] <args>"', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    logger.setMinLevel('warn')

    logger.error('pdf', 'render failed', { invoiceId: 'INV0001' })
    logger.warn('byok', 'rate limited')

    const text = logger.toText()
    const lines = text.split('\n')
    expect(lines).toHaveLength(2)

    expect(lines[0]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z ERROR \[pdf\] render failed \{"invoiceId":"INV0001"\}$/,
    )
    expect(lines[1]).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z WARN \[byok\] rate limited$/,
    )
  })

  it('formats Error args using the stack', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('kaboom')
    logger.error('pipeline', err)
    const text = logger.toText()
    expect(text).toContain('ERROR [pipeline]')
    expect(text).toMatch(/kaboom/)
  })

  it('returns an empty string when the buffer is empty', () => {
    expect(logger.toText()).toBe('')
  })
})
