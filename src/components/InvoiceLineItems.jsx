import { useState } from 'react'
import { calcTotals, fmt, searchGroups, groupProducts } from '../helpers.js'
import { Icon } from './Icon.jsx'
import { InvoiceDiscounts } from './InvoiceDiscounts.jsx'

export function InvoiceLineItems({
  inv,
  products,
  setItem,
  addItem,
  removeItem,
  addProduct,
  addDiscount = () => {},
  setDiscount = () => {},
  removeDiscount = () => {},
}) {
  const [search, setSearch] = useState('')
  const { sub, discountLines, discountTotal, tax, total } = calcTotals(
    inv.items,
    inv.tax,
    inv.discounts,
  )
  const filteredGroups = search.trim() ? searchGroups(groupProducts(products), search) : []

  const handleAddProduct = (prod) => {
    addProduct(prod)
    setSearch('')
  }

  return (
    <>
      <div className="field">
        <label>
          Add from catalog
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
          />
        </label>
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
                    <button
                      type="button"
                      className="catalog-pick-btn"
                      onClick={() => handleAddProduct(g.variants[0])}
                      aria-label={`Add ${g.name} for ${fmt(g.variants[0].price)}`}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        color: 'inherit',
                        font: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: '.88rem' }}>{g.name}</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '.85rem' }}>
                        {fmt(g.variants[0].price)}
                      </span>
                    </button>
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
                          <button
                            key={v.id}
                            type="button"
                            className="catalog-pick-btn"
                            onClick={() => handleAddProduct(v)}
                            aria-label={`Add ${g.name} — ${label} for ${fmt(v.price)}`}
                            style={{
                              padding: '8px 12px 8px 22px',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              borderTop: vi === 0 ? '1px solid var(--border)' : 'none',
                              borderLeft: 'none',
                              borderRight: 'none',
                              borderBottom: 'none',
                              background: 'var(--card)',
                              width: '100%',
                              color: 'inherit',
                              font: 'inherit',
                              textAlign: 'left',
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
                          </button>
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
              {idx === 0 ? (
                <label>
                  Description
                  <input
                    value={item.desc}
                    onChange={(e) => setItem(idx, 'desc', e.target.value)}
                    placeholder="Service or product description"
                  />
                </label>
              ) : (
                <input
                  aria-label={`Item ${idx + 1} description`}
                  value={item.desc}
                  onChange={(e) => setItem(idx, 'desc', e.target.value)}
                  placeholder="Service or product description"
                />
              )}
            </div>
            <div className="li-row2">
              <div className="li-qty field" style={{ marginBottom: 0 }}>
                {idx === 0 ? (
                  <label>
                    Qty
                    <input
                      value={item.qty}
                      onChange={(e) => setItem(idx, 'qty', e.target.value)}
                      type="number"
                      min="1"
                    />
                  </label>
                ) : (
                  <input
                    aria-label={`Item ${idx + 1} quantity`}
                    value={item.qty}
                    onChange={(e) => setItem(idx, 'qty', e.target.value)}
                    type="number"
                    min="1"
                  />
                )}
              </div>
              <div className="li-price field" style={{ marginBottom: 0 }}>
                {idx === 0 ? (
                  <label>
                    Unit Price
                    <input
                      value={item.price}
                      onChange={(e) => setItem(idx, 'price', e.target.value)}
                      type="number"
                      min="0"
                      placeholder="0.00"
                    />
                  </label>
                ) : (
                  <input
                    aria-label={`Item ${idx + 1} unit price`}
                    value={item.price}
                    onChange={(e) => setItem(idx, 'price', e.target.value)}
                    type="number"
                    min="0"
                    placeholder="0.00"
                  />
                )}
              </div>
              <div className="li-total">
                {fmt((parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0))}
              </div>
              <div className="li-del">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={`Remove item ${idx + 1}`}
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

      <button type="button" className="btn btn-ghost btn-sm btn-full mt-8" onClick={addItem}>
        <Icon name="plus" /> Add Line Item
      </button>

      <InvoiceDiscounts
        discounts={inv.discounts}
        addDiscount={addDiscount}
        setDiscount={setDiscount}
        removeDiscount={removeDiscount}
      />

      <div className="totals">
        <div className="total-line">
          <span>Subtotal</span>
          <span>{fmt(sub)}</span>
        </div>
        {discountLines.map((d, i) => (
          <div key={i} className="total-line" data-testid="discount-line">
            <span>{d.name || (d.type === 'percent' ? `Discount (${d.value}%)` : 'Discount')}</span>
            <span>-{fmt(d.amount)}</span>
          </div>
        ))}
        {discountTotal > 0 && discountLines.length > 1 && (
          <div className="total-line" style={{ color: 'var(--muted)' }}>
            <span>Total discounts</span>
            <span>-{fmt(discountTotal)}</span>
          </div>
        )}
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
