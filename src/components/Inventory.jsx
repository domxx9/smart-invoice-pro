import { useState } from 'react'
import { fmt, searchGroups, groupProducts, timeAgo } from '../helpers.js'
import { Icon } from './Icon.jsx'

export function Inventory({ products, onSync, syncStatus, syncCount, hasApiKey, lastSynced }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(new Set())

  const syncLabel = {
    idle: 'Sync',
    syncing: syncCount > 0 ? `${syncCount} synced…` : 'Syncing…',
    ok: 'Synced ✓',
    error: 'Retry Sync',
  }
  const groups = search.trim()
    ? searchGroups(groupProducts(products), search)
    : groupProducts(products)

  const toggle = (name) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  return (
    <div>
      <div className="flex-between mb-16">
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            Catalog{' '}
            <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '.8rem' }}>
              ({groups.length})
            </span>
          </h2>
          {lastSynced && (
            <p style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>
              Last synced {timeAgo(lastSynced)}
            </p>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onSync}
          disabled={!hasApiKey || syncStatus === 'syncing'}
          title={!hasApiKey ? 'Add Squarespace API key in Settings first' : ''}
        >
          <Icon name="refresh" /> {syncLabel[syncStatus] ?? 'Sync'}
        </button>
      </div>
      {!hasApiKey && (
        <p className="text-muted" style={{ fontSize: '.8rem', marginBottom: 12 }}>
          Add your Squarespace API key in Settings to sync your live catalog.
        </p>
      )}
      {syncStatus === 'error' && (
        <p style={{ color: 'var(--danger)', fontSize: '.8rem', marginBottom: 12 }}>
          Sync failed — check your API key and try again.
        </p>
      )}
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="catalog-search" className="sr-only">
          Search products
        </label>
        <input
          id="catalog-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
        />
      </div>
      {groups.length === 0 && (
        <p className="text-muted" style={{ padding: '20px 0' }}>
          No products found.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups.map((g) => {
          const isOpen = expanded.has(g.name)
          const hasVariants = g.variants.length > 1 || g.variants[0]?.name !== g.name
          const HeaderTag = hasVariants ? 'button' : 'div'
          const headerExtra = hasVariants
            ? {
                type: 'button',
                'aria-expanded': isOpen,
                'aria-label': `${g.name}, ${g.variants.length} variants`,
                onClick: () => toggle(g.name),
              }
            : {}
          return (
            <div key={g.name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <HeaderTag
                {...headerExtra}
                className={hasVariants ? 'catalog-header-btn' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  cursor: hasVariants ? 'pointer' : 'default',
                  width: '100%',
                  ...(hasVariants
                    ? {
                        background: 'none',
                        border: 'none',
                        color: 'inherit',
                        font: 'inherit',
                        textAlign: 'left',
                      }
                    : {}),
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem', marginBottom: 2 }}>
                    {g.name}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '.72rem' }}>
                    {g.category}
                    {hasVariants ? ` · ${g.variants.length} variants` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {!hasVariants && (
                    <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.9rem' }}>
                      {fmt(g.variants[0].price)}
                    </span>
                  )}
                  {hasVariants && (
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{
                        color: 'var(--muted)',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform .2s',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  )}
                </div>
              </HeaderTag>
              {hasVariants && isOpen && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {g.variants.map((v, i) => {
                    const variantLabel = v.name.includes(' — ')
                      ? v.name.split(' — ').slice(1).join(' — ')
                      : v.name
                    return (
                      <div
                        key={v.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px 10px 24px',
                          borderBottom:
                            i < g.variants.length - 1 ? '1px solid var(--border)' : 'none',
                          background: 'var(--surface)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '.85rem' }}>{variantLabel}</div>
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
                            Stock: {v.stock >= 99 ? '∞' : v.stock}
                            {v.stock < 5 && v.stock < 99 ? ' · Low' : ''}
                          </div>
                        </div>
                        <span
                          style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '.9rem' }}
                        >
                          {fmt(v.price)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {!hasVariants && (
                <div
                  style={{
                    padding: '0 14px 10px',
                    fontSize: '.72rem',
                    color: g.variants[0].stock < 5 ? 'var(--danger)' : 'var(--muted)',
                  }}
                >
                  Stock: {g.variants[0].stock >= 99 ? '∞' : g.variants[0].stock}
                  {g.variants[0].stock < 5 ? ' · Low' : ''}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
