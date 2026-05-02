import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SmartPasteContextSection } from '../SmartPasteContextSection.jsx'

describe('SmartPasteContextSection', () => {
  const defaultProps = {
    settings: { smartPasteContext: {} },
    onChange: () => {},
  }

  it('renders all five field labels', () => {
    render(<SmartPasteContextSection {...defaultProps} />)
    expect(screen.getByText('Product type')).toBeTruthy()
    expect(screen.getByText('Shop type')).toBeTruthy()
    expect(screen.getByText('Customer type')).toBeTruthy()
    expect(screen.getByText('Customer vocabulary')).toBeTruthy()
    expect(screen.getByText('Language / locale')).toBeTruthy()
  })

  it('renders description text', () => {
    render(<SmartPasteContextSection {...defaultProps} />)
    expect(screen.getByText(/Smart Paste prepends these to every AI call/)).toBeTruthy()
  })

  it('renders shop type options', () => {
    render(<SmartPasteContextSection {...defaultProps} />)
    expect(screen.getByText('Brick-and-mortar retail')).toBeTruthy()
    expect(screen.getByText('Online store / e-commerce')).toBeTruthy()
  })

  it('renders customer type options', () => {
    render(<SmartPasteContextSection {...defaultProps} />)
    expect(screen.getByText('Walk-in retail consumers')).toBeTruthy()
    expect(screen.getByText('Trade / B2B contractors')).toBeTruthy()
  })

  it('renders locale options', () => {
    render(<SmartPasteContextSection {...defaultProps} />)
    expect(screen.getByText('English (UK)')).toBeTruthy()
    expect(screen.getByText('Spanish')).toBeTruthy()
  })

  describe('onChange interaction', () => {
    it('calls onChange with updater fn that sets productType', () => {
      const onChange = vi.fn()
      render(<SmartPasteContextSection settings={{ smartPasteContext: {} }} onChange={onChange} />)
      fireEvent.change(screen.getByPlaceholderText(/artisan cheese/i), {
        target: { value: 'vinyl records' },
      })
      expect(onChange).toHaveBeenCalledOnce()
      const updater = onChange.mock.calls[0][0]
      expect(typeof updater).toBe('function')
      const next = updater({ smartPasteContext: { shopType: 'Online store / e-commerce' } })
      expect(next.smartPasteContext.productType).toBe('vinyl records')
      expect(next.smartPasteContext.shopType).toBe('Online store / e-commerce')
    })

    it('calls onChange with updater fn that sets shopType', () => {
      const onChange = vi.fn()
      render(<SmartPasteContextSection settings={{ smartPasteContext: {} }} onChange={onChange} />)
      fireEvent.change(screen.getAllByRole('combobox')[0], {
        target: { value: 'Brick-and-mortar retail' },
      })
      expect(onChange).toHaveBeenCalledOnce()
      const updater = onChange.mock.calls[0][0]
      const next = updater({ smartPasteContext: {} })
      expect(next.smartPasteContext.shopType).toBe('Brick-and-mortar retail')
    })

    it('updater preserves existing smartPasteContext keys', () => {
      const onChange = vi.fn()
      render(
        <SmartPasteContextSection
          settings={{ smartPasteContext: { productType: 'cheese' } }}
          onChange={onChange}
        />,
      )
      fireEvent.change(screen.getAllByRole('combobox')[0], {
        target: { value: 'Online store / e-commerce' },
      })
      const updater = onChange.mock.calls[0][0]
      const next = updater({ smartPasteContext: { productType: 'cheese' } })
      expect(next.smartPasteContext.productType).toBe('cheese')
      expect(next.smartPasteContext.shopType).toBe('Online store / e-commerce')
    })
  })
})
