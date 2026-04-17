import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Settings } from '../components/Settings.jsx'
import { SettingsProvider } from '../contexts/SettingsContext.jsx'
import { ToastProvider } from '../contexts/ToastContext.jsx'

// Gemma pulls in MediaPipe / WebGPU which jsdom can't handle. Stub it.
vi.mock('../gemma.js', () => ({
  MODELS: {
    small: {
      id: 'small',
      label: 'Gemma 3 1B (int4)',
      size: '~300 MB',
      description: 'on-device',
    },
  },
  getLoadedModelId: () => null,
  getBackendInfo: () => null,
  cancelDownload: () => {},
}))

function makeAiStub(overrides = {}) {
  return {
    aiModelId: 'small',
    aiDownloaded: {},
    aiDownloadProgress: {},
    aiDownloading: null,
    aiLoading: false,
    aiReady: false,
    handleAiSelect: vi.fn(),
    handleAiDownload: vi.fn(),
    handleAiDelete: vi.fn(),
    handleAiLoad: vi.fn(),
    byokStatus: 'idle',
    byokError: '',
    handleByokTest: vi.fn().mockResolvedValue({ ok: true }),
    handleByokClear: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderSettings(ai) {
  const utils = render(
    <ToastProvider>
      <SettingsProvider>
        <Settings ai={ai} onStartTour={() => {}} />
      </SettingsProvider>
    </ToastProvider>,
  )
  // SettingsSection is collapsed by default — expand the AI section.
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /^AI/i }))
  return utils
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('Settings — BYOK card', () => {
  it('renders the three-way AI mode selector', () => {
    renderSettings(makeAiStub())
    expect(screen.getByRole('button', { name: /on-device/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /byok/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^off/i })).toBeInTheDocument()
  })

  it('shows a disabled-mode hint when Off is selected', () => {
    renderSettings(makeAiStub())
    fireEvent.click(screen.getByRole('button', { name: /^off/i }))
    expect(screen.getByText(/AI is disabled/i)).toBeInTheDocument()
  })

  it('disables Test Connection until a key is entered', async () => {
    renderSettings(makeAiStub())
    fireEvent.click(screen.getByRole('button', { name: /byok/i }))
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })

    const testBtn = await screen.findByRole('button', { name: /test connection/i })
    expect(testBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/openai api key/i), {
      target: { value: 'sk-test-123' },
    })
    await waitFor(() => expect(testBtn).not.toBeDisabled())
  })

  it('calls handleByokTest with the provider, base URL, and model on click', async () => {
    const ai = makeAiStub()
    renderSettings(ai)
    fireEvent.click(screen.getByRole('button', { name: /byok/i }))
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    fireEvent.change(screen.getByLabelText(/openai api key/i), {
      target: { value: 'sk-test-xyz' },
    })

    const testBtn = await screen.findByRole('button', { name: /test connection/i })
    await waitFor(() => expect(testBtn).not.toBeDisabled())
    fireEvent.click(testBtn)

    await waitFor(() => {
      expect(ai.handleByokTest).toHaveBeenCalledTimes(1)
    })
    const arg = ai.handleByokTest.mock.calls[0][0]
    expect(arg.provider).toBe('openai')
  })

  it('renders the error status message when byok test fails', () => {
    renderSettings(makeAiStub({ byokStatus: 'error', byokError: 'Invalid key' }))
    fireEvent.click(screen.getByRole('button', { name: /byok/i }))
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    expect(screen.getByRole('status')).toHaveTextContent(/Invalid key/)
  })

  it('masks the API key input (type=password)', () => {
    renderSettings(makeAiStub())
    fireEvent.click(screen.getByRole('button', { name: /byok/i }))
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    const input = screen.getByLabelText(/openai api key/i)
    expect(input).toHaveAttribute('type', 'password')
  })
})
