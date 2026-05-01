import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { DebugLogsSection } from '../components/DebugLogsSection.jsx'
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

const toast = vi.fn()

function renderDebugLogsSection(settings = {}, saveSettings = vi.fn()) {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <DebugLogsSection
          settings={{ debug: { logLevel: 'error' }, ...settings }}
          saveSettings={saveSettings}
          toast={toast}
        />
      </SettingsProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  logger.clear()
  logger.setMinLevel('error')
  toast.mockClear()
})

describe('DebugLogsSection', () => {
  it('changing log level calls saveSettings with updated debug config', async () => {
    const saveSettings = vi.fn()
    renderDebugLogsSection({}, saveSettings)

    fireEvent.change(screen.getByLabelText(/log level/i), { target: { value: 'debug' } })

    expect(saveSettings).toHaveBeenCalledOnce()
    const updater = saveSettings.mock.calls[0][0]
    expect(typeof updater).toBe('function')
    expect(updater({})).toMatchObject({ debug: { logLevel: 'debug' } })
  })

  it('Clear empties the live viewer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('test', 'pre-clear entry')

    renderDebugLogsSection()

    fireEvent.click(screen.getByRole('button', { name: /^view logs$/i }))

    const viewer = await screen.findByTestId('log-viewer-body')
    expect(viewer.textContent).toMatch(/pre-clear entry/)

    const dialog = screen.getByRole('dialog', { name: /log viewer/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /^clear$/i }))

    await waitFor(() => {
      expect(screen.getByTestId('log-viewer-body').textContent).toMatch(/buffer empty/)
    })
    expect(logger.getSnapshot()).toHaveLength(0)
  })

  it('log viewer dialog pads for device safe-area insets (SMA-77)', async () => {
    renderDebugLogsSection()
    fireEvent.click(screen.getByRole('button', { name: /^view logs$/i }))

    const dialog = await screen.findByRole('dialog', { name: /log viewer/i })
    expect(dialog.style.paddingTop).toMatch(/env\(safe-area-inset-top/)
    expect(dialog.style.paddingBottom).toMatch(/env\(safe-area-inset-bottom/)
    expect(dialog.style.paddingLeft).toMatch(/env\(safe-area-inset-left/)
    expect(dialog.style.paddingRight).toMatch(/env\(safe-area-inset-right/)
  })

  it('Download triggers a blob URL with sip-logs-* filename', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('downloadable', 'something to save')

    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderDebugLogsSection()

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

  it('info-level hint shown when log level is below info', async () => {
    renderDebugLogsSection({ debug: { logLevel: 'error' } })
    fireEvent.click(screen.getByRole('button', { name: /^view logs$/i }))

    const hint = await screen.findByTestId('log-viewer-info-hint')
    expect(hint).toBeTruthy()
  })

  it('info-level hint hidden when log level is info or debug', async () => {
    renderDebugLogsSection({ debug: { logLevel: 'info' } })
    fireEvent.click(screen.getByRole('button', { name: /^view logs$/i }))

    expect(screen.queryByTestId('log-viewer-info-hint')).toBeNull()
  })

  it('Enable info logs button calls saveSettings with info level', async () => {
    const saveSettings = vi.fn()
    renderDebugLogsSection({ debug: { logLevel: 'error' } }, saveSettings)

    fireEvent.click(screen.getByRole('button', { name: /^view logs$/i }))

    const hint = screen.getByTestId('log-viewer-info-hint')
    fireEvent.click(within(hint).getByRole('button', { name: /enable info logs/i }))

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        debug: { logLevel: 'info' },
      }),
    )
    expect(toast).toHaveBeenCalledWith(
      'Log level set to info — pipeline traces now captured',
      'success',
      '🔎',
    )
  })
})
