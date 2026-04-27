import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('react-swipeable', () => ({
  useSwipeable: vi.fn(() => ({})),
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { Medium: 'MEDIUM' },
}))

import { useSwipeable } from 'react-swipeable'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { PickerCard } from '../PickerCard.jsx'

function topHandlers() {
  const calls = useSwipeable.mock.calls
  if (calls.length === 0) throw new Error('useSwipeable was not called')
  return calls.at(-1)[0]
}

describe('PickerCard', () => {
  beforeEach(() => {
    useSwipeable.mockClear()
    Haptics.impact.mockClear()
  })

  it('renders the empty state when items is empty', () => {
    render(
      <PickerCard
        items={[]}
        picks={{}}
        unavailable={{}}
        onPick={() => {}}
        onUnavailable={() => {}}
      />,
    )
    expect(screen.getByText(/nothing to pick/i)).toBeInTheDocument()
  })

  it('swipe right calls onPick with item.qty and fires medium haptic once', () => {
    const onPick = vi.fn()
    const onUnavailable = vi.fn()
    render(
      <PickerCard
        items={[{ name: 'Widget', qty: 4 }]}
        picks={{}}
        unavailable={{}}
        onPick={onPick}
        onUnavailable={onUnavailable}
      />,
    )

    act(() => topHandlers().onSwipedRight())

    expect(onPick).toHaveBeenCalledWith(0, 4)
    expect(onUnavailable).not.toHaveBeenCalled()
    expect(Haptics.impact).toHaveBeenCalledTimes(1)
    expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium })
  })

  it('swipe left calls onUnavailable(idx, true) and fires medium haptic once', () => {
    const onPick = vi.fn()
    const onUnavailable = vi.fn()
    render(
      <PickerCard
        items={[{ name: 'Widget', qty: 2 }]}
        picks={{}}
        unavailable={{}}
        onPick={onPick}
        onUnavailable={onUnavailable}
      />,
    )

    act(() => topHandlers().onSwipedLeft())

    expect(onUnavailable).toHaveBeenCalledWith(0, true)
    expect(onPick).not.toHaveBeenCalled()
    expect(Haptics.impact).toHaveBeenCalledTimes(1)
  })

  it('advances to the next item after a swipe', () => {
    const onPick = vi.fn()
    const onUnavailable = vi.fn()
    render(
      <PickerCard
        items={[
          { name: 'Widget', qty: 1 },
          { name: 'Gadget', qty: 2 },
        ]}
        picks={{}}
        unavailable={{}}
        onPick={onPick}
        onUnavailable={onUnavailable}
      />,
    )

    expect(screen.getByText('Widget')).toBeInTheDocument()
    act(() => topHandlers().onSwipedRight())

    act(() => topHandlers().onSwipedLeft())
    expect(onUnavailable).toHaveBeenCalledWith(1, true)
  })

  it('renders the reviewed-all state once every card is cleared', () => {
    render(
      <PickerCard
        items={[{ name: 'Widget', qty: 1 }]}
        picks={{}}
        unavailable={{}}
        onPick={() => {}}
        onUnavailable={() => {}}
      />,
    )

    act(() => topHandlers().onSwipedRight())
    expect(screen.getByText(/all items reviewed/i)).toBeInTheDocument()
  })

  it('renders the first image as a full-width hero when images are present', () => {
    const { container } = render(
      <PickerCard
        items={[
          {
            name: 'Widget',
            qty: 1,
            images: [
              'https://cdn.example.com/hero.jpg',
              'https://cdn.example.com/thumb1.jpg',
              'https://cdn.example.com/thumb2.jpg',
            ],
          },
        ]}
        picks={{}}
        unavailable={{}}
        onPick={() => {}}
        onUnavailable={() => {}}
      />,
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(3)
    expect(imgs[0]).toHaveAttribute('src', 'https://cdn.example.com/hero.jpg')
  })

  it('renders a grey placeholder with camera icon when no images', () => {
    const { container } = render(
      <PickerCard
        items={[{ name: 'Widget', qty: 1 }]}
        picks={{}}
        unavailable={{}}
        onPick={() => {}}
        onUnavailable={() => {}}
      />,
    )
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('renders thumbnails below the hero from slice(1, 4)', () => {
    const { container } = render(
      <PickerCard
        items={[
          {
            name: 'Widget',
            qty: 1,
            images: [
              'https://cdn.example.com/hero.jpg',
              'https://cdn.example.com/t1.jpg',
              'https://cdn.example.com/t2.jpg',
              'https://cdn.example.com/t3.jpg',
            ],
          },
        ]}
        picks={{}}
        unavailable={{}}
        onPick={() => {}}
        onUnavailable={() => {}}
      />,
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBe(4)
    expect(imgs[1]).toHaveAttribute('src', 'https://cdn.example.com/t1.jpg')
    expect(imgs[2]).toHaveAttribute('src', 'https://cdn.example.com/t2.jpg')
    expect(imgs[3]).toHaveAttribute('src', 'https://cdn.example.com/t3.jpg')
  })

  it('renders images with loading="lazy" when provided', () => {
    const { container } = render(
      <PickerCard
        items={[{ name: 'Widget', qty: 1, images: ['https://cdn.example.com/a.jpg'] }]}
        picks={{}}
        unavailable={{}}
        onPick={() => {}}
        onUnavailable={() => {}}
      />,
    )
    const imgs = container.querySelectorAll('img')
    expect(imgs.length).toBeGreaterThan(0)
    expect(imgs[0]).toHaveAttribute('loading', 'lazy')
  })
})
