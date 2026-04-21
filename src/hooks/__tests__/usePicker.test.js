import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePicker } from '../usePicker.js'

const items = [
  { name: 'Widget', qty: 3 },
  { name: 'Gadget', qty: 1 },
  { name: 'Gizmo', qty: 2 },
]

beforeEach(() => {
  localStorage.clear()
})

describe('usePicker', () => {
  it('clamps handlePick to 0..items[idx].qty', () => {
    const { result } = renderHook(() => usePicker(items))

    act(() => result.current.handlePick(0, 2))
    expect(result.current.picks[0]).toBe(2)

    act(() => result.current.handlePick(0, 99))
    expect(result.current.picks[0]).toBe(3)

    act(() => result.current.handlePick(0, -5))
    expect(result.current.picks[0]).toBe(0)

    act(() => result.current.handlePick(1, 1))
    expect(result.current.picks[1]).toBe(1)
  })

  it('derives totalQty, pickedQty, and allDone from items + picks', () => {
    const { result } = renderHook(() => usePicker(items))
    expect(result.current.totalQty).toBe(6)
    expect(result.current.pickedQty).toBe(0)
    expect(result.current.allDone).toBe(false)

    act(() => {
      result.current.handlePick(0, 3)
      result.current.handlePick(1, 1)
      result.current.handlePick(2, 2)
    })
    expect(result.current.pickedQty).toBe(6)
    expect(result.current.allDone).toBe(true)
  })

  it('handleUnavailable toggles flags without touching picks', () => {
    const { result } = renderHook(() => usePicker(items))
    act(() => result.current.handleUnavailable(1, true))
    expect(result.current.unavailable[1]).toBe(true)
    expect(result.current.picks).toEqual({})

    act(() => result.current.handleUnavailable(1, false))
    expect(result.current.unavailable[1]).toBeUndefined()
  })

  it('reset clears picks and unavailable', () => {
    const { result } = renderHook(() =>
      usePicker(items, {
        initialPicks: { 0: 2 },
        initialUnavailable: { 1: true },
      }),
    )
    expect(result.current.picks[0]).toBe(2)
    expect(result.current.unavailable[1]).toBe(true)

    act(() => result.current.reset())
    expect(result.current.picks).toEqual({})
    expect(result.current.unavailable).toEqual({})
  })

  it('writes through to localStorage on every change when persistKey is set', () => {
    const key = 'sip_picks_test_order'
    const { result } = renderHook(() => usePicker(items, { persistKey: key }))

    act(() => result.current.handlePick(0, 2))
    let stored = JSON.parse(localStorage.getItem(key))
    expect(stored.picks).toEqual({ 0: 2 })

    act(() => result.current.handleUnavailable(2, true))
    stored = JSON.parse(localStorage.getItem(key))
    expect(stored.picks).toEqual({ 0: 2 })
    expect(stored.unavailable).toEqual({ 2: true })

    act(() => result.current.handlePick(0, 3))
    stored = JSON.parse(localStorage.getItem(key))
    expect(stored.picks).toEqual({ 0: 3 })
  })

  it('hydrates picks and unavailable from localStorage on remount', () => {
    const key = 'sip_picks_test_resume'
    localStorage.setItem(
      key,
      JSON.stringify({ picks: { 0: 1, 2: 2 }, unavailable: { 1: true } }),
    )

    const { result } = renderHook(() => usePicker(items, { persistKey: key }))
    expect(result.current.picks).toEqual({ 0: 1, 2: 2 })
    expect(result.current.unavailable).toEqual({ 1: true })
    expect(result.current.pickedQty).toBe(3)
  })

  it('ignores corrupt persisted JSON and falls back to initialPicks', () => {
    const key = 'sip_picks_test_corrupt'
    localStorage.setItem(key, '{not json')
    const { result } = renderHook(() =>
      usePicker(items, { persistKey: key, initialPicks: { 0: 1 } }),
    )
    expect(result.current.picks).toEqual({ 0: 1 })
  })

  it('inner picks shape is compatible with sip_picks per-order slot', () => {
    // sip_picks: { [orderId]: { [idx]: qty } }
    // usePicker(picks) -> { [idx]: qty } — matches inner slot exactly.
    const { result } = renderHook(() => usePicker(items))
    act(() => result.current.handlePick(0, 2))
    const sipPicks = { 'order-1': result.current.picks }
    expect(sipPicks['order-1']).toEqual({ 0: 2 })
  })

  it('calls onChange after state changes but not on mount', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      usePicker(items, { initialPicks: { 0: 1 }, onChange }),
    )
    expect(onChange).not.toHaveBeenCalled()

    act(() => result.current.handlePick(0, 2))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      picks: { 0: 2 },
      unavailable: {},
    })
  })
})
