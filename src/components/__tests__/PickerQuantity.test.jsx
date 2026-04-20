import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PickerQuantity } from '../PickerQuantity.jsx'

describe('PickerQuantity', () => {
  it('renders picked/ordered', () => {
    render(<PickerQuantity ordered={5} picked={2} onChange={() => {}} />)
    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  it('increments via onChange when + clicked', () => {
    const onChange = vi.fn()
    render(<PickerQuantity ordered={5} picked={2} onChange={onChange} label="Widget" />)
    fireEvent.click(screen.getByRole('button', { name: /Increase picked quantity of Widget/ }))
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('decrements via onChange when − clicked', () => {
    const onChange = vi.fn()
    render(<PickerQuantity ordered={5} picked={3} onChange={onChange} label="Widget" />)
    fireEvent.click(screen.getByRole('button', { name: /Decrease picked quantity of Widget/ }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('clamps at upper bound (ordered)', () => {
    const onChange = vi.fn()
    render(<PickerQuantity ordered={3} picked={3} onChange={onChange} />)
    const inc = screen.getByRole('button', { name: /Increase picked quantity/ })
    expect(inc).toBeDisabled()
    fireEvent.click(inc)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps at lower bound (0)', () => {
    const onChange = vi.fn()
    render(<PickerQuantity ordered={3} picked={0} onChange={onChange} />)
    const dec = screen.getByRole('button', { name: /Decrease picked quantity/ })
    expect(dec).toBeDisabled()
    fireEvent.click(dec)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('coerces out-of-range picked prop into display bounds', () => {
    const { rerender } = render(<PickerQuantity ordered={4} picked={99} onChange={() => {}} />)
    expect(screen.getByText('4/4')).toBeInTheDocument()

    rerender(<PickerQuantity ordered={4} picked={-2} onChange={() => {}} />)
    expect(screen.getByText('0/4')).toBeInTheDocument()
  })
})
