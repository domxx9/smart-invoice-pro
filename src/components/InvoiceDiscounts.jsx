import { Icon } from './Icon.jsx'

export function InvoiceDiscounts({ discounts, addDiscount, setDiscount, removeDiscount }) {
  const list = Array.isArray(discounts) ? discounts : []
  return (
    <div className="discounts mt-8">
      {list.length > 0 && (
        <div
          style={{
            fontSize: '.72rem',
            color: 'var(--muted)',
            fontWeight: 600,
            letterSpacing: 0.3,
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          Discounts
        </div>
      )}
      {list.map((d, idx) => (
        <div key={d.id || idx} className="line-item">
          <div className="field" style={{ marginBottom: 0 }}>
            <input
              aria-label={`Discount ${idx + 1} name`}
              value={d.name || ''}
              onChange={(e) => setDiscount(idx, 'name', e.target.value)}
              placeholder="Discount name"
            />
          </div>
          <div className="li-row2">
            <div className="li-qty field" style={{ marginBottom: 0 }}>
              <select
                aria-label={`Discount ${idx + 1} type`}
                value={d.type || 'percent'}
                onChange={(e) => setDiscount(idx, 'type', e.target.value)}
              >
                <option value="percent">%</option>
                <option value="fixed">Flat</option>
              </select>
            </div>
            <div className="li-price field" style={{ marginBottom: 0 }}>
              <input
                aria-label={`Discount ${idx + 1} value`}
                value={d.value ?? ''}
                onChange={(e) => setDiscount(idx, 'value', e.target.value)}
                type="number"
                min="0"
                step={d.type === 'fixed' ? '0.01' : '1'}
                placeholder="0"
              />
            </div>
            <div className="li-total" />
            <div className="li-del">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={`Remove discount ${idx + 1}`}
                onClick={() => removeDiscount(idx)}
                style={{ padding: '6px 8px' }}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm btn-full mt-8" onClick={addDiscount}>
        <Icon name="plus" /> Add Discount
      </button>
    </div>
  )
}
