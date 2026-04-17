import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Settings } from '../components/Settings.jsx'
import { SettingsProvider } from '../contexts/SettingsContext.jsx'
import { ToastProvider } from '../contexts/ToastContext.jsx'
import { logger } from '../utils/logger.js'

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

function makeAiStub() {
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
    handleByokTest: vi.fn(),
    handleByokClear: vi.fn(),
  }
}

function renderSettings() {
  const utils = render(
    <ToastProvider>
      <SettingsProvider>
        <Settings ai={makeAiStub()} onStartTour={() => {}} />
      </SettingsProvider>
    </ToastProvider>,
  )
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /^Debugging/ }))
  return utils
}

beforeEach(() => {
  localStorage.clear()
  logger.clear()
  logger.setMinLevel('error')
})

describe('Settings — Debugging section', () => {
  it('changing log level and saving persists to context and applies to logger', async () => {
    renderSettings()

    fireEvent.change(screen.getByLabelText(/log level/i), { target: { value: 'debug' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))

    await waitFor(() => {
      expect(logger.getMinLevel()).toBe('debug')
    })

    const stored = JSON.parse(localStorage.getItem('sip_settings'))
    expect(stored.debug).toEqual({ logLevel: 'debug' })
  })

  it('Clear empties the live viewer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('test', 'pre-clear entry')

    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /^view logs$/i }))

    const viewer = await screen.findByTestId('log-viewer-body')
    expect(viewer.textContent).toMatch(/pre-clear entry/)

    // Use the modal's Clear button (avoids the duplicate "Clear logs" in the section).
    const dialog = screen.getByRole('dialog', { name: /log viewer/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^clear$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('log-viewer-body').textContent).toMatch(/buffer empty/)
    })
    expect(logger.getSnapshot()).toHaveLength(0)
  })

  it('Download triggers a blob URL with sip-logs-* filename', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('downloadable', 'something to save')

    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /^download logs$/i }))

    expect(createSpy).toHaveBeenCalledTimes(1)
    const blob = createSpy.mock.calls[0][0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('text/plain')
    expect(clickSpy).toHaveBeenCalledTimes(1)

    createSpy.mockRestore()
    revokeSpy.mockRestore()
    clickSpy.mockRestore()
  })
})
