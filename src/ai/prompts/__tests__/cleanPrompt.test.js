import { describe, it, expect } from 'vitest'
import { buildCleanPrompt } from '../cleanPrompt.js'

describe('buildCleanPrompt', () => {
  it('wraps text in the cleanup instructions', () => {
    const prompt = buildCleanPrompt('need 2 front shocks for my Tacoma')
    expect(prompt).toContain('Clean up this order message')
    expect(prompt).toContain('Remove timestamps')
    expect(prompt).toContain('Remove greetings')
    expect(prompt).toContain('split them onto separate lines')
    expect(prompt).toContain('Cleaned lines:')
  })

  it('includes the raw text verbatim', () => {
    const raw = 'hey can i get 2 front shocks and an oil filter please'
    const prompt = buildCleanPrompt(raw)
    expect(prompt).toContain(raw)
  })

  it('truncates text beyond 800 chars', () => {
    const long = 'a'.repeat(1000)
    const prompt = buildCleanPrompt(long)
    expect(prompt).not.toContain('a'.repeat(801))
    expect(prompt).toContain('a'.repeat(800))
  })

  it('handles empty string', () => {
    const prompt = buildCleanPrompt('')
    expect(prompt).toContain('Clean up this order message')
    expect(prompt).toContain('Message:')
    expect(prompt).toContain('Cleaned lines:')
  })

  it('handles non-string input', () => {
    const prompt = buildCleanPrompt(null)
    expect(prompt).toContain('Clean up this order message')
    const promptUndefined = buildCleanPrompt(undefined)
    expect(promptUndefined).toContain('Clean up this order message')
  })

  it('emits the cleanup rules in order', () => {
    const prompt = buildCleanPrompt('test')
    const rules = ['Remove timestamps', 'Remove greetings', 'split them onto separate lines']
    rules.forEach((rule, i) => {
      const idx = prompt.indexOf(rule)
      expect(idx).toBeGreaterThan(i > 0 ? prompt.indexOf(rules[i - 1]) : -1)
    })
  })
})
