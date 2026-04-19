import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Settings } from '../Settings.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

vi.mock('../../gemma.js', () => ({
  MODELS: { small: { id: 'small', label: 'Gemma', size: '~300 MB', description: 'on-device' } },
  getLoadedModelId: () => null,
  getBackendInfo: () => null,
  cancelDownload: () => {},
}))

vi.mock('../../utils/shareBackup.js', () => ({
  shareOrDownload: vi.fn(async () => ({ platform: 'web' })),
}))

vi.mock('../../utils/dataExport.js', () => ({
  EXPORT_KIND: 'smart-invoice-pro-backup',
  buildExportSnapshot: vi.fn(async () => ({
    kind: 'smart-invoice-pro-backup',
    version: 1,
    exportedAt: '2026-04-18T20:00:00.000Z',
    data: {
      invoices: [{ id: 'INV-1', customer: 'Acme', items: [], tax: '0' }],
      products: [],
      orders: [],
    },
  })),
  snapshotToJson: vi.fn((s) => JSON.stringify(s, null, 2)),
  invoicesToCsv: vi.fn(() => 'invoice_number\r\nINV-1'),
  backupFilename: vi.fn(() => 'smart-invoice-pro-backup-2026-04-18.json'),
}))

import { shareOrDownload } from '../../utils/shareBackup.js'
import { buildExportSnapshot, invoicesToCsv } from '../../utils/dataExport.js'

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
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /^Backup & restore/i }))
  return utils
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  shareOrDownload.mockClear()
  shareOrDownload.mockResolvedValue({ platform: 'web' })
  buildExportSnapshot.mockClear()
  invoicesToCsv.mockClear()
})

describe('Settings — Backup & restore section', () => {
  it('renders both export buttons under the Backup & restore section', () => {
    renderSettings()
    expect(screen.getByRole('button', { name: /Export all data \(JSON\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export invoices \(CSV\)/i })).toBeInTheDocument()
  })

  it('JSON button builds a snapshot and hands JSON to shareOrDownload', async () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /Export all data \(JSON\)/i }))

    await waitFor(() => expect(shareOrDownload).toHaveBeenCalledTimes(1))
    expect(buildExportSnapshot).toHaveBeenCalledTimes(1)
    const args = shareOrDownload.mock.calls[0][0]
    expect(args.filename).toBe('smart-invoice-pro-backup-2026-04-18.json')
    expect(args.mimeType).toBe('application/json')
    expect(typeof args.content).toBe('string')
    expect(JSON.parse(args.content).kind).toBe('smart-invoice-pro-backup')
  })

  it('CSV button renders invoices via invoicesToCsv and uses a .csv filename', async () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /Export invoices \(CSV\)/i }))

    await waitFor(() => expect(shareOrDownload).toHaveBeenCalledTimes(1))
    expect(invoicesToCsv).toHaveBeenCalledTimes(1)
    const args = shareOrDownload.mock.calls[0][0]
    expect(args.mimeType).toBe('text/csv')
    expect(args.filename).toMatch(/smart-invoice-pro-invoices-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(args.content).toContain('invoice_number')
  })

  it('surfaces shareOrDownload errors as an alert instead of silently failing', async () => {
    shareOrDownload.mockRejectedValueOnce(new Error('disk full'))
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /Export all data \(JSON\)/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/disk full/i),
    )
  })

  it('disables both buttons while an export is in flight', async () => {
    let resolveShare
    shareOrDownload.mockImplementationOnce(
      () => new Promise((resolve) => (resolveShare = resolve)),
    )
    renderSettings()

    const jsonBtn = screen.getByRole('button', { name: /Export all data \(JSON\)/i })
    const csvBtn = screen.getByRole('button', { name: /Export invoices \(CSV\)/i })

    fireEvent.click(jsonBtn)

    await waitFor(() => expect(screen.getByRole('button', { name: /Exporting…/i })).toBeDisabled())
    expect(csvBtn).toBeDisabled()

    resolveShare({ platform: 'web' })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Export all data \(JSON\)/i })).not.toBeDisabled(),
    )
  })

  it('clears a prior error when the next export starts', async () => {
    shareOrDownload.mockRejectedValueOnce(new Error('boom'))
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /Export all data \(JSON\)/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/boom/i))

    shareOrDownload.mockResolvedValueOnce({ platform: 'web' })
    fireEvent.click(screen.getByRole('button', { name: /Export all data \(JSON\)/i }))

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('renders the Restore from backup button under the Backup & restore section', () => {
    renderSettings()
    expect(screen.getByRole('button', { name: /Restore from backup/i })).toBeInTheDocument()
  })

  it('opens the RestoreBackupModal when the Restore button is clicked', () => {
    renderSettings()
    expect(screen.queryByRole('dialog', { name: /Restore from backup/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Restore from backup/i }))

    expect(screen.getByRole('dialog', { name: /Restore from backup/i })).toBeInTheDocument()
  })

  it('closes the RestoreBackupModal when Cancel is clicked', async () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /Restore from backup/i }))
    const dialog = screen.getByRole('dialog', { name: /Restore from backup/i })

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Restore from backup/i })).toBeNull(),
    )
    expect(dialog).not.toBeInTheDocument()
  })

  describe('Include API keys toggle (SMA-90)', () => {
    it('renders the toggle unchecked by default with no warning copy', () => {
      renderSettings()
      const toggle = screen.getByRole('checkbox', { name: /Include API keys in export/i })
      expect(toggle).toBeInTheDocument()
      expect(toggle).not.toBeChecked()
      expect(screen.queryByTestId('include-secrets-warning')).toBeNull()
    })

    it('JSON export passes includeSecrets:false when the toggle is off', async () => {
      renderSettings()
      fireEvent.click(screen.getByRole('button', { name: /Export all data \(JSON\)/i }))

      await waitFor(() => expect(buildExportSnapshot).toHaveBeenCalledTimes(1))
      expect(buildExportSnapshot).toHaveBeenCalledWith({ includeSecrets: false })
    })

    it('shows the red warning copy and passes includeSecrets:true after the user opts in', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      try {
        renderSettings()
        fireEvent.click(screen.getByRole('checkbox', { name: /Include API keys in export/i }))

        expect(screen.getByTestId('include-secrets-warning')).toHaveTextContent(
          /anyone with this file can act as you/i,
        )

        fireEvent.click(screen.getByRole('button', { name: /Export all data \(JSON\)/i }))

        expect(confirmSpy).toHaveBeenCalledTimes(1)
        await waitFor(() => expect(buildExportSnapshot).toHaveBeenCalledTimes(1))
        expect(buildExportSnapshot).toHaveBeenCalledWith({ includeSecrets: true })
      } finally {
        confirmSpy.mockRestore()
      }
    })

    it('aborts the JSON export when the user cancels the confirm prompt', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      try {
        renderSettings()
        fireEvent.click(screen.getByRole('checkbox', { name: /Include API keys in export/i }))
        fireEvent.click(screen.getByRole('button', { name: /Export all data \(JSON\)/i }))

        expect(confirmSpy).toHaveBeenCalledTimes(1)
        expect(buildExportSnapshot).not.toHaveBeenCalled()
        expect(shareOrDownload).not.toHaveBeenCalled()
      } finally {
        confirmSpy.mockRestore()
      }
    })

    it('CSV export path is unaffected by the toggle', async () => {
      renderSettings()
      fireEvent.click(screen.getByRole('checkbox', { name: /Include API keys in export/i }))
      fireEvent.click(screen.getByRole('button', { name: /Export invoices \(CSV\)/i }))

      await waitFor(() => expect(invoicesToCsv).toHaveBeenCalledTimes(1))
      // CSV path calls buildExportSnapshot without options — secrets never touched.
      expect(buildExportSnapshot).toHaveBeenCalledTimes(1)
      expect(buildExportSnapshot.mock.calls[0]).toEqual([])
      const args = shareOrDownload.mock.calls[0][0]
      expect(args.mimeType).toBe('text/csv')
    })
  })
})
