import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMenu } from '../useMenu.js'

const backButtonHandlers = []
const removeSpy = vi.fn()
const addListenerSpy = vi.fn(async (event, handler) => {
  if (event === 'backButton') backButtonHandlers.push(handler)
  return { remove: removeSpy }
})

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (event, handler) => addListenerSpy(event, handler),
  },
}))

beforeEach(() => {
  backButtonHandlers.length = 0
  removeSpy.mockClear()
  addListenerSpy.mockClear()
})

describe('useMenu', () => {
  it('starts closed and opens / closes via its actions', () => {
    const { result } = renderHook(() => useMenu())
    expect(result.current.menuOpen).toBe(false)
    act(() => result.current.openMenu())
    expect(result.current.menuOpen).toBe(true)
    act(() => result.current.closeMenu())
    expect(result.current.menuOpen).toBe(false)
  })

  it('toggleMenu flips state', () => {
    const { result } = renderHook(() => useMenu())
    act(() => result.current.toggleMenu())
    expect(result.current.menuOpen).toBe(true)
    act(() => result.current.toggleMenu())
    expect(result.current.menuOpen).toBe(false)
  })

  it('registers a backButton listener only while open and closes the menu on fire', async () => {
    const { result } = renderHook(() => useMenu())
    expect(addListenerSpy).not.toHaveBeenCalled()

    act(() => result.current.openMenu())
    await waitFor(() => expect(backButtonHandlers.length).toBe(1))
    expect(addListenerSpy).toHaveBeenCalledWith('backButton', expect.any(Function))

    act(() => backButtonHandlers[0]())
    expect(result.current.menuOpen).toBe(false)

    await waitFor(() => expect(removeSpy).toHaveBeenCalled())
  })
})
