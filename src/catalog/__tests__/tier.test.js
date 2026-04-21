import { describe, it, expect } from 'vitest'
import { LOCAL_TIER_MAX_PARENTS, pickTier, isValidSearchTier } from '../tier.js'

describe('pickTier (SMA-123)', () => {
  it('exposes the 5000-parent threshold tied to the SMA-122 decision', () => {
    expect(LOCAL_TIER_MAX_PARENTS).toBe(5000)
  })

  it('returns local for the 869-product reference tenant', () => {
    expect(pickTier({ parentCount: 869 })).toBe('local')
  })

  it('returns byok for 8k-product synthetic tenants', () => {
    expect(pickTier({ parentCount: 8000 })).toBe('byok')
  })

  it('treats exactly 5000 parents as local (inclusive threshold)', () => {
    expect(pickTier({ parentCount: 5000 })).toBe('local')
  })

  it('routes 5001 parents to byok', () => {
    expect(pickTier({ parentCount: 5001 })).toBe('byok')
  })

  it('defaults to local for missing / malformed stats', () => {
    expect(pickTier(undefined)).toBe('local')
    expect(pickTier(null)).toBe('local')
    expect(pickTier({})).toBe('local')
    expect(pickTier({ parentCount: -5 })).toBe('local')
    expect(pickTier({ parentCount: 'NaN' })).toBe('local')
  })

  it('ignores variantCount — only parentCount drives tier', () => {
    expect(pickTier({ parentCount: 100, variantCount: 50000 })).toBe('local')
  })
})

describe('isValidSearchTier', () => {
  it('accepts only the two known values', () => {
    expect(isValidSearchTier('local')).toBe(true)
    expect(isValidSearchTier('byok')).toBe(true)
    expect(isValidSearchTier('cloud')).toBe(false)
    expect(isValidSearchTier('')).toBe(false)
    expect(isValidSearchTier(undefined)).toBe(false)
  })
})
