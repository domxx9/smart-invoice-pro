# Phase 0 — Codebase Stabilisation

**Effort:** ~4 hours | **Priority:** Critical — prerequisite for all other phases

## Context
The code review found several bugs that will cause other phases to build on broken foundations. Fix these first.

## Tasks

### 0a. Fix `nextId()` — Invoice ID Collision Bug
**File:** `src/helpers.js:13-17`

Replace array-length approach with max-ID scan:
```js
export function nextId(invoices) {
  const pad = parseInt(_invoicePadding) || 4
  const prefix = _invoicePrefix || 'INV'
  const nums = invoices
    .map(inv => parseInt(String(inv.id).replace(prefix, ''), 10))
    .filter(n => !isNaN(n))
  const next = nums.length ? Math.max(...nums) + 1 : 1
  return `${prefix}${String(next).padStart(pad, '0')}`
}
```

### 0b. ~~Add `getBackendInfo` to onnxRuntime.js~~ — SKIPPED
No longer needed. Phase 1 investigation concluded: keep `gemma.js` (which already exports `getBackendInfo`), remove ONNX dead code. See `01-onnx-switch.md` for details.

### 0c. Replace `alert()` with toast in InvoiceEditor
**File:** `src/components/InvoiceEditor.jsx:99`

Replace: `alert(`AI Match Error: ${e?.message || '...'}`)`
With: `onToast?.(`AI match failed: ${e?.message || 'timed out'}`, 'error')`

### 0d. Add COOP/COEP Headers to vercel.json
**File:** `vercel.json` — enables SharedArrayBuffer for ONNX multithreaded WASM on web:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

### 0e. Clarify `overdue` as Computed Status
`overdue` should NOT be a stored status — it should be derived in the UI.

**Files to modify:**
- `src/constants.js:42` — change sample invoice status from `'overdue'` to `'pending'` (keep past due date so it renders as overdue)
- `src/components/InvoiceList.jsx` and `src/components/Dashboard.jsx` — already compute overdue as `pending + past due`. Verify no code stores `'overdue'` as a status value.

### 0f. Delete Dead Files
Remove:
- `src/App.css` — unused Vite template CSS
- `src/components/AiSetupScreen.jsx` — orphaned, never imported
- `src/components/HfTokenGuide.jsx` — orphaned, never imported

## Verification
- Run `npm run build` — no errors
- Run `npm run dev` — app loads, create and delete invoices, verify IDs don't collide
- Check Settings → AI section still renders (getBackendInfo available)
