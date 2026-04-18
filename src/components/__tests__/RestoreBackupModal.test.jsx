import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RestoreBackupModal } from '../RestoreBackupModal.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'
import { EXPORT_KIND, SCHEMA_VERSION } from '../../utils/dataExport.js'

vi.mock('../../secure-storage.js', () => ({
  setSecret: vi.fn(async () => {}),
  getSecret: vi.fn(async () => ''),
  deleteSecret: vi.fn(async () => {}),
  migrateKeysFromLocalStorage: vi.fn(async () => {}),
}))

function goodSnapshot() {
  return {
    kind: EXPORT_KIND,
    version: SCHEMA_VERSION,
    exportedAt: '2026-04-18T20:00:00.000Z',
    app: { name: 'Smart Invoice Pro', version: '1.0.0' },
    data: {
      invoices: [{ id: 'INV-1', customer: 'Alice' }],
      products: [{ id: 1, name: 'Bolt' }],
      productsSyncedAt: 1700000000000,
      orders: [{ id: 'o1' }],
      ordersSyncedAt: 1700000001000,
      picks: {},
      settings: { businessName: 'Acme' },
      onboarded: 'real',
      aiModelId: 'small',
    },
    secrets: null,
  }
}

function renderModal(props = {}) {
  return render(
    <ToastProvider>
      <RestoreBackupModal onClose={() => {}} {...props} />
    </ToastProvider>,
  )
}

function makeFile(content, name = 'backup.json') {
  return new File([content], name, { type: 'application/json' })
}

async function pickFile(file) {
  const input = document.querySelector('input[type="file"]')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

let reloadSpy
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  reloadSpy = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: reloadSpy },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RestoreBackupModal', () => {
  it('renders the initial picker UI', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: /Restore from backup/i })).toBeInTheDocument()
    expect(screen.getByText(/Choose backup file/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Restore$/i })).toBeDisabled()
  })

  it('shows preview counts and enables restore when a valid file is picked', async () => {
    renderModal()
    await pickFile(makeFile(JSON.stringify(goodSnapshot())))

    await waitFor(() => {
      expect(screen.getByText(/Preview/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/1 invoices · 1 products · 1 orders/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Restore$/i })).toBeEnabled()
  })

  it('reports a validation error for a snapshot with the wrong kind', async () => {
    renderModal()
    await pickFile(makeFile(JSON.stringify({ ...goodSnapshot(), kind: 'nope' })))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unexpected backup kind/)
    })
    expect(screen.getByRole('button', { name: /Restore$/i })).toBeDisabled()
  })

  it('reports a parse error for non-JSON input', async () => {
    renderModal()
    await pickFile(makeFile('{ not json'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/not valid JSON/i)
    })
  })

  it('writes the snapshot to storage and reloads the page on restore', async () => {
    const onApplied = vi.fn()
    renderModal({ onApplied })

    await pickFile(makeFile(JSON.stringify(goodSnapshot())))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Restore$/i })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole('button', { name: /Restore$/i }))

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('sip_invoices'))).toEqual([
        { id: 'INV-1', customer: 'Alice' },
      ])
    })
    expect(onApplied).toHaveBeenCalled()

    // Reload is scheduled behind a short delay so the toast can render.
    await waitFor(() => expect(reloadSpy).toHaveBeenCalled(), { timeout: 1000 })
  })

  it('supports the replace mode toggle before restore', async () => {
    renderModal()
    await pickFile(makeFile(JSON.stringify(goodSnapshot())))
    await waitFor(() => expect(screen.getByText(/Replace all/i)).toBeInTheDocument())

    localStorage.setItem('sip_settings', JSON.stringify({ theme: 'dark' }))

    fireEvent.click(screen.getByLabelText(/Replace all/i))
    fireEvent.click(screen.getByRole('button', { name: /Restore$/i }))

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('sip_settings'))).toEqual({ businessName: 'Acme' })
    })
  })
})
