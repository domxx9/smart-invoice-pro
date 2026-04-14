# Smart Invoice Pro — Implementation Plan
Generated: 2026-04-14

---

## Overview

This plan covers all open items from `todo.md`, informed by targeted research across six areas. Work is organised into **phases** ordered by dependency and risk. Each phase includes concrete library choices, file paths, and architectural decisions.

**Current state:** ~30% complete. Core invoice/orders UI exists. ONNX migration done locally but not pushed. Sync, Contacts, Picker, and Burger Menu are unbuilt.

---

## Phase Order

| Phase | Area | Effort | Priority |
|-------|------|--------|----------|
| 1 | ONNX Web Worker (threading fix) | ~1.5 days | Critical — blocks AI UX |
| 2 | AI Pipeline & Regex Parser | ~2 days | High — core smart paste |
| 3 | Navigation — Burger Menu + Contacts Tab | ~1 day | High — structural change |
| 4 | Contacts CRUD | ~1.5 days | High — invoice dependency |
| 5 | Invoice Lifecycle & Business Settings | ~2 days | High — core feature |
| 6 | Sync — Squarespace Background Sync | ~2 days | Medium |
| 7 | Picker | ~2 days | Medium |

---

## Phase 1 — ONNX Web Worker (Threading Fixes)

### Problem
Model loading and inference block the entire JS event loop. UI freezes for 8–15s on load and 2–5s per inference call. The main thread must be freed.

### Solution: Move all ONNX operations to a dedicated Web Worker

#### New Files

**`src/workers/onnxWorker.js`** — runs in separate OS thread
- Dynamically imports `@huggingface/transformers`
- Sets WASM paths: `env.backends.onnx.wasm.wasmPaths = '/'`
- Handles messages: `LOAD`, `INFER`, `UNLOAD`
- Emits: `LOAD_PROGRESS`, `LOAD_DONE`, `INFER_TOKEN`, `INFER_DONE`, `ERROR`
- Task IDs (e.g. `task_1`) correlate streaming responses to callers

**`src/onnxRuntime.js`** — drop-in replacement for `src/gemma.js`
- Creates worker once on first use, reuses across app lifetime
- Wraps all worker comms in Promises
- Maintains `Map<taskId, callbacks>` for routing streamed tokens
- Exports same API as `gemma.js`: `downloadModel`, `initModel`, `generate`, `matchWithGemma`, `cleanOrderText`

#### Message Protocol
```
LOAD      →  LOAD_PROGRESS (0–1)…  →  LOAD_DONE
INFER     →  INFER_TOKEN…          →  INFER_DONE
UNLOAD    →  UNLOAD_DONE
ERROR     (any stage, with optional taskId)
```

#### Vite Config Change (`vite.config.js`)
```js
worker: {
  format: 'es',   // ES modules in workers required
}
```
WASM files in `public/` are already present and served from `/` — worker resolves them at origin root.

#### Modified Files
- `src/App.jsx` — change `import … from './gemma.js'` → `'./onnxRuntime.js'` (1 line)
- `vite.config.js` — add `worker: { format: 'es' }`
- `src/gemma.js` — keep as reference; deprecate after testing

#### Platform Notes
- **Web (Vercel):** Full worker support. Add COOP/COEP headers in `vercel.json` for optional `SharedArrayBuffer` threading (graceful degrade without).
- **iOS (Capacitor, WKWebView):** Workers supported on iOS 16+. WASM backend works; WebGPU inside WKWebView workers needs testing.
- **Android (Capacitor):** Works on Android 5+ (Chromium WebView).

#### Fallback
If `typeof Worker === 'undefined'`, fall back to synchronous inference (blocks UI but doesn't crash). Applies to ~0.1% of browsers.

#### Model Load UX
Worker streams `LOAD_PROGRESS` (0–1) to main thread → React updates progress bar. User can interact with the app during load.

---

## Phase 2 — AI Pipeline & Regex Parser

### 2a — Fuzzy Matching (Replace `wordSim`)

**Install:** `npm install fuse.js` (14KB, zero deps)

Replace `getTopCandidates()` in `src/helpers.js`:
```js
import Fuse from 'fuse.js'

export function getTopCandidates(name, products, n = 5) {
  const fuse = new Fuse(products, {
    keys: ['name'],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
  })
  return fuse.search(name).slice(0, n).map(r => r.item)
}
```
Return top 5 candidates (`n=5`). This handles typos (Levenshtein distance), is 2–3× faster on large catalogs, and replaces the current unreliable `wordSim()`.

### 2b — AI Mode Abstraction

**New file: `src/ai/pipeline.js`**
```js
export async function matchItem(itemName, candidates, mode, provider, apiKey) {
  if (mode === 'small') {
    const { matchWithGemma } = await import('../onnxRuntime.js')
    return matchWithGemma(itemName, candidates)
  }
  if (mode === 'byok') {
    return matchItemWithCloud(itemName, candidates, provider, apiKey)
  }
  return null
}
```
Cloud providers supported: `openai`, `anthropic`, `openrouter`, `gemini`. Each call uses minimal tokens (`max_tokens: 3`) — just a number reply.

**On-device prompt improvement** (`src/onnxRuntime.js` / worker):
- Add `system` role message
- Include up to 40-char product description snippets in candidate list
- Allow `0` reply = no match (prevents forced false positives)
- Reduce `max_new_tokens` from 5 → 3

### 2c — Background AI (Non-Blocking UI)

**New file: `src/hooks/useBackgroundAI.js`**
- Creates a Web Worker that handles batched matching
- Returns `matchBatch(items, products, modelId)` — non-blocking Promise
- Worker streams `match_progress` messages back to main thread per item

**Updated `InvoiceEditor.jsx` `runParse` function:**
1. Parse + fuzzy match synchronously → show initial results immediately (user can interact)
2. Call `matchBatch()` — do NOT await it
3. As matches arrive, update `pasteResults` state incrementally via `.then()`
4. `pasteAiLoading` spinner shows but no longer blocks interaction with red (unmatched) items

**Red items = unmatched.** User can manually resolve while AI continues. AI results applied as they arrive, overwriting red items in-place.

### 2d — Regex Parser Improvement (`src/helpers.js`)

Replace `extractItems()` with a robust 4-stage hybrid parser:

**Stage 1 — Normalize:** Strip WhatsApp/iMessage/SMS timestamps, "You:" prefixes, email headers.

**Stage 2 — Split lines:** Newline + semicolon splits. Comma splits only outside parentheses (paren-aware loop).

**Stage 3 — Parse each line with 4 quantity patterns:**
| Pattern | Example | Confidence |
|---------|---------|------------|
| `NxItem` / `N × Item` | `2x Blue Extractor` | 1.0 |
| `ItemxN` | `Blue Extractor x2` | 1.0 |
| `Item (qty: N)` / `Item (x3)` | `Cassette (qty: 10)` | 1.0 |
| `N Item` (2+ word name) | `5 Sterilisation Cassettes` | 0.75 |

**Stage 4 — Clean name:** Strip stop words (`the`, `a`, `please`, `order`, etc.), currency symbols (`£$€`), collapse whitespace.

Items with `confidence < 1.0` are flagged for AI review. Items matching greeting/question patterns are discarded.

**If regex still fails at >20% rate:** Add `natural` npm package (26KB) as NLP tokenizer fallback. Only add if real-world testing shows need.

---

## Phase 3 — Navigation: Burger Menu

### Changes to App.jsx
- Add `menuOpen` state
- Header: replace current nav items with hamburger `☰` button + app title
- Bottom nav: keep only Dashboard, Invoices, Orders (remove Inventory & Settings from bottom bar)
- Render `<BurgerMenu>` at app root level

### New file: `src/components/BurgerMenu.jsx`
- Slides in from left: `transform: translateX(-100%)` → `translateX(0)`, `transition: 0.25s cubic-bezier(0.4,0,0.2,1)`
- Backdrop overlay (semi-opaque) closes menu on click
- Menu items: **Inventory**, **Settings**, **Contacts**
- Android back button closes menu via `@capacitor/app` `backButton` listener (graceful fallback to `Escape` key on web)
- `safe-area-inset-top/bottom` padding for iOS notch / Android gesture bar
- No animation library — pure CSS transform + React state

### Icons to add to `src/components/Icon.jsx`
- `menu` — hamburger lines
- `contacts` — person silhouette

### CSS additions to `src/styles.js`
```css
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes slideUp { from { transform: translateY(100%); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
```

---

## Phase 4 — Contacts

### Data Model
```js
{
  id: 'contact_<timestamp>_<random>',
  name: '',           // required
  email: '',
  phone: '',
  website: '',
  businessName: '',
  address1: '', address2: '', city: '', postcode: '', country: '',
  source: 'manual',   // 'manual' | 'phone' | 'squarespace'
  createdAt: ISO,
}
```

### Storage
`localStorage` key `sip_contacts` — consistent with existing app pattern. Sufficient for MVP (< 1000 contacts = negligible size). Wrap in abstraction for future IndexedDB migration.

### New Files

**`src/hooks/useContacts.js`** — `addContact`, `updateContact`, `deleteContact`, `contacts` state, persists to localStorage.

**`src/api/contacts.js`** — import functions:
- `importPhoneContacts()` via `@capacitor-community/contacts` plugin
- `fetchSquarespaceCustomers(apiKey, onProgress)` — reuses Squarespace API pattern from `squarespace.js`, paginates via cursor, maps to contact model

**`src/components/Contacts.jsx`** — main contacts tab (list + search)
**`src/components/ContactEditor.jsx`** — add/edit modal
**`src/components/QuickAddContactModal.jsx`** — bottom sheet for Dashboard "Quick Add"

### Quick Add Contact on Dashboard
- "+" button next to "New Invoice" in Dashboard header
- Opens `QuickAddContactModal` (bottom sheet, slides up)
- Fields: Name (required), Email, Phone, Website
- Inline validation: error shown per field as user types; submit disabled until name non-empty
- Auto-focuses name field on open

### Contacts Tab (via Burger Menu)
- Search bar (client-side `useMemo` filter on name/email/phone/businessName)
- Tap row → `ContactEditor` modal (prefilled)
- Swipe-to-delete or delete button in editor
- Settings → Contacts section: Import from Squarespace, Import from phone contacts

### Capacitor Contacts Plugin
```bash
npm install @capacitor-community/contacts
npx cap sync
```
- iOS: add `NSContactsUsageDescription` to `Info.plist`
- Android: add `READ_CONTACTS` permission to `AndroidManifest.xml`

---

## Phase 5 — Invoice Lifecycle & Business Settings

### Invoice Data Model Changes (`src/constants.js`)
Add to `blankInvoice`:
```js
discounts: [],   // [{ id, name, type: 'percent'|'fixed', value }]
status: 'new',   // 'new' | 'pending' | 'fulfilled' | 'paid' | 'refunded' | 'cancelled'
fulfillmentMethod: null,  // 'picker' | 'instant' | null
```

### Discount Calculation (`src/helpers.js`)
New `calcTotals(items, taxRate, discounts)`:
1. Subtotal = sum of `qty × price`
2. Apply % discounts first (each on original subtotal)
3. Apply fixed discounts
4. `discountable = subtotal − discountAmount`
5. Tax on `discountable`
6. Total = `discountable + tax`

### Business Settings (extend `settings` in `App.jsx`)
New fields:
```js
bankDetails: { accountName, bankName, accountNumber, sortCode, iban, swift },
taxId: { type: 'vat'|'ein'|'abn'|'gst'|'none', number: '' },
companyNumber: '',
```
Auto-injected into every PDF via `pdf.js`. Settings UI: new "Billing Information" and "Tax & Compliance" sub-sections in `Settings.jsx`.

### Invoice Lifecycle State Machine
```js
const TRANSITIONS = {
  new:       ['pending', 'cancelled'],
  pending:   ['fulfilled', 'cancelled'],
  fulfilled: ['paid', 'cancelled'],
  paid:      ['refunded'],
  refunded:  [],
  cancelled: [],
}
```
Enforce: `canTransition(from, to)` guard before any status update.

### "Mark as Fulfilled" Workflow (`InvoiceEditor.jsx`)
When invoice is `pending`, show action button:
1. Tap → modal with two choices:
   - **Go to Picker** — sets `fulfillmentMethod: 'picker'`, routes to Orders tab with invoice pre-selected
   - **Skip** — sets `fulfillmentMethod: 'instant'`, immediately marks `fulfilled`
2. Shared picker code — do not duplicate (see Phase 7)

### Multiple Discount Lines (InvoiceEditor UI)
- "Add Discount" button below line items
- Each row: name input, type toggle (% / £), value input, remove button
- Totals section shows: Subtotal → each discount line → Discountable subtotal → Tax → **Total**

---

## Phase 6 — Background Sync (Squarespace)

### Two-Phase Sync Architecture

**Phase 1 — Initial Sync (on every app open)**
- Fetch product names/IDs only — fast, lightweight
- Store in localStorage (`sip_products`)
- Gets app usable in < 5s

**Phase 2 — Background Enrichment (after initial sync)**
- Fetch descriptions + up to 2 images per product
- Images: if file → download + save to device; if URL → save URL only
- Chunked: enriches 1–2 products per background invocation (stays under timeout limits)
- Saves progress checkpoint (`nextEnrichIdx`) to resume across invocations

### Abstract Adapter Pattern (future-proofing)
```
src/sync/
  core/
    SyncManager.js        # orchestrates phase 1 & 2, conflict resolution
  adapters/
    SquarespaceAdapter.js # fetchInitial(), fetchEnrichment(), downloadImage()
    BaseAdapter.js        # interface definition
  storage/
    LocalStorageSync.js   # web
    CapacitorSync.js      # iOS/Android (Filesystem API)
```
Squarespace-specific logic is isolated in `SquarespaceAdapter`. Adding Shopify/WooCommerce later = new adapter file only.

### Conflict Resolution
- Products carry `remoteModifiedAt` and `localModifiedAt`
- During enrichment: if `localModifiedAt > remoteModifiedAt` → skip (user version wins)
- Otherwise: merge remote enrichment data

### Web (Vercel)
- `setInterval` (30 min) in `useCatalogSync` hook for foreground sync
- Service Worker (`public/service-worker.js`) for background enrichment when tab is not in focus
- Service Worker registration in React `useEffect` — ~100 lines, non-critical

### iOS (Capacitor)
```bash
npm install @capacitor/background-runner
npx cap sync
```
- `capacitor.config.ts`: `BackgroundRunner` plugin config, `interval: 30`, `autoStart: true`
- `runners/background.js`: fetch + Filesystem write, chunked enrichment
- Xcode: enable "Background Modes" → Background Fetch + Background Processing
- Hard limit: 30s per invocation → use checkpoint to resume

### Android (Capacitor)
- Same `@capacitor/background-runner` plugin — uses WorkManager under the hood automatically
- Same `runners/background.js` — cross-platform compatible
- Handles Doze mode, app standby automatically

### Image Storage
- **Web:** Store CDN URLs only (browser cache handles images)
- **Native:** Download to `Directory.Cache` via `Filesystem.writeFile()`, serve via `Capacitor.convertFileSrc()`

---

## Phase 7 — Picker

### Library
**`react-swipeable`** (11KB) — lightweight, explicit touch event handling, Capacitor-compatible.
```bash
npm install react-swipeable
```
No other animation library needed — CSS transitions only.

### New Files

**`src/hooks/usePicker.js`** — shared state machine
- `picks: { [itemIndex]: qty }` — quantities confirmed as picked
- `unavailable: { [itemIndex]: bool }` — items marked unavailable (don't affect invoice)
- `handlePick(idx, qty)`, `handleUnavailable(idx, bool)`, `reset()`
- Persists to localStorage for crash recovery

**`src/components/PickerUI.jsx`** — unified render hub
- Props: `items`, `picks`, `unavailable`, `onPick`, `onUnavailable`, `viewMode`, `onClose`
- Routes to `PickerCard` or `PickerList` based on `viewMode`

**`src/components/PickerCard.jsx`** — card/carousel view
- `useSwipeable` hook per card
- Swipe right → `handlePick(idx, item.qty)` + advance
- Swipe left → `handleUnavailable(idx, true)` + advance
- CSS visual feedback: `rotate(4deg)` + green overlay on right, `rotate(-4deg)` + red overlay on left
- Haptic feedback via `@capacitor/haptics` on swipe confirm

**`src/components/PickerList.jsx`** — list view
- Expandable rows: `max-height: 0` → `max-height: 500px` CSS transition
- Tap row header → expand/collapse description + images
- `loading="lazy"` on images (native, no library)
- `PickerQuantity` component embedded when expanded

**`src/components/PickerQuantity.jsx`** — stepper
- Shows "Ordered: X" label
- `−` / `+` buttons: clamp 0 ≤ picked ≤ ordered
- Displays `picked/ordered` (e.g. `8/10`)

### User Preference
`settings.pickerViewMode: 'list' | 'card'` — stored in existing settings, passed as prop to `PickerUI`.

### Two Consumers (Shared Code, No Duplication)

**Standalone Order Picker (`Orders.jsx`):**
```jsx
const { picks, ... } = usePicker(order.lineItems, (picks) => savePicks(order.id, picks))
return <PickerUI items={order.lineItems} picks={picks} viewMode={settings.pickerViewMode} ... />
```

**Invoice Fulfillment (`InvoiceEditor.jsx`):**
```jsx
const { picks, ... } = usePicker(invoice.items)
// "Skip" calls onSkip() — does NOT touch picker state
// "Mark as Fulfilled" calls onComplete({ picks, unavailable })
return (
  <>
    <PickerUI items={invoice.items} picks={picks} viewMode={settings.pickerViewMode} ... />
    <button onClick={onSkip}>Skip</button>
    <button onClick={handleMarkFulfilled}>Mark as Fulfilled</button>
  </>
)
```

**Refactor `PickSheet.jsx`** to wrap `PickerUI` instead of bespoke HTML.

---

## New Dependencies Summary

| Package | Phase | Size | Purpose |
|---------|-------|------|---------|
| `fuse.js` | 2 | 14KB | Fuzzy product matching |
| `react-swipeable` | 7 | 11KB | Swipe gestures for picker cards |
| `@capacitor/background-runner` | 6 | native | Background sync on iOS/Android |
| `@capacitor-community/contacts` | 4 | native | Import from phone contacts |

**Not adding:** `framer-motion`, `react-spring`, `dexie`, `natural`, `workbox` (deferred or unnecessary for MVP).

---

## File Change Summary

### New Files
```
src/workers/onnxWorker.js
src/onnxRuntime.js
src/ai/pipeline.js
src/hooks/useBackgroundAI.js
src/hooks/usePicker.js
src/hooks/useContacts.js
src/hooks/useCatalogSync.js
src/api/contacts.js
src/sync/core/SyncManager.js
src/sync/adapters/BaseAdapter.js
src/sync/adapters/SquarespaceAdapter.js
src/sync/storage/LocalStorageSync.js
src/sync/storage/CapacitorSync.js
src/components/BurgerMenu.jsx
src/components/Contacts.jsx
src/components/ContactEditor.jsx
src/components/QuickAddContactModal.jsx
src/components/PickerUI.jsx
src/components/PickerCard.jsx
src/components/PickerList.jsx
src/components/PickerQuantity.jsx
runners/background.js
public/service-worker.js
```

### Modified Files
```
src/App.jsx              — burger menu, contacts state, onnxRuntime import
src/helpers.js           — calcTotals(), extractItems() rewrite, getTopCandidates() → Fuse.js
src/constants.js         — blankInvoice discounts/status, business settings shape
src/components/InvoiceEditor.jsx  — discount UI, fulfillment workflow, background AI
src/components/Settings.jsx       — billing/tax/company settings sections
src/components/InvoiceList.jsx    — lifecycle status filters
src/components/Dashboard.jsx      — Quick Add Contact button
src/components/PickSheet.jsx      — refactor to wrap PickerUI
src/components/Orders.jsx         — use usePicker hook
src/components/Icon.jsx           — add menu, contacts icons
src/api/squarespace.js            — split into initial/enrichment methods
vite.config.js                    — worker: { format: 'es' }
capacitor.config.ts               — BackgroundRunner plugin config
```
