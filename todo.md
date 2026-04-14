# TODO

## AI & Smart Paste

### AI Pipeline
- [ ] Review AI pipeline — update context strategy based on mode:
  - **On-device (onboard) AI:** low context window — fuzzy match first produces top N candidate products, AI selects from those candidates only (not the full product list)
  - **API key (cloud AI):** full context — send entire product list, full input text, and system prompt
- [ ] **Red items = unmatched products** — items the regex + AI could not confidently match to any product; user must resolve these manually
- [ ] Background AI behaviour — user should be able to immediately interact with and resolve red (unmatched) items while AI continues working in the background; AI results applied as they arrive without blocking the user

### Regex Parser (needs improvement)
- [ ] Parser currently handles pasted order text (WhatsApp, email, etc.) but is not reliable enough
- [ ] Improve regex to handle a wider range of real-world paste formats
- [ ] Polish the full pipeline: regex parse → fuzzy match → AI disambiguation (on-device or API)

---

## Onboard AI — Migration & Critical Fixes

**Targets:** iOS (Capacitor), Android (Capacitor), Web (Vercel)

### Migration: MediaPipe → ONNX Runtime Web
- [ ] **Push ONNX implementation from local PC to repo** — migration is complete locally, not yet pushed

### Threading Fixes (apply after/during ONNX migration)

**Root cause:** JavaScript is single-threaded. `async/await` only handles I/O waiting — it does NOT offload CPU/GPU work. Model loading and inference both block the entire JS event loop. File downloads are already properly async and not a problem.

- [ ] **Model loading freeze:** model loading blocks the UI on startup — offload to a Web Worker so the main thread stays responsive
- [ ] **Processing freeze:** inference blocks the UI — run inside the Web Worker; post results back to main thread when done
- [ ] **Implement Web Worker** for all ONNX Runtime operations — worker runs on a separate OS thread, communicates with main thread via `postMessage`
  - **Web (Vercel):** Web Workers fully supported — ONNX Runtime Web works well in workers
  - **iOS (Capacitor / WKWebView):** Web Workers supported on iOS 16+; ONNX WASM backend more likely to work than WebGPU inside a WKWebView worker — needs testing
  - **Android (Capacitor):** Same Web Worker approach applies
  - Fallback if workers unavailable: chunk inference with `requestIdleCallback()` to yield between tokens

---

## Navigation
- [ ] Create burger menu to replace Inventory & Settings (these are now accessed via burger menu only)
  - Burger menu includes: Inventory, Settings, Contacts tab
- [ ] Dashboard: add "Quick Add Contact" — supports name, email / phone number / website

---

## Sync

**Source:** Squarespace only for now — architecture should allow other platforms to be added in future

- [ ] Auto-sync every 30 minutes, running in the background — UI must remain fully interactive during sync
  - **Web (Vercel):** use `setInterval` + background fetch; consider Service Worker for syncing even when the tab is not in focus
  - **iOS (Capacitor):** use Capacitor Background Runner or `BackgroundFetch` plugin — WKWebView tabs can be suspended by the OS, so a native background task is required
  - **Android (Capacitor):** use Capacitor Background Runner or WorkManager via plugin to survive app backgrounding
  - Sync should be silent — no UI interruption unless there is an error worth surfacing

### Sync Strategy
- [ ] **Initial sync:** runs on first install AND each time the app opens — fetch product name/title only, fast and lightweight, gets the app usable immediately
- [ ] **Background enrichment sync** (kicks off after initial sync completes):
  - Fetch product description and up to 2 images per product
  - If images are files — download and save on device
  - If images are URLs — save the URL only (no download needed)
  - Run entirely in the background, no UI blocking

---

## Picker

**Scope:** per order / per invoice

- [ ] Support **partial picking** — items can be partially fulfilled (e.g. ordered 10, only 8 available)
- [ ] User can choose preferred display mode (saved preference):
  - **List view:** simple list of product names; tap to expand and reveal description and images
  - **Card/carousel view:** full-screen stack of cards showing product images as a carousel
    - Swipe right → mark as picked, advance to next item
    - Swipe left → mark as unavailable (does not affect the invoice)
- [ ] Picker and invoice fulfillment flow share the same underlying code (see Invoices section)

---

## Contacts

**Note:** contacts are Squarespace customers; used for addressing invoices for now

- [ ] Contacts tab accessible via burger menu
- [ ] Add, edit, and delete contacts
- [ ] Settings page: Contacts section
  - Import from Squarespace
  - Import from mobile contacts
  - (more import sources TBD)

---

## Invoices

**Lifecycle:** New → Pending → Fulfilled → Paid → Refunded → Cancelled

**Creation:** user creates invoice manually; smart paste can add items; user can also search and add items individually

- [ ] Invoice importing and storing
- [ ] Support **multiple discount lines** per invoice — each discount applied before tax
- [ ] **Business Settings** — the following fields should be stored here and pulled through to every invoice automatically:
  - Bank details
  - VAT number
  - Company number
- [ ] **Pending invoice workflow — "Mark as Fulfilled" button:**
  - When an invoice is pending, the next workflow action button reads "Mark as Fulfilled"
  - Clicking it presents a choice:
    - **Go to Picker** — runs the same flow as the order picker (shared code — do not duplicate)
    - **Skip** — marks the invoice as fulfilled immediately without going through the picker
  - Order picker and this flow must share the same underlying code — any future changes to picker behaviour apply to both automatically
