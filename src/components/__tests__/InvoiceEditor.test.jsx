import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvoiceEditor } from '../InvoiceEditor.jsx'
import { InvoiceProvider } from '../../contexts/InvoiceContext.jsx'
import { CatalogProvider } from '../../contexts/CatalogContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { Medium: 'MEDIUM' },
}))

vi.mock('../../pdf.js', () => ({
  savePDFToPhone: vi.fn(),
  sharePDF: vi.fn(),
  openPDF: vi.fn(),
  getPDFFilename: () => 'invoice.pdf',
  pdfFileExists: vi.fn(async () => false),
}))

vi.mock('../../hooks/useInvoiceIntelligence.js', () => ({
  useInvoiceIntelligence: vi.fn(() => ({ issues: [], hasIssues: false })),
}))

vi.mock('../../hooks/useCatalogSync.js', () => ({
  useCatalogSync: vi.fn(() => ({
    products: [],
    saveProducts: vi.fn(),
    lastSynced: null,
    syncStatus: 'idle',
    syncCount: 0,
    handleSyncCatalog: vi.fn(),
  })),
}))

vi.mock('../../secure-storage.js', () => ({
  setSecret: vi.fn(),
  getSecret: vi.fn(() => Promise.resolve(null)),
  migrateKeysFromLocalStorage: vi.fn(() => Promise.resolve()),
}))

import { useInvoiceIntelligence } from '../../hooks/useInvoiceIntelligence.js'

function TestEditor() {
  return (
    <InvoiceEditor
      contacts={[]}
      onAddContact={vi.fn(() => ({ id: 'c_new' }))}
      onUpdateContact={vi.fn()}
      aiMode="off"
      aiReady={false}
      runInference={vi.fn()}
      toast={vi.fn()}
      smartPasteContext={{}}
      onOpenSettings={vi.fn()}
      searchTier="local"
      byokProvider=""
    />
  )
}

function renderEditor() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <CatalogProvider>
          <InvoiceProvider onOpenEditor={vi.fn()}>
            <TestEditor />
          </InvoiceProvider>
        </CatalogProvider>
      </ToastProvider>
    </SettingsProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  useInvoiceIntelligence.mockReturnValue({ issues: [], hasIssues: false })
})

describe('InvoiceEditor', () => {
  it('renders placeholder when no invoice is being edited', () => {
    renderEditor()
    expect(screen.getByText('No invoice')).toBeInTheDocument()
  })

  it('does not render InvoiceIntelligenceGuard when no issues', () => {
    renderEditor()
    expect(screen.queryByText('Review before saving')).toBeNull()
  })
})
