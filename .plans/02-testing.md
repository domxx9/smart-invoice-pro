# Phase 2 — Testing Pipeline

**Effort:** ~3-5 days | **Priority:** Critical | **Depends on:** Phase 0, Phase 1

## Context
Zero test files exist. The `.documentation/todo.md` lists this as the single highest priority task. Tests must cover: Smart Paste, AI inference, PDF export, invoice lifecycle, Squarespace sync.

## Framework Selection

- **Vitest** — native Vite integration, ESM support, same config
- **@testing-library/react** + **@testing-library/user-event** — component tests
- **@testing-library/jest-dom** — DOM matchers
- **jsdom** — browser environment for Vitest
- **msw** (Mock Service Worker) — mock Squarespace API
- **Playwright** — E2E tests (optional, add later)

## Tasks

### 2a. Install and Configure

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom msw
```

Add to `vite.config.js`:
```js
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.js'],
}
```

Add to `package.json` scripts:
```json
"test": "vitest",
"test:ui": "vitest --ui",
"test:run": "vitest run"
```

Create `src/test/setup.js`:
```js
import '@testing-library/jest-dom'
```

### 2b. Test Directory Structure

```
src/test/
  setup.js
  helpers/
    helpers.test.js
    smartPaste.test.js
  ai/
    onnxRuntime.test.js
  pdf/
    pdf.test.js
  components/
    InvoiceEditor.test.jsx
    Dashboard.test.jsx
  api/
    squarespace.test.js
  lifecycle/
    invoiceLifecycle.test.js
```

### 2c. Unit Tests — helpers.test.js (highest value)

**`nextId`:**
- Empty array → `INV0001`
- 3 invoices → `INV0004`
- Deleted middle invoice (gap) → still increments from max
- Custom prefix/padding

**`calcTotals`:**
- Zero items → `{ sub: 0, tax: 0, total: 0 }`
- Normal items + 20% tax
- Zero tax rate
- Empty string prices (defensive parsing)

**`extractItems`:**
- `"2x Blue Extractor"` → `[{ name: 'Blue Extractor', qty: 2 }]`
- `"Blue Extractor x2"` → same
- `"5 Sterilisation Cassettes"` → `[{ name: 'Sterilisation Cassettes', qty: 5 }]`
- WhatsApp timestamps stripped
- Greetings filtered out
- Combined comma-separated items

**`matchItems`:**
- Exact name match → confidence >= 80
- Close match → 30-79 (bestGuess)
- Unrelated name → confidence < 30

**`getTopCandidates`:**
- Returns sorted by confidence
- Returns max N items
- Filters below threshold

### 2d. Unit Tests — smartPaste.test.js

Full pipeline regression test:
- Realistic WhatsApp message → extractItems → matchItems → verify output
- Verify red items (no_match) are present in results
- Verify AI not called when all items >= 65% confidence

### 2e. Unit Tests — onnxRuntime.test.js

Mock `Worker` class:
- `downloadModel()` sends `LOAD` message to worker
- `LOAD_PROGRESS` callbacks reach `onProgress`
- Timeout fires after configured ms → rejects promise
- Worker `onerror` rejects all pending tasks and resets state

### 2f. Unit Tests — pdf.test.js

- `buildInvoicePDF` returns a jsPDF instance (doesn't throw)
- Invoice ID appears in page content
- 30+ line items → 2 pages
- `getPDFFilename` format is stable

### 2g. Unit Tests — squarespace.test.js (with msw)

- Mock 2-page pagination → all products returned
- Variant expansion: 1 product with 3 variants → 3 entries
- Network error → meaningful error message

### 2h. Component Tests — InvoiceEditor.test.jsx

- Smart Paste textarea visible by default
- After "Parse & Match" → results appear
- Workflow button label changes with status
- Delete confirmation modal works

### 2i. Component Tests — Dashboard.test.jsx

- Revenue calculation renders correctly
- Outstanding balance shown
- Recent invoices listed

### 2j. Invoice Lifecycle Tests

Test the `canTransition` guard (created in Phase 6, but test file structure set up here):
- `new → pending` ✓
- `new → paid` ✗
- `paid → refunded` ✓
- `cancelled → anything` ✗

## Verification
- `npm test` passes all tests
- `npm run test:run` exits 0 (CI-ready)
