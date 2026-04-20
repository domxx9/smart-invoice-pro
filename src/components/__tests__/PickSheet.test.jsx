import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.mock('react-swipeable', () => ({ useSwipeable: vi.fn(() => ({})) }))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { Medium: 'MEDIUM' },
}))

import { PickSheet } from '../PickSheet.jsx'
import { SettingsProvider } from '../../contexts/SettingsContext.jsx'

const order = {
  id: 'ord-1',
  orderNumber: '1001',
  customer: 'Alice',
  lineItems: [
    { name: 'Widget', qty: 1, price: 10 },
    { name: 'Gadget', qty: 2, price: 5 },
  ],
}

function renderWith(overrides = {}, { pickerViewMode = 'list' } = {}) {
  localStorage.setItem('sip_settings', JSON.stringify({ pickerViewMode }))
  const onPickChange = vi.fn()
  const onClose = vi.fn()
  const props = {
    order,
    picks: { 'ord-1': {} },
    onPickChange,
    onClose,
    ...overrides,
  }
  const utils = render(
    <SettingsProvider>
      <PickSheet {...props} />
    </SettingsProvider>,
  )
  return { ...utils, onPickChange, onClose }
}

beforeEach(() => {
  localStorage.clear()
})

describe('PickSheet (thin wrapper over PickerUI)', () => {
  it('preserves the existing {order, picks, onPickChange, onClose} props and renders the header', () => {
    renderWith()
    expect(screen.getByText('Pick #1001')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByTestId('picker-ui')).toBeInTheDocument()
  })

  it('defaults to list view when settings.pickerViewMode is missing', () => {
    renderWith({}, { pickerViewMode: undefined })
    expect(screen.getByTestId('picker-ui')).toHaveAttribute('data-view-mode', 'list')
    expect(screen.getByTestId('picker-list')).toBeInTheDocument()
  })

  it('honours settings.pickerViewMode="card"', () => {
    renderWith({}, { pickerViewMode: 'card' })
    expect(screen.getByTestId('picker-ui')).toHaveAttribute('data-view-mode', 'card')
    expect(screen.getByTestId('picker-card-stack')).toBeInTheDocument()
  })

  it('checkbox tap forwards (order.id, idx, qty) to onPickChange', () => {
    const { onPickChange } = renderWith()
    const row = screen.getByTestId('picker-row-0')
    fireEvent.click(within(row).getByRole('button', { name: /mark widget as picked/i }))
    expect(onPickChange).toHaveBeenCalledWith('ord-1', 0, 1)
  })

  it('reads initial picks from picks[order.id]', () => {
    renderWith({ picks: { 'ord-1': { 1: 2 } } })
    expect(screen.getByText(/2 of 3 items picked/i)).toBeInTheDocument()
  })

  it('fires onClose from the Done button', () => {
    const { onClose } = renderWith()
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
