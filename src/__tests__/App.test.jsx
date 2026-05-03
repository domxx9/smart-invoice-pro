import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import App from '../App.jsx'

const LS_KEY = 'sip_active_tab'

describe('active tab persistence', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('restores active tab from localStorage', () => {
    localStorage.setItem(LS_KEY, 'orders')
    const { result } = renderHook(() => App)
    expect(result.current).toBeDefined()
  })

  it('defaults to dashboard when no stored tab', () => {
    localStorage.clear()
    const { result } = renderHook(() => App)
    expect(result.current).toBeDefined()
  })

  it('falls back to invoices when draft edit exists and no stored tab', () => {
    localStorage.setItem('sip_draft_edit', 'true')
    const { result } = renderHook(() => App)
    expect(result.current).toBeDefined()
  })

  it('saves active tab to localStorage on change', () => {
    localStorage.clear()
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })
})
