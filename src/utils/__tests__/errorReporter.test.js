import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportError, getReportedErrors, clearReportedErrors } from '../errorReporter.js'

vi.mock('../logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}))

beforeEach(() => {
  clearReportedErrors()
  vi.clearAllMocks()
})

describe('errorReporter', () => {
  it('records error with message, name, stack, context, and timestamp', () => {
    const err = new Error('boom')
    reportError(err, { source: 'test' })
    const reported = getReportedErrors()
    expect(reported).toHaveLength(1)
    expect(reported[0].message).toBe('boom')
    expect(reported[0].name).toBe('Error')
    expect(reported[0].stack).toContain('boom')
    expect(reported[0].context).toEqual({ source: 'test' })
    expect(reported[0].ts).toBeTruthy()
  })

  it('handles non-Error values gracefully', () => {
    reportError('not an error object', { source: 'string-test' })
    const reported = getReportedErrors()
    expect(reported).toHaveLength(1)
    expect(reported[0].message).toBe('not an error object')
    expect(reported[0].name).toBe('Error')
  })

  it('handles null and undefined', () => {
    reportError(null, {})
    reportError(undefined, {})
    expect(getReportedErrors()).toHaveLength(2)
  })

  it('caps collection at MAX_REPORTED (50)', () => {
    for (let i = 0; i < 60; i++) {
      reportError(new Error(`err-${i}`), {})
    }
    expect(getReportedErrors()).toHaveLength(50)
  })

  it('clearReportedErrors empties the collection', () => {
    reportError(new Error('test'), {})
    clearReportedErrors()
    expect(getReportedErrors()).toHaveLength(0)
  })
})
