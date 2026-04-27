import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { PickerList } from '../PickerList.jsx'

const itemsFixture = [
  {
    name: 'Widget',
    qty: 1,
    description: 'A handy widget.',
    images: ['https://cdn.example.com/widget-1.jpg', 'https://cdn.example.com/widget-2.jpg'],
  },
  { name: 'Gadget', qty: 3, description: 'Multi-pack gadget.', images: [] },
  { name: 'Bauble', qty: 2 },
]

function setup(overrides = {}) {
  const onPick = vi.fn()
  const onUnavailable = vi.fn()
  const props = {
    items: itemsFixture,
    picks: {},
    unavailable: {},
    onPick,
    onUnavailable,
    ...overrides,
  }
  const utils = render(<PickerList {...props} />)
  return { ...utils, onPick, onUnavailable }
}

describe('PickerList', () => {
  it('renders an empty state when items is empty', () => {
    render(
      <PickerList
        items={[]}
        picks={{}}
        unavailable={{}}
        onPick={() => {}}
        onUnavailable={() => {}}
      />,
    )
    expect(screen.getByText(/nothing to pick/i)).toBeInTheDocument()
  })

  it('renders one row per item', () => {
    setup()
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('Gadget')).toBeInTheDocument()
    expect(screen.getByText('Bauble')).toBeInTheDocument()
  })

  it('expands a row on tap and collapses on a second tap', () => {
    setup()
    const row = screen.getByTestId('picker-row-0')
    const details = screen.getByTestId('picker-row-0-details')
    const header = within(row).getByRole('button', { name: /toggle details for widget/i })

    expect(details).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(header)
    expect(details).toHaveAttribute('aria-hidden', 'false')
    fireEvent.click(header)
    expect(details).toHaveAttribute('aria-hidden', 'true')
  })

  it('uses native lazy loading on images', () => {
    const { container } = setup()
    fireEvent.click(screen.getByRole('button', { name: /toggle details for widget/i }))
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBeGreaterThan(0)
    for (const img of imgs) {
      expect(img).toHaveAttribute('loading', 'lazy')
    }
  })

  it('renders a checkbox when qty === 1 and toggles pick', () => {
    const { onPick } = setup()
    const btn = screen.getByRole('button', { name: /mark widget as picked/i })
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledWith(0, 1)
  })

  it('renders PickerQuantity when qty > 1 and wires stepper to onPick', () => {
    const { onPick } = setup({ picks: { 1: 1 } })
    const inc = screen.getByRole('button', { name: /increase picked quantity of gadget/i })
    fireEvent.click(inc)
    expect(onPick).toHaveBeenCalledWith(1, 2)
  })

  it('toggles unavailable via the Skip button', () => {
    const { onUnavailable } = setup()
    fireEvent.click(screen.getByRole('button', { name: /mark widget unavailable/i }))
    expect(onUnavailable).toHaveBeenCalledWith(0, true)
  })

  it('reflects unavailable state via aria-pressed and button label', () => {
    setup({ unavailable: { 2: true } })
    const btn = screen.getByRole('button', { name: /mark bauble available/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens ImageCarousel modal when image thumbnail row is tapped', () => {
    const { container } = setup()
    const imageRow = container.querySelector('[data-testid="picker-row-0-images"]')
    expect(imageRow).not.toBeNull()
    fireEvent.click(imageRow)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('Widget')).toBeInTheDocument()
  })

  it('closes ImageCarousel when close button is clicked', () => {
    const { container } = setup()
    fireEvent.click(container.querySelector('[data-testid="picker-row-0-images"]'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(screen.getByLabelText('Close image viewer'))
    expect(dialog).not.toBeInTheDocument()
  })

  it('expands details panel for description-only items (no carousel)', () => {
    const descriptionOnlyItems = [
      { name: 'Gadget', qty: 1, description: 'A great gadget.', images: [] },
    ]
    const { container } = render(
      <PickerList
        items={descriptionOnlyItems}
        picks={{}}
        unavailable={{}}
        onPick={() => {}}
        onUnavailable={() => {}}
      />,
    )
    const row = container.querySelector('[data-testid="picker-row-0"]')
    const header = within(row).getByRole('button', { name: /toggle details for gadget/i })
    expect(header).not.toBeDisabled()
    fireEvent.click(header)
    expect(screen.getByTestId('picker-row-0-details')).toHaveAttribute('aria-hidden', 'false')
  })
})
