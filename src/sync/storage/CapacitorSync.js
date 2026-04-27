import { Filesystem, Encoding } from '@capacitor/filesystem'

export class CapacitorSync {
  constructor(namespace = 'sip') {
    this.namespace = namespace
    this._cache = {}
  }

  _filename(key) {
    return `${this.namespace}_${key}.json`
  }

  async get(key) {
    if (this._cache[key] !== undefined) return this._cache[key]
    try {
      const result = await Filesystem.readFile({
        path: this._filename(key),
        encoding: Encoding.UTF8,
      })
      const parsed = JSON.parse(result.data)
      this._cache[key] = parsed
      return parsed
    } catch {
      return null
    }
  }

  async set(key, value) {
    this._cache[key] = value
    await Filesystem.writeFile({
      path: this._filename(key),
      data: JSON.stringify(value),
      encoding: Encoding.UTF8,
    })
  }

  async remove(key) {
    delete this._cache[key]
    try {
      await Filesystem.deleteFile({ path: this._filename(key) })
    } catch {
      // no-op; file may not exist
    }
  }
}
