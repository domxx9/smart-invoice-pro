/**
 * ExecuTorch Capacitor plugin wrapper (SMA-136).
 *
 * Thin adapter that wires the native LlmRunner plugin into the JS pipeline.
 * The plugin is only available on native Android — web/iOS get isAvailable()=false
 * so the pipeline mode stays inert until the iOS plugin ships.
 */
import { registerPlugin } from '@capacitor/core'

const PLUGIN_NAME = 'LlmRunner'

function getPlugin() {
  try {
    return registerPlugin(PLUGIN_NAME)
  } catch {
    return null
  }
}

export function isAvailable() {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) {
    return false
  }
  return getPlugin() !== null
}

/**
 * @param {{ modelPath: string, tokenizerPath: string, temperature?: number }} opts
 * @returns {Promise<void>}
 */
export async function loadModel({ modelPath, tokenizerPath, temperature = 0.1 }) {
  const plugin = getPlugin()
  if (!plugin) throw new Error('ExecuTorch plugin not available on this platform')
  await plugin.loadModel({ modelPath, tokenizerPath, temperature })
}

/**
 * @param {{ prompt: string, maxTokens: number }} opts
 * @returns {Promise<{ text: string }>}
 */
export async function infer({ prompt, maxTokens }) {
  const plugin = getPlugin()
  if (!plugin) throw new Error('ExecuTorch plugin not available')
  const result = await plugin.infer({ prompt, maxTokens })
  return { text: result.text ?? '' }
}

export async function cancelInfer() {
  const plugin = getPlugin()
  if (!plugin) return
  try {
    await plugin.cancelInfer()
  } catch {
    /* best-effort */
  }
}

export async function unloadModel() {
  const plugin = getPlugin()
  if (!plugin) return
  try {
    await plugin.unloadModel()
  } catch {
    /* best-effort */
  }
}