import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SmartPasteFeedbackModal } from '../SmartPasteFeedbackModal.jsx'

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = value
    },
    removeItem: (key) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

vi.mock('../../api/feedbackSubmit.js', () => ({
  submitPasteFeedback: vi.fn().mockResolvedValue({ id: 'test-issue' }),
}))

describe('SmartPasteFeedbackModal fine-tuning opt-in', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  const corrections = [
    {
      originalText: 'blue widget set',
      aiMatch: 'Blue Widget',
      confidence: 72,
      correctedProduct: 'Premium Blue Widget',
      correctedProductId: 'BW-100',
    },
  ]

  it('renders fine-tuning opt-in checkbox', () => {
    render(
      <SmartPasteFeedbackModal
        corrections={corrections}
        rawText="hello"
        onClose={() => {}}
        toast={() => {}}
      />,
    )
    expect(
      screen.getByRole('checkbox', { name: /Send corrections for AI fine-tuning/i }),
    ).toBeInTheDocument()
  })

  it('opt-in checkbox defaults to unchecked', () => {
    render(
      <SmartPasteFeedbackModal
        corrections={corrections}
        rawText="hello"
        onClose={() => {}}
        toast={() => {}}
      />,
    )
    const checkbox = screen.getByRole('checkbox', { name: /Send corrections for AI fine-tuning/i })
    expect(checkbox).not.toBeChecked()
  })

  it('stores JSONL to localStorage when opt-in is checked on submit', async () => {
    render(
      <SmartPasteFeedbackModal
        corrections={corrections}
        rawText="hello"
        onClose={() => {}}
        toast={() => {}}
      />,
    )
    const checkbox = screen.getByRole('checkbox', { name: /Send corrections for AI fine-tuning/i })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /Yes, share feedback/i }))
    await vi.waitFor(() => {
      expect(localStorage.getItem('sip_finetune_export_v1')).toBeTruthy()
    })
    const jsonl = localStorage.getItem('sip_finetune_export_v1')
    const entries = jsonl.split('\n').filter(Boolean)
    expect(entries.length).toBe(1)
    const parsed = JSON.parse(entries[0])
    expect(parsed.prompt).toContain('blue widget set')
    expect(parsed.completion).toBe('Premium Blue Widget')
  })

  it('does not store JSONL when opt-in is not checked', async () => {
    render(
      <SmartPasteFeedbackModal
        corrections={corrections}
        rawText="hello"
        onClose={() => {}}
        toast={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Yes, share feedback/i }))
    await vi.waitFor(() => {
      expect(localStorage.getItem('sip_finetune_export_v1')).toBeNull()
    })
  })
})
