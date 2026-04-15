# Phase 6 — Invoice Lifecycle & Business Settings

**Effort:** ~2-3 days | **Priority:** High | **Depends on:** Phase 0

## Context
Full status state machine, multiple discount lines per invoice, business settings (bank details, VAT, company number) auto-injected into PDF, and "Mark as Fulfilled" workflow.

## Tasks

### 6a. State Machine — `canTransition` Guard
**New export in `src/helpers.js`** (or new file `src/invoiceLifecycle.js`):

```js
const TRANSITIONS = {
  new:       ['pending', 'cancelled'],
  pending:   ['fulfilled', 'cancelled'],
  fulfilled: ['paid', 'cancelled'],
  paid:      ['refunded'],
  refunded:  [],
  cancelled: [],
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to)
}
```

`overdue` is NOT a stored status — it's computed in the UI (Phase 0e).

### 6b. Extend `blankInvoice` in helpers.js
**File:** `src/helpers.js:19-37`

Add to the returned object:
```js
discounts: [],           // [{ id, name, type: 'percent'|'fixed', value }]
fulfillmentMethod: null,  // 'picker' | 'instant' | null
```
Status field already exists as `'new'`.

### 6c. Update `calcTotals` in helpers.js
**File:** `src/helpers.js:39-43`

New signature: `calcTotals(items, taxRate, discounts = [])`

```js
export function calcTotals(items, taxRate, discounts = []) {
  const sub = items.reduce((s, i) => s + (parseFloat(i.qty)||0) * (parseFloat(i.price)||0), 0)
  const discountAmount = discounts.reduce((total, d) => {
    if (d.type === 'percent') return total + (sub * (parseFloat(d.value)||0) / 100)
    if (d.type === 'fixed')   return total + (parseFloat(d.value)||0)
    return total
  }, 0)
  const discountable = Math.max(0, sub - discountAmount)
  const tax = discountable * ((parseFloat(taxRate)||0) / 100)
  return { sub, discountAmount, discountable, tax, total: discountable + tax }
}
```

**Critical:** Update all call sites simultaneously:
- `src/components/InvoiceEditor.jsx:64` — pass `inv.discounts`
- `src/pdf.js:18` — pass `inv.discounts ?? []`
- `src/components/Dashboard.jsx:55-56` — pass `inv.discounts ?? []`
- `src/components/InvoiceList.jsx` — any calcTotals calls

### 6d. Update WORKFLOW in InvoiceEditor.jsx
**File:** `src/components/InvoiceEditor.jsx:19-24`

```js
const WORKFLOW = {
  new:       { label: 'Mark as Sent',      next: 'pending',   danger: false },
  pending:   { label: 'Mark as Fulfilled', next: 'fulfilled', danger: false, showFulfillModal: true },
  fulfilled: { label: 'Payment Received',  next: 'paid',      danger: false },
  paid:      { label: 'Refund',            next: 'refunded',  danger: true  },
}
```

When `showFulfillModal` is true, clicking the button opens a modal:
- **"Go to Picker"** → sets `fulfillmentMethod: 'picker'`, navigates to picker (Phase 8)
- **"Skip"** → sets `fulfillmentMethod: 'instant'`, calls `canTransition` guard, saves with `status: 'fulfilled'`

### 6e. Discount UI in InvoiceEditor.jsx
Below line items, above totals:

- "Add Discount" button
- Each discount row: name input, type toggle (% / fixed), value input, delete button
- Discounts stored in `inv.discounts` (part of draft, persisted to localStorage)
- Totals section: Subtotal → each discount line → Discountable Subtotal → Tax → **Total**

### 6f. Business Settings in Settings.jsx
**File:** `src/components/Settings.jsx`

Add defaults to `settings` in `App.jsx:75-89`:
```js
bankDetails: { accountName: '', bankName: '', accountNumber: '', sortCode: '', iban: '', swift: '' },
taxId: { type: 'vat', number: '' },
companyNumber: '',
```

New Settings sections:
- **"Billing Information"** — bank account fields (accountName, bankName, accountNumber, sortCode, IBAN, SWIFT)
- **"Tax & Compliance"** — VAT/EIN/ABN type selector + number field, company registration number

### 6g. Update PDF Generation
**File:** `src/pdf.js`

- Call `calcTotals(inv.items, inv.tax, inv.discounts ?? [])` 
- Render discount lines in totals section between Subtotal and Total
- Add business footer section:
  - VAT number (if `settings.taxId?.number`)
  - Company number (if `settings.companyNumber`)
  - Bank details block (if `settings.bankDetails?.accountNumber`) — "Payment Details" section

## Risk: calcTotals Return Shape Change
Both `pdf.js` and `InvoiceEditor.jsx` destructure `{ sub, tax, total }`. New fields (`discountAmount`, `discountable`) are additive — existing destructuring still works. But PDF won't show discounts unless updated. **Update all files in the same commit.**

## Files Modified
- `src/helpers.js` — `blankInvoice`, `calcTotals`, new `canTransition`
- `src/components/InvoiceEditor.jsx` — WORKFLOW, discount UI, fulfillment modal
- `src/components/Settings.jsx` — billing/tax/company sections
- `src/pdf.js` — discount lines, business footer
- `src/App.jsx` — settings defaults
- `src/components/Dashboard.jsx` — calcTotals call site
- `src/components/InvoiceList.jsx` — calcTotals call site (if applicable)

## Verification
- Create invoice → add 2 discount lines (one %, one fixed) → totals calculate correctly
- Status workflow: new → Mark as Sent → pending → Mark as Fulfilled → modal appears
- "Skip" in fulfillment modal → status becomes `fulfilled`
- Settings → Billing Information → enter bank details → save
- Generate PDF → bank details + VAT number appear in footer
- Run `npm test` — calcTotals tests pass with discount parameter
