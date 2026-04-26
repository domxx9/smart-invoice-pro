import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { PullToRefresh } from '../components/PullToRefresh.jsx'

describe('<PullToRefresh />', () => {
  it('fires onRefresh with the latest reference after re-render', async () => {
    let refreshFn = vi.fn()

    const { rerender } = render(
      <PullToRefresh onRefresh={refreshFn} enabled={true}>
        <div>content</div>
      </PullToRefresh>,
    )

    await act(async () => {
      fireEvent.touchStart(document, { touches: [{ clientY: 0 }] })
      fireEvent.touchMove(document, { touches: [{ clientY: 120 }] })
      fireEvent.touchEnd(document, { changedTouches: [{ clientY: 120 }] })
    })

    expect(refreshFn).toHaveBeenCalledTimes(1)

    refreshFn = vi.fn()
    rerender(
      <PullToRefresh onRefresh={refreshFn} enabled={true}>
        <div>content</div>
      </PullToRefresh>,
    )

    await act(async () => {
      fireEvent.touchStart(document, { touches: [{ clientY: 0 }] })
      fireEvent.touchMove(document, { touches: [{ clientY: 120 }] })
      fireEvent.touchEnd(document, { changedTouches: [{ clientY: 120 }] })
    })

    expect(refreshFn).toHaveBeenCalledTimes(1)
  })

  it('does not re-register listeners when onRefresh changes (stable deps)', async () => {
    const addEventListener = vi.spyOn(document, 'addEventListener')
    const removeEventListener = vi.spyOn(document, 'removeEventListener')

    let refreshFn = vi.fn()
    const { rerender } = render(
      <PullToRefresh onRefresh={refreshFn} enabled={true}>
        <div>content</div>
      </PullToRefresh>,
    )

    addEventListener.mockClear()
    removeEventListener.mockClear()

    refreshFn = vi.fn()
    rerender(
      <PullToRefresh onRefresh={refreshFn} enabled={true}>
        <div>content</div>
      </PullToRefresh>,
    )

    expect(removeEventListener).not.toHaveBeenCalled()
    expect(addEventListener).not.toHaveBeenCalled()
  })

  it('renders children', () => {
    render(
      <PullToRefresh onRefresh={vi.fn()} enabled={true}>
        <div data-testid="child">Hello</div>
      </PullToRefresh>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('does nothing when enabled is false', async () => {
    const refreshFn = vi.fn()
    render(
      <PullToRefresh onRefresh={refreshFn} enabled={false}>
        <div>content</div>
      </PullToRefresh>,
    )

    await act(async () => {
      fireEvent.touchStart(document, { touches: [{ clientY: 0 }] })
      fireEvent.touchMove(document, { touches: [{ clientY: 120 }] })
      fireEvent.touchEnd(document, { changedTouches: [{ clientY: 120 }] })
    })

    expect(refreshFn).not.toHaveBeenCalled()
  })
})
