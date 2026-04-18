/**
 * SMA-78 — token-bounded streaming guard for MediaPipe's generateResponse.
 *
 * MediaPipe's `LlmInference.generateResponse(prompt, cb)` streams chunks of
 * text until the model decides it's done. There is no per-call maxTokens
 * option (it's only accepted on `createFromOptions` as a session-wide cap),
 * so without a client-side guard a small Gemma can parrot its input for
 * thousands of tokens. This helper wraps the callback, counts chunks as a
 * proxy for tokens, and also caps on output length as a belt-and-braces
 * check for chunkers that emit multiple tokens per callback. Hitting either
 * cap triggers `onAbort(text)` which the caller uses to stop the underlying
 * generation.
 */

export const CHAR_PER_TOKEN_UPPER = 4

export function createCappedStreamer({ maxTokens, onToken, onDone, onAbort } = {}) {
  const tokenCap =
    typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0
      ? Math.floor(maxTokens)
      : null
  const charCap = tokenCap != null ? tokenCap * CHAR_PER_TOKEN_UPPER + 64 : null

  let out = ''
  let tokenCount = 0
  let aborted = false
  let finished = false

  function feed(chunk, done) {
    if (aborted || finished) return 'ignored'
    out += chunk
    tokenCount += 1
    const overTokens = tokenCap != null && tokenCount >= tokenCap
    const overChars = charCap != null && out.length >= charCap
    if (!done && (overTokens || overChars)) {
      aborted = true
      onToken?.(chunk, out)
      try {
        onAbort?.(out)
      } catch {
        /* ignore — abort is best-effort */
      }
      onDone?.(out, 'length')
      return 'aborted'
    }
    onToken?.(chunk, out)
    if (done) {
      finished = true
      onDone?.(out, null)
      return 'done'
    }
    return 'token'
  }

  return {
    feed,
    get aborted() {
      return aborted
    },
    get text() {
      return out
    },
    get tokenCount() {
      return tokenCount
    },
    get tokenCap() {
      return tokenCap
    },
    get charCap() {
      return charCap
    },
  }
}
