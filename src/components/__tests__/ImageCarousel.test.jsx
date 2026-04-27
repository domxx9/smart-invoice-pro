import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-swipeable', () => ({
  useSwipeable: vi.fn(() => ({})),
}))

import { ImageCarousel } from '../ImageCarousel.jsx'

const images = [
  'https://cdn.example.com/1.jpg',
  'https://cdn.example.com/2.jpg',
  'https://cdn.example.com/3.jpg',
]

describe('ImageCarousel', () => {
  it('renders a modal dialog with correct aria attributes', () => {
    render(<ImageCarousel images={images} name="Widget" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Images for Widget')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('displays the item name and initial index (1 / 3)', () => {
    render(<ImageCarousel images={images} name="Widget" onClose={() => {}} />)
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('renders the first image initially', () => {
    render(<ImageCarousel images={images} name="Widget" onClose={() => {}} />)
    const img = screen.getByAltText('Widget 1')
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/1.jpg')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<ImageCarousel images={images} name="Widget" onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close image viewer'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows placeholder when images array is empty', () => {
    render(<ImageCarousel images={[]} name="Widget" onClose={() => {}} />)
    expect(screen.getByText('No images')).toBeInTheDocument()
    expect(screen.getByLabelText('Close image viewer')).toBeInTheDocument()
  })
})
