import { useCallback, useEffect, useState } from 'react'
import { App as CapApp } from '@capacitor/app'

export function useMenu() {
  const [menuOpen, setMenuOpen] = useState(false)
  const openMenu = useCallback(() => setMenuOpen(true), [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const toggleMenu = useCallback(() => setMenuOpen((o) => !o), [])

  useEffect(() => {
    if (!menuOpen) return undefined
    let handle
    const register = async () => {
      try {
        handle = await CapApp.addListener('backButton', () => {
          setMenuOpen(false)
        })
      } catch {
        handle = null
      }
    }
    register()
    return () => {
      handle?.remove?.()
    }
  }, [menuOpen])

  return { menuOpen, openMenu, closeMenu, toggleMenu }
}
