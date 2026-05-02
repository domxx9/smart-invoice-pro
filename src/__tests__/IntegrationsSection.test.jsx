import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IntegrationsSection } from '../components/settings/IntegrationsSection.jsx'
import { SettingsProvider } from '../contexts/SettingsContext.jsx'
import { ToastProvider } from '../contexts/ToastContext.jsx'
import { fetchSquarespaceProducts } from '../api/squarespace.js'
import { fetchShopifyProducts } from '../api/shopify.js'

vi.mock('../api/squarespace.js')
vi.mock('../api/shopify.js')

const toast = vi.fn()

function renderIntegrationsSection(settings = {}, onChange = vi.fn()) {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <IntegrationsSection
          settings={{
            activeIntegration: null,
            sqApiKey: '',
            sqDomain: '',
            shopifyShopDomain: '',
            shopifyAccessToken: '',
            ...settings,
          }}
          onChange={onChange}
          toast={toast}
        />
      </SettingsProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  toast.mockClear()
  vi.clearAllMocks()
})

describe('IntegrationsSection', () => {
  it('renders Squarespace and Shopify credential forms', () => {
    renderIntegrationsSection()
    expect(screen.getByPlaceholderText('sq_…')).toBeTruthy()
    expect(screen.getByPlaceholderText('yourstore.squarespace.com')).toBeTruthy()
    expect(screen.getByPlaceholderText('yourstore.myshopify.com')).toBeTruthy()
    expect(screen.getByPlaceholderText('shpat_…')).toBeTruthy()
  })

  it('renders active integration radio buttons', () => {
    renderIntegrationsSection()
    expect(screen.getByRole('radio', { name: 'Squarespace' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Shopify' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'None' })).toBeTruthy()
  })

  it('calls onChange when Squarespace radio is selected', () => {
    const onChange = vi.fn()
    renderIntegrationsSection({ activeIntegration: null }, onChange)
    fireEvent.click(screen.getByRole('radio', { name: 'Squarespace' }))
    expect(onChange).toHaveBeenCalledWith('activeIntegration', 'squarespace')
  })

  it('calls onChange when Shopify radio is selected', () => {
    const onChange = vi.fn()
    renderIntegrationsSection({ activeIntegration: null }, onChange)
    fireEvent.click(screen.getByRole('radio', { name: 'Shopify' }))
    expect(onChange).toHaveBeenCalledWith('activeIntegration', 'shopify')
  })

  it('calls onChange when None radio is selected', () => {
    const onChange = vi.fn()
    renderIntegrationsSection({ activeIntegration: 'squarespace' }, onChange)
    fireEvent.click(screen.getByRole('radio', { name: 'None' }))
    expect(onChange).toHaveBeenCalledWith('activeIntegration', null)
  })

  describe('Squarespace test connection', () => {
    it('shows "Test Connection" button in idle state', () => {
      renderIntegrationsSection({ sqApiKey: 'sq_test_key' })
      expect(screen.getAllByRole('button', { name: /^Test Connection$/i })[0]).toBeTruthy()
    })

    it('button disabled when sqApiKey is empty', () => {
      renderIntegrationsSection({ sqApiKey: '' })
      expect(screen.getAllByRole('button', { name: /^Test Connection$/i })[0]).toBeDisabled()
    })

    it('button disabled while testing', () => {
      renderIntegrationsSection({ sqApiKey: 'sq_test_key' })
      fireEvent.click(screen.getAllByRole('button', { name: /^Test Connection$/i })[0])
      expect(screen.getAllByRole('button', { name: /^Test Connection$/i })[0]).toBeDisabled()
    })

    it('button disabled when sqApiKey is empty', () => {
      renderIntegrationsSection({ sqApiKey: '' })
      expect(screen.getAllByRole('button', { name: /^Test Connection$/i })[0]).toBeDisabled()
    })

    it('button disabled while testing', () => {
      renderIntegrationsSection({ sqApiKey: 'sq_test_key' })
      fireEvent.click(screen.getAllByRole('button', { name: /^Test Connection$/i })[0])
      expect(screen.getAllByRole('button', { name: /^Test Connection$/i })[0]).toBeDisabled()
    })

    it('shows "✓ Connected" on successful test', async () => {
      fetchSquarespaceProducts.mockResolvedValueOnce([])
      renderIntegrationsSection({ sqApiKey: 'sq_test_key' })
      fireEvent.click(screen.getAllByRole('button', { name: /^Test Connection$/i })[0])
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^✓ Connected/ })).toBeTruthy()
      })
    })

    it('shows error message on failed test', async () => {
      fetchSquarespaceProducts.mockRejectedValueOnce(new Error('Invalid API key'))
      renderIntegrationsSection({ sqApiKey: 'sq_bad_key' })
      fireEvent.click(screen.getAllByRole('button', { name: /^Test Connection$/i })[0])
      await waitFor(() => {
        expect(screen.getByTestId('sq-test-error')).toHaveTextContent('Invalid API key')
      })
    })

    it('shows "✗ Failed" button label on error', async () => {
      fetchSquarespaceProducts.mockRejectedValueOnce(new Error('bad'))
      renderIntegrationsSection({ sqApiKey: 'sq_bad_key' })
      fireEvent.click(screen.getAllByRole('button', { name: /^Test Connection$/i })[0])
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^✗ Failed/ })).toBeTruthy()
      })
    })
  })

  describe('Shopify test connection', () => {
    it('shows "Test Connection" button in idle state', () => {
      renderIntegrationsSection({
        sqApiKey: '',
        shopifyShopDomain: 'test.myshopify.com',
        shopifyAccessToken: 'shpat_test',
      })
      expect(screen.getAllByRole('button', { name: /^Test Connection$/i })[1]).toBeTruthy()
    })

    it('button disabled when shop domain or token missing', () => {
      renderIntegrationsSection({
        shopifyShopDomain: '',
        shopifyAccessToken: 'shpat_test',
      })
      expect(screen.getAllByRole('button', { name: /^Test Connection$/i })[1]).toBeDisabled()
    })

    it('shows "✓ Connected" on successful test', async () => {
      fetchShopifyProducts.mockResolvedValueOnce([])
      renderIntegrationsSection({
        shopifyShopDomain: 'test.myshopify.com',
        shopifyAccessToken: 'shpat_test',
      })
      fireEvent.click(screen.getAllByRole('button', { name: /^Test Connection$/i })[1])
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^✓ Connected/ })).toBeTruthy()
      })
    })

    it('shows error message on failed test', async () => {
      fetchShopifyProducts.mockRejectedValueOnce(new Error('Bad shop domain'))
      renderIntegrationsSection({
        shopifyShopDomain: 'bad.myshopify.com',
        shopifyAccessToken: 'shpat_bad',
      })
      fireEvent.click(screen.getAllByRole('button', { name: /^Test Connection$/i })[1])
      await waitFor(() => {
        expect(screen.getByTestId('shopify-test-error')).toHaveTextContent('Bad shop domain')
      })
    })

    it('shows "✗ Failed" button label on error', async () => {
      fetchShopifyProducts.mockRejectedValueOnce(new Error('fail'))
      renderIntegrationsSection({
        shopifyShopDomain: 'test.myshopify.com',
        shopifyAccessToken: 'shpat_test',
      })
      fireEvent.click(screen.getAllByRole('button', { name: /^Test Connection$/i })[1])
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^✗ Failed/ })).toBeTruthy()
      })
    })
  })
})
