import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Settings } from '../Settings.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'
import { ToastProvider } from '../../contexts/ToastContext.jsx'

// Stub gemma — jsdom can't handle MediaPipe/WebGPU imports.
vi.mock('../../gemma.js', () => ({
  MODELS: { small: { id: 'small', label: 'Gemma', size: '~300 MB', description: 'on-device' } },
  getLoadedModelId: () => null,
  getBackendInfo: () => null,
  cancelDownload: () => {},
}))

// Mock the shopify client so we can assert the Test Connection wiring.
vi.mock('../../api/shopify.js', () => ({
  fetchShopifyProducts: vi.fn().mockResolvedValue([]),
}))

import { fetchShopifyProducts } from '../../api/shopify.js'

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

function openIntegrations() {
  fireEvent.click(screen.getByRole('button', { expanded: false, name: /^Integrations/i }))
}

function renderSettings() {
  const utils = render(
    <ToastProvider>
      <SettingsProvider>
        <Settings ai={makeAiStub()} onStartTour={() => {}} />
      </SettingsProvider>
    </ToastProvider>,
  )
  openIntegrations()
  return utils
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  fetchShopifyProducts.mockClear()
})

describe('Settings — Shopify section', () => {
  it('renders the Shopify fields under the Integrations section', () => {
    renderSettings()
    expect(screen.getByLabelText(/Shop Domain/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Admin API Access Token/i)).toBeInTheDocument()
  })

  it('renders the active-integration radio group', () => {
    renderSettings()
    const group = screen.getByRole('radiogroup', { name: /Active integration/i })
    expect(within(group).getByLabelText(/Squarespace/i)).toBeInTheDocument()
    expect(within(group).getByLabelText(/Shopify/i)).toBeInTheDocument()
    expect(within(group).getByLabelText(/None/i)).toBeInTheDocument()
  })

  it('masks the access token input (type=password)', () => {
    renderSettings()
    expect(screen.getByLabelText(/Admin API Access Token/i)).toHaveAttribute('type', 'password')
  })

  it('disables the Shopify Test Connection until both fields are filled', async () => {
    renderSettings()
    const testBtn = screen.getAllByRole('button', { name: /Test Connection/i })[1]
    expect(testBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Shop Domain/i), {
      target: { value: 'acme.myshopify.com' },
    })
    expect(testBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Admin API Access Token/i), {
      target: { value: 'shpat_test' },
    })
    await waitFor(() => expect(testBtn).not.toBeDisabled())
  })

  it('invokes fetchShopifyProducts and flips to Connected on success', async () => {
    renderSettings()
    fireEvent.change(screen.getByLabelText(/Shop Domain/i), {
      target: { value: 'acme.myshopify.com' },
    })
    fireEvent.change(screen.getByLabelText(/Admin API Access Token/i), {
      target: { value: 'shpat_test' },
    })
    const testBtn = screen.getAllByRole('button', { name: /Test Connection/i })[1]
    fireEvent.click(testBtn)

    await waitFor(() => {
      expect(fetchShopifyProducts).toHaveBeenCalledWith('acme.myshopify.com', 'shpat_test')
    })
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Connected/i }).length).toBeGreaterThan(0)
    })
  })

  it('surfaces the error message when fetchShopifyProducts rejects', async () => {
    fetchShopifyProducts.mockRejectedValueOnce(new Error('Shopify API 401: Unauthorized'))
    renderSettings()
    fireEvent.change(screen.getByLabelText(/Shop Domain/i), {
      target: { value: 'acme.myshopify.com' },
    })
    fireEvent.change(screen.getByLabelText(/Admin API Access Token/i), {
      target: { value: 'shpat_test' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /Test Connection/i })[1])

    await waitFor(() =>
      expect(screen.getByText(/Shopify API 401: Unauthorized/i)).toBeInTheDocument(),
    )
  })
})
