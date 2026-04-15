# Phase 1 — AI Runtime Decision (ONNX vs Gemma/MediaPipe)

**Effort:** ~1-2 days investigation + ~4 hrs implementation | **Priority:** Critical | **Depends on:** Phase 0

## Context: Why ONNX Was Abandoned

On April 14, the ONNX switch was attempted (commit `325cdc2`) and required **5 consecutive fix commits** before being abandoned entirely in commit `4125df6`:

### Failure Chain
1. **WASM files not bundled** (`6f84747`) — `onnxruntime-web` WASM binaries (22MB+) aren't auto-bundled by Vite. Required a hacky `prebuild` script to copy them from `node_modules` to `public/`.

2. **localStorage unavailable in Web Workers** (`7903e46`) — Android WebView workers can't access `localStorage`. Progress callback reported 10000%. Worker crashes didn't fire `onerror`, hanging forever.

3. **SharedArrayBuffer crash** (`2d2b3ff`) — `ort-wasm-simd-threaded.wasm` requires SharedArrayBuffer for threading. Capacitor WebView doesn't send COOP/COEP headers, so SAB is unavailable. ONNX Runtime threw `std::bad_alloc` even on high-RAM devices (Pixel 10 Pro).

4. **Single-threaded fallback was slow** (`2d2b3ff`) — Setting `numThreads=1` avoided the crash but made inference very slow (CPU-only, single-threaded).

5. **COOP/COEP headers added too late** (`25e35b4`) — Even after injecting headers via `MainActivity.java`, the cumulative problems led to the decision to abandon ONNX and switch to MediaPipe/gemma.js.

### Current State
- `src/gemma.js` — **active**, imported by App.jsx, InvoiceEditor.jsx, Settings.jsx. Uses `@mediapipe/tasks-genai` (WebGPU). 4 model tiers (nano/small/pro/alt).
- `src/onnxRuntime.js` + `src/workers/onnxWorker.js` — **dead code**, exists in repo but never imported. Uses `@huggingface/transformers` (not in package.json).

## Decision: Keep Gemma/MediaPipe, Remove ONNX Dead Code

Given the failure history, the recommendation is:

### Option A: Keep gemma.js as the AI runtime (Recommended)
- MediaPipe's WebGPU backend avoids all the WASM/SharedArrayBuffer problems
- WebGPU is the faster backend anyway (GPU inference vs CPU)
- Already working — 4 model tiers, download/load/delete all functional
- The only downside: WebGPU required (no WASM fallback for LLM inference)

**Action:** Delete `src/onnxRuntime.js` and `src/workers/onnxWorker.js` as dead code. They add confusion (code review found dual-runtime as a critical issue). Keep `gemma.js` as the single AI module.

### Option B: Fix ONNX and make it work (Not recommended for MVP)
Would require:
- Bundling WASM properly (Vite plugin or CDN hosting)
- Testing SharedArrayBuffer + COOP/COEP thoroughly on Android
- Accepting slow single-threaded CPU inference as fallback
- Re-adding `@huggingface/transformers` to package.json
- Significant testing on multiple devices

This is a large effort with uncertain outcome. Better suited for a post-MVP investigation.

## Tasks (if Option A chosen)

### 1a. Delete ONNX dead code
- Delete `src/onnxRuntime.js`
- Delete `src/workers/onnxWorker.js`
- Remove `src/workers/` directory if empty

### 1b. Verify gemma.js is working
- `npm run dev` → Settings → AI → download a model → load → test Smart Paste
- Confirm WebGPU detection works (`hasWebGPU()` in gemma.js)
- Confirm graceful error message when WebGPU unavailable

### 1c. Clean up related dead code
- Remove `src/components/AiSetupScreen.jsx` (imports from onnxRuntime.js, orphaned)
- The `worker: { format: 'es' }` in vite.config.js was already removed in `4125df6`

## If User Wants to Revisit ONNX Later
The commit history preserves the full implementation. `git show 325cdc2` has the original working code. The 5 fix commits document every issue encountered. A future attempt could:
- Use ONNX Runtime Web's newer WebGPU backend (avoids WASM entirely)
- Host WASM files on CDN instead of bundling
- Target only browsers with SharedArrayBuffer support

## Verification
- `npm run build` succeeds with no ONNX references
- App loads, AI settings show gemma.js models
- Smart Paste with AI enhancement works end-to-end
