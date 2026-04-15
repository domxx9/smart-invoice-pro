# Code Review Findings

## Critical Bugs

### 1. Invoice ID Collision on Deletion
**File:** `src/helpers.js:14`
`nextId()` uses `invoices.length + 1`. If an invoice is deleted, the next ID collides with an existing one. Must scan for max existing numeric suffix instead.

### 2. Dual AI Runtime Confusion
**Files:** `src/gemma.js`, `src/onnxRuntime.js`, `src/workers/onnxWorker.js`
Two parallel AI implementations exist. App.jsx and InvoiceEditor.jsx both import from `gemma.js`. The ONNX worker path (`onnxRuntime.js` + `onnxWorker.js`) is fully built but never wired in. Which runtime actually runs is unclear.

### 3. `getBackendInfo` Missing from onnxRuntime.js
`Settings.jsx` imports `getBackendInfo` from `gemma.js`. `onnxRuntime.js` does NOT export it. Switching Settings to import from onnxRuntime will crash at runtime.

### 4. `hasWebGPU()` Hardcoded to `true`
**File:** `src/onnxRuntime.js:157`
Always returns `true` — bypasses actual WebGPU detection.

### 5. Blocking AI Loop in Smart Paste
**File:** `src/components/InvoiceEditor.jsx:86-96`
`runParse` uses `await matchWithGemma()` inside a sequential `for` loop. 8 unmatched items = 8 serial inference calls. User is completely blocked.

### 6. `alert()` Used for AI Errors
**File:** `src/components/InvoiceEditor.jsx:99`
Only use of `alert()` in the codebase. Should use the existing `onToast` prop.

### 7. `overdue` Status Gap
`overdue` exists in sample data (`constants.js:42`) and UI filtering (`Dashboard.jsx`, `InvoiceList.jsx`) but is NOT in the WORKFLOW state machine (`InvoiceEditor.jsx:19-24`). Overdue invoices have no workflow action button.

### 8. `@huggingface/transformers` Missing from package.json
`onnxWorker.js` dynamically imports it at runtime. It's not in `package.json` dependencies. The ONNX path would fail to install properly.

## High-Priority Issues

### 9. Draft Saves on Every Keystroke
**File:** `src/components/InvoiceEditor.jsx:59-62`
`useEffect` triggers `localStorage.setItem(JSON.stringify(inv))` on every state change. Needs debouncing (~500ms).

### 10. Unguarded localStorage JSON.parse
**File:** `src/App.jsx:38-90`
Multiple `useState` initializers call `JSON.parse(localStorage.getItem(...))` without try/catch. Corrupted storage crashes the app on startup with no recovery.

### 11. `sharePDF` Errors Silently Dropped
**File:** `src/components/InvoiceEditor.jsx:532`
No try/catch around `await sharePDF()`. If sharing fails, error is swallowed by browser. User gets false-positive success toast on line 532.

### 12. `cancelDownload` is Non-Functional
**File:** `src/onnxRuntime.js:188-190`
Creates an `AbortController` but the signal is never passed to the worker's fetch. Cancellation does nothing.

### 13. BYOK Feature is a Complete Stub
**File:** `src/components/Settings.jsx:322-323`
UI lets users enter API keys for OpenRouter/Gemini/OpenAI/Anthropic. Keys are saved to localStorage. But no code anywhere reads these keys or makes API calls. `byokStatus` state in App.jsx is never updated.

### 14. Swallowed catch Blocks
**File:** `src/App.jsx:258-260, 292-294`
`handleSyncCatalog` and `handleSyncOrders` catch blocks discard the error object entirely. User sees "Retry" but no indication of what failed.

## Security Concerns

### 15. Unauthenticated Vercel Proxy
**File:** `vercel.json`
The `/api/sqsp/:path*` rewrite blindly forwards to Squarespace API. No rate limiting, no auth on the proxy. Anyone who knows the Vercel URL can use it as an open proxy.

### 16. API Keys in Plaintext localStorage
Squarespace API key, BYOK provider keys, and HuggingFace token all stored unencrypted in localStorage. Readable by any JS on the page origin.

### 17. Logo Base64 in localStorage
**File:** `src/components/PdfTemplateEditor.jsx:18`
Large logo images stored as base64 data URLs inside the settings JSON. Can hit the 5-10 MB localStorage quota silently.

## Performance Issues

### 18. CSS Re-parsed Every Render
**File:** `src/App.jsx:378,395`
`<style>{CSS}</style>` re-renders the entire stylesheet on every state update.

### 19. `groupProducts`/`searchGroups` Not Memoized
**File:** `src/components/InvoiceEditor.jsx:66`
Rebuilds product grouping on every render. Should use `useMemo`.

### 20. Dual Draft localStorage Write
**Files:** `App.jsx:189`, `InvoiceEditor.jsx:60`
Both write `sip_draft_edit` independently on every change. Redundant.

## Dead Code

- `src/App.css` — leftover Vite template CSS, not imported anywhere
- `src/components/AiSetupScreen.jsx` — orphaned, never rendered
- `src/components/HfTokenGuide.jsx` — orphaned, never rendered

## Missing Infrastructure

- Zero test files, no test runner, no testing libraries
- No CLAUDE.md
- No COOP/COEP headers in `vercel.json` (needed for SharedArrayBuffer/ONNX threading on web)
- `vite.config.js` missing `worker: { format: 'es' }` (needed for ES module workers)
