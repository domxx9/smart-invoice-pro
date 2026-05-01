export class LocalStorageSync {
  constructor(namespace = 'sip') {
    this.namespace = namespace
  }

  _key(k) {
    return `${this.namespace}_${k}`
  }

  async get(key) {
    const raw = localStorage.getItem(this._key(key))
    if (raw == null) return null
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }

  async set(key, value) {
    localStorage.setItem(this._key(key), JSON.stringify(value))
  }

  async remove(key) {
    localStorage.removeItem(this._key(key))
  }
}
