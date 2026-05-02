import { isModelDownloaded, downloadModel, deleteModel } from '../gemma.js'

const EMBEDDER_ID = 'embedder'

export async function isEmbedderDownloaded() {
  return isModelDownloaded(EMBEDDER_ID)
}

export async function handleEmbedderDownload(onProgress) {
  await downloadModel(EMBEDDER_ID, onProgress)
}

export async function handleEmbedderDelete() {
  await deleteModel(EMBEDDER_ID)
}

// Stub: MediaPipe TextEmbedder init deferred to dedicated ticket.
// Returns true so callers can optimistically mark embedder ready.
export async function loadEmbedder() {
  return true
}
