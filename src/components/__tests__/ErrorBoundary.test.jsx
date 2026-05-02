import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary.jsx'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

function Bomb({ shouldThrow }) {
  if (shouldThrow) throw new Error('render crash')
  return <span>ok</span>
}

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText(/render crash/i)).toBeInTheDocument()
  })

  it('displays the error message in the fallback pre block', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    const pre = document.querySelector('pre')
    expect(pre).toBeTruthy()
    expect(pre.textContent).toContain('render crash')
  })

  it('does not render children after catching an error', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('ok')).toBeNull()
  })

  describe('report flow', () => {
    it('shows Report to Developer button and Reload App button in fallback', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>,
      )
      expect(screen.getByRole('button', { name: /Report to Developer/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Reload App/i })).toBeInTheDocument()
    })

    it('shows textarea for user note in fallback', () => {
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>,
      )
      expect(
        screen.getByPlaceholderText(/What were you doing when this happened/i),
      ).toBeInTheDocument()
    })

    it('Report button calls fetch and shows success message on success', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ issueIdentifier: 'SMA-999' }),
        }),
      )
      localStorage.setItem('tab', 'invoices')

      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>,
      )
      fireEvent.click(screen.getByRole('button', { name: /Report to Developer/i }))
      await waitFor(() => {
        expect(screen.getByText(/Report submitted.*SMA-999.*Thank you/)).toBeInTheDocument()
      })
    })

    it('Report button calls fetch and shows failure message on error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error'),
        }),
      )

      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>,
      )
      fireEvent.click(screen.getByRole('button', { name: /Report to Developer/i }))
      await waitFor(() => {
        expect(screen.getByText(/Report failed.*Please try again/)).toBeInTheDocument()
      })
    })

    it('Report button is disabled and shows loading text while reporting', async () => {
      let resolveFetch
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(
          () =>
            new Promise((r) => {
              resolveFetch = r
            }),
        ),
      )

      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>,
      )
      fireEvent.click(screen.getByRole('button', { name: /Report to Developer/i }))
      const btn = screen.getByRole('button', { name: /Sending/ })
      expect(btn).toBeInTheDocument()
      resolveFetch({ ok: true, json: () => Promise.resolve({ issueIdentifier: 'SMA-1' }) })
    })
  })
})
