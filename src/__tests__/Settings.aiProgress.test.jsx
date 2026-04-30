/**
 * SMA-47 — AI model download progress UI states.
 *
 * Covers the three sentinels emitted by `_downloadWeb`:
 *   progress == null → "Connecting…"    (pre-fetch)
 *   progress === -1  → "Downloading…"   (bytes flowing, size unknown)
 *   progress ∈ (0,1) → "Downloading…"   + "NN%"
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Settings } from '../components/Settings.jsx'
import { SettingsProvider } from '../contexts/SettingsContext.jsx'
import { ToastProvider } from '../contexts/ToastContext.jsx'

vi.mock('../gemma.js', () => ({
  MODELS: {
    small: {
      id: 'small',
      label: 'Gemma 3 1B (int4)',
      size: '~670 MB',
      description: 'on-device',
    },
  },
  getLoadedModelId: () => null,
  getBackendInfo: () => null,
  cancelDownload: () => {},
  isNativePlatform: () => false,
}))

function makeAiStub(progressValue) {
  return {
    aiModelId: 'small',
    aiDownloaded: {},
    aiDownloadProgress: { small: progressValue },
    aiDownloading: 'small',
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

function renderWithProgress(progressValue) {
  const utils = render(
    <ToastProvider>
      <SettingsProvider>
        <Settings ai={makeAiStub(progressValue)} onStartTour={() => {}} />
      </SettingsProvider>
    </ToastProvider>,
  )
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /^AI/i }))
  return utils
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

describe('Settings — AI download progress labels (SMA-47)', () => {
  it('renders "Connecting…" with an indeterminate bar when progress is null', () => {
    renderWithProgress(null)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: /connecting/i })
    expect(bar).not.toHaveAttribute('aria-valuenow')
  })

  it('renders "Downloading…" (no percent) with an indeterminate bar when progress is -1', () => {
    renderWithProgress(-1)
    expect(screen.getByText('Downloading…')).toBeInTheDocument()
    expect(screen.queryByText('Connecting…')).not.toBeInTheDocument()
    // Indeterminate means no aria-valuenow and no "NN%" in the secondary label.
    const bar = screen.getByRole('progressbar', { name: /downloading ai model/i })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('renders "Downloading…" + "37%" with a determinate bar when progress is a fraction', () => {
    renderWithProgress(0.37)
    expect(screen.getByText('Downloading…')).toBeInTheDocument()
    expect(screen.getByText('37%')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: /downloading ai model/i })
    expect(bar).toHaveAttribute('aria-valuenow', '37')
  })
})
