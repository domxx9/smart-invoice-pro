import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Onboarding } from '../Onboarding.jsx'

vi.mock('../../api/shopify.js', () => ({
  fetchShopifyProducts: vi
    .fn()
    .mockResolvedValue([{ id: 'v1', name: 'Widget', price: 9.99, stock: 10 }]),
}))
vi.mock('../../api/squarespace.js', () => ({
  fetchSquarespaceProducts: vi.fn().mockResolvedValue([]),
}))

import { fetchShopifyProducts } from '../../api/shopify.js'
import { fetchSquarespaceProducts } from '../../api/squarespace.js'

beforeEach(() => {
  fetchShopifyProducts.mockClear()
  fetchSquarespaceProducts.mockClear()
})

describe('Onboarding — provider pick routes to Shopify fields', () => {
  it('lets the user pick Shopify and advances to Shopify credential fields', () => {
    render(<Onboarding onConnect={vi.fn()} onDemo={vi.fn()} />)

    // Provider-pick phase renders both options as radio buttons.
    expect(screen.getByRole('radio', { name: /Squarespace/i })).toBeInTheDocument()
    const shopifyRadio = screen.getByRole('radio', { name: /Shopify/i })
    fireEvent.click(shopifyRadio)
    expect(shopifyRadio).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))

    // Key phase now shows Shopify-specific fields.
    expect(screen.getByLabelText(/Shop Domain/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Admin API Access Token/i)).toBeInTheDocument()
    // And not the Squarespace one.
    expect(screen.queryByLabelText(/Squarespace API Key/i)).not.toBeInTheDocument()
  })

  it('calls fetchShopifyProducts and advances on successful connect', async () => {
    render(<Onboarding onConnect={vi.fn()} onDemo={vi.fn()} />)

    fireEvent.click(screen.getByRole('radio', { name: /Shopify/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))

    fireEvent.change(screen.getByLabelText(/Shop Domain/i), {
      target: { value: 'acme.myshopify.com' },
    })
    fireEvent.change(screen.getByLabelText(/Admin API Access Token/i), {
      target: { value: 'shpat_test' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect Store/i }))

    await waitFor(() => {
      expect(fetchShopifyProducts).toHaveBeenCalled()
    })
    // After a successful connect, the UI transitions to the business-details phase.
    await waitFor(() => expect(screen.getByText(/Store connected!/i)).toBeInTheDocument())
    expect(fetchSquarespaceProducts).not.toHaveBeenCalled()
  })

  it('back button returns the user to the provider-pick phase', () => {
    render(<Onboarding onConnect={vi.fn()} onDemo={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: /Shopify/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /Change provider/i }))
    expect(screen.getByRole('radio', { name: /Squarespace/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Admin API Access Token/i)).not.toBeInTheDocument()
  })

  it('passes shopify credentials and provider to onConnect when user finishes', async () => {
    const onConnect = vi.fn()
    render(<Onboarding onConnect={onConnect} onDemo={vi.fn()} />)

    fireEvent.click(screen.getByRole('radio', { name: /Shopify/i }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    fireEvent.change(screen.getByLabelText(/Shop Domain/i), {
      target: { value: 'acme.myshopify.com' },
    })
    fireEvent.change(screen.getByLabelText(/Admin API Access Token/i), {
      target: { value: 'shpat_test' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect Store/i }))

    await waitFor(() => expect(screen.getByText(/Store connected!/i)).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/Acme Services/i), {
      target: { value: 'Acme Inc' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }))
    fireEvent.click(screen.getByRole('button', { name: /Skip, go to app/i }))

    expect(onConnect).toHaveBeenCalled()
    const [creds, products, biz] = onConnect.mock.calls[0]
    expect(creds).toMatchObject({
      provider: 'shopify',
      shopDomain: 'acme.myshopify.com',
      accessToken: 'shpat_test',
    })
    expect(products).toHaveLength(1)
    expect(biz.businessName).toBe('Acme Inc')
  })
})
