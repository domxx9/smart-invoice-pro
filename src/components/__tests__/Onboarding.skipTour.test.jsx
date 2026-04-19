import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Onboarding } from '../Onboarding.jsx'

vi.mock('../../api/shopify.js', () => ({
  fetchShopifyProducts: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../api/squarespace.js', () => ({
  fetchSquarespaceProducts: vi.fn().mockResolvedValue([]),
}))

import { fetchSquarespaceProducts } from '../../api/squarespace.js'

beforeEach(() => {
  fetchSquarespaceProducts.mockClear()
})

async function walkToReadyPhase({ onConnect }) {
  render(<Onboarding onConnect={onConnect} onDemo={vi.fn()} />)
  fireEvent.click(screen.getByRole('radio', { name: /Squarespace/i }))
  fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
  fireEvent.change(screen.getByLabelText(/Squarespace API Key/i), {
    target: { value: 'sq-test-key' },
  })
  fireEvent.click(screen.getByRole('button', { name: /Connect Store/i }))
  await waitFor(() => expect(screen.getByText(/Store connected!/i)).toBeInTheDocument())
  fireEvent.change(screen.getByPlaceholderText(/Acme Services/i), {
    target: { value: 'Acme Inc' },
  })
  fireEvent.click(screen.getByRole('button', { name: /Save & Continue/i }))
  await waitFor(() => expect(screen.getByText(/All set up!/i)).toBeInTheDocument())
}

describe('Onboarding — ready phase skipTour flag (SMA-95)', () => {
  it('passes startTour=false to onConnect when the user clicks "Skip, go to app"', async () => {
    const onConnect = vi.fn()
    await walkToReadyPhase({ onConnect })

    fireEvent.click(screen.getByRole('button', { name: /Skip, go to app/i }))

    expect(onConnect).toHaveBeenCalledTimes(1)
    const [, , , startTour] = onConnect.mock.calls[0]
    expect(startTour).toBe(false)
  })

  it('passes startTour=true to onConnect when the user clicks "Start Tour"', async () => {
    const onConnect = vi.fn()
    await walkToReadyPhase({ onConnect })

    fireEvent.click(screen.getByRole('button', { name: /Start Tour/i }))

    expect(onConnect).toHaveBeenCalledTimes(1)
    const [, , , startTour] = onConnect.mock.calls[0]
    expect(startTour).toBe(true)
  })
})
