# TODO

- [ ] Review AI pipeline — update context strategy based on mode:
  - **On-device (onboard) AI:** low context window — AI selects from a presented set of options (pre-filtered choices, not full data)
  - **API key (cloud AI):** full context — send entire product list, full input text, and system prompt
- [ ] Polish regex parser and onboard AI behavior

## Onboard AI — Critical Fixes

**Targets:** iOS (Capacitor), Android (Capacitor), Web (Vercel)

**Root cause:** JavaScript is single-threaded. `async/await` only handles I/O waiting — it does NOT offload CPU/GPU work. MediaPipe model loading (`src/gemma.js:278` — `LlmInference.createFromOptions()`) and inference (`src/gemma.js:335` — `generateResponse()`) both block the entire JS event loop. File downloads (`src/gemma.js:155–231`) are already properly async and not a problem.

- [ ] **Model loading freeze:** `LlmInference.createFromOptions()` at `src/gemma.js:278` blocks the UI on startup — offload to a Web Worker so the main thread stays responsive
- [ ] **Processing freeze:** `generateResponse()` at `src/gemma.js:335` blocks the UI during inference — run inside the Web Worker; post results back to main thread when done
- [ ] **Background AI behaviour:** AI results should arrive asynchronously — user should be able to immediately interact with flagged (red) items while AI works in the background; apply AI results when ready without blocking the user
- [ ] **Implement Web Worker** for all MediaPipe/LLM operations (`src/gemma.js`) — worker runs on a separate OS thread, communicates with main thread via `postMessage`
  - **Web (Vercel):** Web Workers are fully supported — primary solution
  - **iOS (Capacitor):** Capacitor runs inside WKWebView — Web Workers are supported on iOS 16+ but need to verify MediaPipe + WebGPU availability inside a worker context on WKWebView; may need a fallback
  - **Android (Capacitor):** Already documented — same Web Worker approach applies
  - If Web Workers cannot load MediaPipe on a given platform, fallback: run inference in chunks using `requestIdleCallback()` to yield back to the UI between tokens
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
