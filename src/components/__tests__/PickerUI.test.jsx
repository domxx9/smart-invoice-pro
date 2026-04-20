import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-swipeable', () => ({ useSwipeable: vi.fn(() => ({})) }))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { Medium: 'MEDIUM' },
}))

import { PickerUI } from '../PickerUI.jsx'

const items = [
  { name: 'Widget', qty: 1 },
  { name: 'Gadget', qty: 3 },
]

function baseProps(overrides = {}) {
  return {
    items,
    picks: {},
    unavailable: {},
    onPick: vi.fn(),
    onUnavailable: vi.fn(),
    onClose: vi.fn(),
    viewMode: 'list',
    ...overrides,
  }
}

describe('PickerUI', () => {
  beforeEach(() => {
    // no-op; each test creates its own spies
  })

  it('defaults to list view and renders PickerList rows', () => {
    render(<PickerUI {...baseProps()} />)
    const root = screen.getByTestId('picker-ui')
    expect(root).toHaveAttribute('data-view-mode', 'list')
    expect(screen.getByTestId('picker-list')).toBeInTheDocument()
    expect(screen.queryByTestId('picker-card-stack')).toBeNull()
  })

  it('routes to PickerCard when viewMode="card"', () => {
    render(<PickerUI {...baseProps({ viewMode: 'card' })} />)
    const root = screen.getByTestId('picker-ui')
    expect(root).toHaveAttribute('data-view-mode', 'card')
    expect(screen.getByTestId('picker-card-stack')).toBeInTheDocument()
    expect(screen.queryByTestId('picker-list')).toBeNull()
  })

  it('unknown viewMode falls back to list', () => {
    render(<PickerUI {...baseProps({ viewMode: 'grid' })} />)
    expect(screen.getByTestId('picker-ui')).toHaveAttribute('data-view-mode', 'list')
    expect(screen.getByTestId('picker-list')).toBeInTheDocument()
  })

  it('renders the shared progress summary from picks', () => {
    render(<PickerUI {...baseProps({ picks: { 0: 1, 1: 2 } })} />)
    expect(screen.getByText(/3 of 4 items picked/i)).toBeInTheDocument()
    expect(screen.queryByText(/all picked/i)).toBeNull()
  })

  it('shows "All picked" when totals match', () => {
    render(<PickerUI {...baseProps({ picks: { 0: 1, 1: 3 } })} />)
    expect(screen.getByText(/4 of 4 items picked/i)).toBeInTheDocument()
    expect(screen.getByText(/all picked/i)).toBeInTheDocument()
  })

  it('fires onClose when Done is pressed', () => {
    const onClose = vi.fn()
    render(<PickerUI {...baseProps({ onClose })} />)
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders header and footer slots', () => {
    render(
      <PickerUI
        {...baseProps()}
        header={<span>Pick #42</span>}
        footer={<button type="button">Commit</button>}
      />,
    )
    expect(screen.getByText('Pick #42')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /commit/i })).toBeInTheDocument()
  })
})
