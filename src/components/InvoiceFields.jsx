export function InvoiceFields({ inv, setField }) {
  return (
    <div className="invoice-meta">
      <div className="field">
        <label>Customer Name</label>
        <input
          value={inv.customer || ''}
          onChange={(e) => setField('customer', e.target.value)}
          placeholder="Jane Smith"
        />
      </div>
      <div className="field">
        <label>Business Name</label>
        <input
          value={inv.customerBusiness || ''}
          onChange={(e) => setField('customerBusiness', e.target.value)}
          placeholder="Acme Corp (optional)"
        />
      </div>
      <div className="field">
        <label>Email</label>
        <input
          value={inv.email || ''}
          onChange={(e) => setField('email', e.target.value)}
          placeholder="billing@acme.com"
          type="email"
        />
      </div>
      <div className="field">
        <label>Address Line 1</label>
        <input
          value={inv.address1 || ''}
          onChange={(e) => setField('address1', e.target.value)}
          placeholder="123 High Street"
        />
      </div>
      <div className="field">
        <label>Address Line 2</label>
        <input
          value={inv.address2 || ''}
          onChange={(e) => setField('address2', e.target.value)}
          placeholder="Suite / Unit (optional)"
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>City</label>
          <input
            value={inv.city || ''}
            onChange={(e) => setField('city', e.target.value)}
            placeholder="London"
          />
        </div>
        <div className="field">
          <label>Postcode / ZIP</label>
          <input
            value={inv.postcode || ''}
            onChange={(e) => setField('postcode', e.target.value)}
            placeholder="SW1A 1AA"
          />
        </div>
      </div>
      <div className="field">
        <label>Country</label>
        <input
          value={inv.country || ''}
          onChange={(e) => setField('country', e.target.value)}
          placeholder="United Kingdom"
        />
      </div>
      <div className="field">
        <label>Invoice Date</label>
        <input value={inv.date} onChange={(e) => setField('date', e.target.value)} type="date" />
      </div>
      <div className="field">
        <label>Due Date</label>
        <input value={inv.due} onChange={(e) => setField('due', e.target.value)} type="date" />
      </div>
      <div className="field">
        <label>Tax %</label>
        <input
          value={inv.tax}
          onChange={(e) => setField('tax', e.target.value)}
          type="number"
          min="0"
          max="100"
        />
      </div>
    </div>
  )
}
