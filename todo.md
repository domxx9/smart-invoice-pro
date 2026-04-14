# TODO

- [ ] Review AI pipeline — update context strategy based on mode:
  - **On-device (onboard) AI:** low context window — AI selects from a presented set of options (pre-filtered choices, not full data)
  - **API key (cloud AI):** full context — send entire product list, full input text, and system prompt
- [ ] Polish regex parser and onboard AI behavior

## Onboard AI — Migration & Critical Fixes

**Targets:** iOS (Capacitor), Android (Capacitor), Web (Vercel)

### Migration: MediaPipe → ONNX Runtime Web
- [ ] **Push ONNX implementation from local PC to repo** — migration is complete locally, not yet pushed

### Threading Fixes (apply after/during ONNX migration)

**Root cause:** JavaScript is single-threaded. `async/await` only handles I/O waiting — it does NOT offload CPU/GPU work. Model loading and inference both block the entire JS event loop. File downloads are already properly async and not a problem.

- [ ] **Model loading freeze:** model loading blocks the UI on startup — offload to a Web Worker so the main thread stays responsive
- [ ] **Processing freeze:** inference blocks the UI — run inside the Web Worker; post results back to main thread when done
- [ ] **Background AI behaviour:** AI results should arrive asynchronously — user should be able to immediately interact with flagged (red) items while AI works in the background; apply AI results when ready without blocking the user
- [ ] **Implement Web Worker** for all ONNX Runtime operations — worker runs on a separate OS thread, communicates with main thread via `postMessage`
  - **Web (Vercel):** Web Workers fully supported — ONNX Runtime Web works well in workers
  - **iOS (Capacitor / WKWebView):** Web Workers supported on iOS 16+; ONNX WASM backend more likely to work than WebGPU inside a WKWebView worker — needs testing
  - **Android (Capacitor):** Same Web Worker approach applies
  - Fallback if workers unavailable: chunk inference with `requestIdleCallback()` to yield between tokens
- [ ] Create burger menu to replace Inventory & Settings (these are now accessed via burger menu only)
  - Burger menu includes: Inventory, Settings, Contacts tab
- [ ] Dashboard: add "Quick Add Contact" — supports name, email / phone number / website

## Contacts
- [ ] Contacts tab accessible via burger menu
- [ ] Add, edit, and delete contacts
- [ ] Settings page: Contacts section
  - Import from Squarespace
  - Import from mobile contacts
  - (more import sources TBD)

## Invoices
- [ ] Invoice importing and storing
- [ ] Add bank details to invoice
- [ ] Add discount line to invoice — discount applies **before tax**
