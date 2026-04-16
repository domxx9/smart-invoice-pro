import { useState } from 'react'
import { calcTotals, fmt, searchGroups, groupProducts } from '../helpers.js'
import { Icon } from './Icon.jsx'

export function InvoiceLineItems({ inv, products, setItem, addItem, removeItem, addProduct }) {
  const [search, setSearch] = useState('')
  const { sub, tax, total } = calcTotals(inv.items, inv.tax)
  const filteredGroups = search.trim() ? searchGroups(groupProducts(products), search) : []

  const handleAddProduct = (prod) => {
    addProduct(prod)
    setSearch('')
  }

  return (
    <>
      <div className="field">
        <label>Add from catalog</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
        />
        {filteredGroups.length > 0 && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              marginTop: 4,
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {filteredGroups.map((g, gi) => {
              const single = g.variants.length === 1 && !g.variants[0].name.includes(' — ')
              return (
                <div
                  key={g.name}
                  style={{
                    borderBottom:
                      gi < filteredGroups.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {single && (
                    <div
                      onClick={() => handleAddProduct(g.variants[0])}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '.88rem' }}>{g.name}</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '.85rem' }}>
                        {fmt(g.variants[0].price)}
                      </span>
                    </div>
                  )}
                  {!single && (
                    <>
                      <div
                        style={{
                          padding: '8px 12px 4px',
                          fontSize: '.75rem',
                          color: 'var(--muted)',
                          fontWeight: 600,
                          letterSpacing: 0.3,
                        }}
                      >
                        {g.name}
                      </div>
                      {g.variants.map((v, vi) => {
                        const label = v.name.includes(' — ')
                          ? v.name.split(' — ').slice(1).join(' — ')
                          : v.name
                        return (
                          <div
                            key={v.id}
                            onClick={() => handleAddProduct(v)}
                            style={{
                              padding: '8px 12px 8px 22px',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderTop: vi === 0 ? '1px solid var(--border)' : 'none',
                              background: 'var(--card)',
                            }}
                          >
                            <span style={{ fontSize: '.85rem' }}>{label}</span>
                            <span
                              style={{
                                color: 'var(--accent)',
                                fontWeight: 600,
                                fontSize: '.85rem',
                              }}
                            >
                              {fmt(v.price)}
                            </span>
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        {inv.items.map((item, idx) => (
          <div key={idx} className="line-item">
            <div className="field" style={{ marginBottom: 0 }}>
              {idx === 0 && <label>Description</label>}
              <input
                value={item.desc}
                onChange={(e) => setItem(idx, 'desc', e.target.value)}
                placeholder="Service or product description"
              />
            </div>
            <div className="li-row2">
              <div className="li-qty field" style={{ marginBottom: 0 }}>
                {idx === 0 && <label>Qty</label>}
                <input
                  value={item.qty}
                  onChange={(e) => setItem(idx, 'qty', e.target.value)}
                  type="number"
                  min="1"
                />
              </div>
              <div className="li-price field" style={{ marginBottom: 0 }}>
                {idx === 0 && <label>Unit Price</label>}
                <input
                  value={item.price}
                  onChange={(e) => setItem(idx, 'price', e.target.value)}
                  type="number"
                  min="0"
                  placeholder="0.00"
                />
              </div>
              <div className="li-total">
                {fmt((parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0))}
              </div>
              <div className="li-del">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeItem(idx)}
                  style={{ padding: '6px 8px' }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-ghost btn-sm btn-full mt-8" onClick={addItem}>
        <Icon name="plus" /> Add Line Item
      </button>

      <div className="totals">
        <div className="total-line">
          <span>Subtotal</span>
          <span>{fmt(sub)}</span>
        </div>
        <div className="total-line">
          <span>Tax ({inv.tax}%)</span>
          <span>{fmt(tax)}</span>
        </div>
        <div className="total-line grand">
          <span>Total</span>
          <span>{fmt(total)}</span>
        </div>
      </div>
    </>
  )
}
