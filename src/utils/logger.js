// Lightweight in-process logger with a ring buffer.
//
// Exists so the Debugging UI (SMA-54) and per-callsite refactor (SMA-55+) can
// share one source of truth for log capture without each call site having to
// know about React state, localStorage, or console.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const DEFAULT_LEVEL = 'error'
const MAX_ENTRIES = 1000

let _minLevel = DEFAULT_LEVEL
let _buffer = []

function setMinLevel(level) {
  if (LEVELS[level] === undefined) return
  _minLevel = level
}

function getMinLevel() {
  return _minLevel
}

function _enabled(level) {
  return LEVELS[level] >= LEVELS[_minLevel]
}

function _record(level, tag, args) {
  _buffer.push({ ts: Date.now(), level, tag, args })
  if (_buffer.length > MAX_ENTRIES) _buffer.shift()
}

function _mirror(level, tag, args) {
  // Resolve once per call so tests/spies on console.* see real invocations.
  const fn = typeof console[level] === 'function' ? console[level] : console.log
  try {
    fn(`[${tag}]`, ...args)
  } catch {
    // Console can throw in restricted environments (e.g. some service workers).
    // We still want the in-memory buffer to capture the entry.
  }
}

function _emit(level, tag, args) {
  if (!_enabled(level)) return
  _record(level, tag, args)
  _mirror(level, tag, args)
}

function getSnapshot() {
  return _buffer.slice()
}

function clear() {
  _buffer = []
}

function _stringifyArg(v) {
  if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`
  if (typeof v === 'string') return v
  if (v === undefined) return 'undefined'
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function _formatEntry({ ts, level, tag, args }) {
  const time = new Date(ts).toISOString()
  const body = args.map(_stringifyArg).join(' ')
  return `${time} ${level.toUpperCase()} [${tag}] ${body}`.trimEnd()
}

function toText() {
  return _buffer.map(_formatEntry).join('\n')
}

export const logger = {
  debug: (tag, ...args) => _emit('debug', tag, args),
  info: (tag, ...args) => _emit('info', tag, args),
  warn: (tag, ...args) => _emit('warn', tag, args),
  error: (tag, ...args) => _emit('error', tag, args),
  setMinLevel,
  getMinLevel,
  getSnapshot,
  clear,
  toText,
}

export default logger
