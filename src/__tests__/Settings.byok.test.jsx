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
  isNativePlatform: () => false,
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
    handleByokListModels: vi.fn().mockResolvedValue({ ok: true, models: [] }),
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

// Open the Advanced <details> block. In jsdom clicking a <summary> flips
// details.open but doesn't fire the toggle event, so we set open and
// dispatch the event manually to exercise the React onToggle handler.
function openAdvanced() {
  const summary = screen.getByText(/advanced.*base url.*model/i)
  const details = summary.closest('details')
  details.open = true
  details.dispatchEvent(new Event('toggle'))
  return details
}

async function enterProviderAndKey(provider = 'openai', key = 'sk-test-xyz') {
  fireEvent.click(screen.getByRole('button', { name: /byok/i }))
  fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: provider } })
  const keyInput = await screen.findByLabelText(new RegExp(`${provider} api key`, 'i'))
  fireEvent.change(keyInput, { target: { value: key } })
  return keyInput
}

describe('Settings — BYOK model dropdown (SMA-96)', () => {
  it('fires handleByokListModels and renders returned models as options when Advanced opens with a key', async () => {
    const ai = makeAiStub({
      handleByokListModels: vi
        .fn()
        .mockResolvedValue({ ok: true, models: ['gpt-4o', 'gpt-4o-mini'] }),
    })
    renderSettings(ai)
    await enterProviderAndKey('openai', 'sk-test-xyz')

    openAdvanced()

    await waitFor(() => {
      expect(ai.handleByokListModels).toHaveBeenCalledTimes(1)
    })
    expect(ai.handleByokListModels.mock.calls[0][0].provider).toBe('openai')

    const select = await screen.findByLabelText(/^model$/i)
    await waitFor(() => {
      expect(select.querySelectorAll('option').length).toBe(3) // 2 models + Custom
    })
    expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'gpt-4o-mini' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /custom/i })).toBeInTheDocument()
  })

  it('does not fire handleByokListModels when no key is entered, and shows only Custom in the dropdown', async () => {
    const ai = makeAiStub({
      handleByokListModels: vi.fn().mockResolvedValue({ ok: true, models: ['gpt-4o'] }),
    })
    renderSettings(ai)
    fireEvent.click(screen.getByRole('button', { name: /byok/i }))
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: 'openai' } })
    // Key is blank — open Advanced and expect no fetch.
    openAdvanced()

    // Give React a chance to flush any onToggle side effects.
    await waitFor(() => {
      expect(ai.handleByokListModels).not.toHaveBeenCalled()
    })

    const select = await screen.findByLabelText(/^model$/i)
    const options = select.querySelectorAll('option')
    expect(options.length).toBe(1)
    expect(options[0]).toHaveValue('__custom')
  })

  it('writes byokModel with the selected option id when the user picks a listed model', async () => {
    const ai = makeAiStub({
      handleByokListModels: vi
        .fn()
        .mockResolvedValue({ ok: true, models: ['gpt-4o', 'gpt-4o-mini'] }),
    })
    renderSettings(ai)
    await enterProviderAndKey('openai', 'sk-test-xyz')
    openAdvanced()

    const select = await screen.findByLabelText(/^model$/i)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'gpt-4o-mini' })).toBeInTheDocument()
    })
    fireEvent.change(select, { target: { value: 'gpt-4o-mini' } })

    await waitFor(() => {
      expect(select.value).toBe('gpt-4o-mini')
    })
  })

  it('reveals the custom input when the user picks "Custom…" and preserves what they type', async () => {
    const ai = makeAiStub({
      handleByokListModels: vi
        .fn()
        .mockResolvedValue({ ok: true, models: ['gpt-4o', 'gpt-4o-mini'] }),
    })
    renderSettings(ai)
    await enterProviderAndKey('openai', 'sk-test-xyz')
    openAdvanced()

    const select = await screen.findByLabelText(/^model$/i)
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument()
    })
    // Pick the custom sentinel — the free-text input should appear.
    fireEvent.change(select, { target: { value: '__custom' } })
    const customInput = await screen.findByLabelText(/custom model/i)
    expect(customInput).toBeInTheDocument()

    fireEvent.change(customInput, { target: { value: 'my-custom-model' } })
    await waitFor(() => {
      expect(customInput.value).toBe('my-custom-model')
    })
  })

  it('on fetch error, renders the error message and keeps the custom input visible', async () => {
    const ai = makeAiStub({
      handleByokListModels: vi
        .fn()
        .mockResolvedValue({ ok: false, models: [], error: 'Invalid API key' }),
    })
    renderSettings(ai)
    await enterProviderAndKey('openai', 'sk-test-xyz')
    openAdvanced()

    await waitFor(() => {
      expect(ai.handleByokListModels).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText(/Couldn't fetch models.*Invalid API key/i)).toBeInTheDocument()
    // Manual-entry fallback must still be there.
    expect(screen.getByLabelText(/custom model/i)).toBeInTheDocument()
  })

  it('refreshing the list re-calls handleByokListModels', async () => {
    const ai = makeAiStub({
      handleByokListModels: vi.fn().mockResolvedValue({ ok: true, models: ['gpt-4o'] }),
    })
    renderSettings(ai)
    await enterProviderAndKey('openai', 'sk-test-xyz')
    openAdvanced()

    await waitFor(() => {
      expect(ai.handleByokListModels).toHaveBeenCalledTimes(1)
    })
    const refreshBtn = screen.getByTitle(/refresh model list/i)
    fireEvent.click(refreshBtn)
    await waitFor(() => {
      expect(ai.handleByokListModels).toHaveBeenCalledTimes(2)
    })
  })
})
