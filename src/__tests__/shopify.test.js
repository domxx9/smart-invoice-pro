import { describe, it, expect } from 'vitest'
import { __test } from '../api/shopify.js'

const { buildUrlParams } = __test

describe('buildUrlParams', () => {
  it('sets limit to PAGE_LIMIT (250) by default', () => {
    const params = buildUrlParams({})
    expect(params.get('limit')).toBe('250')
  })

  it('sets page_info when paginating', () => {
    const params = buildUrlParams({ pageInfo: 'abc123' })
    expect(params.get('page_info')).toBe('abc123')
    expect(params.get('limit')).toBe('250')
    expect(params.has('status')).toBe(false)
  })

  it('sets query filters when no pageInfo', () => {
    const params = buildUrlParams({ query: { status: 'any' } })
    expect(params.get('status')).toBe('any')
    expect(params.get('limit')).toBe('250')
    expect(params.has('page_info')).toBe(false)
  })

  it('skips nullish empty query values', () => {
    const params = buildUrlParams({ query: { status: 'any', foo: null, bar: undefined, baz: '' } })
    expect(params.get('status')).toBe('any')
    expect(params.has('foo')).toBe(false)
    expect(params.has('bar')).toBe(false)
    expect(params.has('baz')).toBe(false)
  })

  it('stringifies all query values', () => {
    const params = buildUrlParams({ query: { limit: 250, foo: 1 } })
    expect(params.get('limit')).toBe('250')
    expect(params.get('foo')).toBe('1')
  })

  it('prefers page_info over query when both present', () => {
    const params = buildUrlParams({ pageInfo: 'cursor123', query: { status: 'any' } })
    expect(params.get('page_info')).toBe('cursor123')
    expect(params.has('status')).toBe(false)
  })
})
