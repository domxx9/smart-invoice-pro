import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BurgerMenu } from '../BurgerMenu.jsx'

const ITEMS = [
  { id: 'inventory', label: 'Catalog', icon: 'inventory' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

describe('BurgerMenu', () => {
  it('marks the active item with aria-current', () => {
    render(
      <BurgerMenu open items={ITEMS} activeId="settings" onClose={vi.fn()} onSelect={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /settings/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: /catalog/i })).not.toHaveAttribute('aria-current')
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <BurgerMenu open items={ITEMS} activeId="inventory" onClose={onClose} onSelect={vi.fn()} />,
    )
    const [backdrop] = screen.getAllByRole('button', { name: /close menu/i })
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('invokes onSelect then onClose when an item is picked', () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()
    render(
      <BurgerMenu open items={ITEMS} activeId="inventory" onClose={onClose} onSelect={onSelect} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(onSelect).toHaveBeenCalledWith('settings')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape while open', () => {
    const onClose = vi.fn()
    render(
      <BurgerMenu open items={ITEMS} activeId="inventory" onClose={onClose} onSelect={vi.fn()} />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not react to Escape when closed', () => {
    const onClose = vi.fn()
    render(
      <BurgerMenu
        open={false}
        items={ITEMS}
        activeId="inventory"
        onClose={onClose}
        onSelect={vi.fn()}
      />,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('toggles the root `open` class based on the prop', () => {
    const { rerender, container } = render(
      <BurgerMenu
        open={false}
        items={ITEMS}
        activeId="inventory"
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(container.querySelector('.burger-root')).not.toHaveClass('open')
    rerender(
      <BurgerMenu
        open
        items={ITEMS}
        activeId="inventory"
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )
    expect(container.querySelector('.burger-root')).toHaveClass('open')
  })
})
