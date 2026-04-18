import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Settings } from '../Settings.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

vi.mock('../../gemma.js', () => ({
  MODELS: { small: { id: 'small', label: 'Gemma', size: '~300 MB', description: 'on-device' } },
  getLoadedModelId: () => null,
  getBackendInfo: () => null,
  cancelDownload: () => {},
}))

vi.mock('../../secure-storage.js', () => ({
  setSecret: vi.fn(async () => {}),
  getSecret: vi.fn(async () => ''),
  deleteSecret: vi.fn(async () => {}),
  migrateKeysFromLocalStorage: vi.fn(async () => {}),
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
  return render(
    <ToastProvider>
      <SettingsProvider>
        <Settings ai={makeAiStub()} onStartTour={() => {}} />
      </SettingsProvider>
    </ToastProvider>,
  )
}

function openBackupSection() {
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /^Backup & restore/i }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('Settings — Backup & restore section', () => {
  it('renders the Restore from backup button inside the section', () => {
    renderSettings()
    openBackupSection()
    expect(
      screen.getByRole('button', { name: /Restore from backup/i }),
    ).toBeInTheDocument()
  })

  it('opens the RestoreBackupModal when the Restore button is clicked', () => {
    renderSettings()
    openBackupSection()
    fireEvent.click(screen.getByRole('button', { name: /Restore from backup/i }))
    expect(screen.getByRole('dialog', { name: /Restore from backup/i })).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked', () => {
    renderSettings()
    openBackupSection()
    fireEvent.click(screen.getByRole('button', { name: /Restore from backup/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }))
    expect(screen.queryByRole('dialog', { name: /Restore from backup/i })).toBeNull()
  })
})
