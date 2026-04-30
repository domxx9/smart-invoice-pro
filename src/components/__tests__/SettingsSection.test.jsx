import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsSection } from '../SettingsSection.jsx'

function renderSection(props = {}) {
  return render(
    <SettingsSection title="My Section" {...props}>
      <p>Panel content</p>
    </SettingsSection>,
  )
}

describe('SettingsSection', () => {
  it('is collapsed by default', () => {
    renderSection()
    expect(screen.queryByText('Panel content')).toBeNull()
  })

  it('expands when header button is clicked', () => {
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: /my section/i }))
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('collapses again on second click', () => {
    renderSection()
    const btn = screen.getByRole('button', { name: /my section/i })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(screen.queryByText('Panel content')).toBeNull()
  })

  it('starts open when defaultOpen=true', () => {
    renderSection({ defaultOpen: true })
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('sets aria-expanded to reflect open state', () => {
    renderSection()
    const btn = screen.getByRole('button', { name: /my section/i })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })

  it('adds data-tour attribute when dataTour prop is provided', () => {
    const { container } = renderSection({ dataTour: 'settings-section' })
    expect(container.querySelector('[data-tour="settings-section"]')).not.toBeNull()
  })

  it('does not add data-tour attribute when dataTour is absent', () => {
    const { container } = renderSection()
    expect(container.querySelector('[data-tour]')).toBeNull()
  })
})
