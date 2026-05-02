import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
