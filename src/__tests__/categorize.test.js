import { describe, it, expect } from 'vitest'
import { categorizeProduct } from '../ai/categorize.js'

const stubInference = (result) => () => Promise.resolve(result)

describe('categorizeProduct', () => {
  it('returns category and tags from LLM response', async () => {
    const run = stubInference({
      text: '[{"category": "Plumbing", "tags": ["valve", "copper", "fittings"]}]',
    })
    const result = await categorizeProduct(
      { name: 'Copper Ball Valve 1"', desc: 'Heavy duty copper fitting for water lines' },
      run,
    )
    expect(result.category).toBe('Plumbing')
    expect(result.tags).toEqual(['valve', 'copper', 'fittings'])
  })

  it('returns null category for malformed response', async () => {
    const run = stubInference({ text: 'not json at all' })
    const result = await categorizeProduct({ name: 'Widget' }, run)
    expect(result.category).toBeNull()
    expect(result.tags).toEqual([])
  })

  it('returns null category for empty product name', async () => {
    const result = await categorizeProduct(
      { name: '', desc: 'something' },
      stubInference({ text: '[]' }),
    )
    expect(result.category).toBeNull()
  })

  it('falls back on inference error', async () => {
    const run = () => Promise.reject(new Error('boom'))
    const result = await categorizeProduct({ name: 'Widget' }, run)
    expect(result.category).toBeNull()
    expect(result.tags).toEqual([])
  })

  it('uses General when category field is blank', async () => {
    const run = stubInference({ text: '[{"category": "", "tags": []}]' })
    const result = await categorizeProduct({ name: 'Stuff' }, run)
    expect(result.category).toBeNull()
  })

  it('filters out non-string tags', async () => {
    const run = stubInference({
      text: '[{"category": "Tools", "tags": ["wrench", 123, null, "spanner"]}]',
    })
    const result = await categorizeProduct({ name: 'Wrench Set' }, run)
    expect(result.tags).toEqual(['wrench', 'spanner'])
  })

  it('passes product name + desc as context to prompt', async () => {
    const calls = []
    const run = ({ prompt }) => {
      calls.push(prompt)
      return Promise.resolve({ text: '[{"category":"X","tags":[]}]' })
    }
    await categorizeProduct({ name: 'My Product', desc: 'Some description here' }, run)
    const text = calls[0]
    expect(text).toContain('My Product')
    expect(text).toContain('Some description here')
  })
})
