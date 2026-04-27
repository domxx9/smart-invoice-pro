export class BaseAdapter {
  async fetchInitial() {
    throw new Error('Not implemented')
  }

  async fetchEnrichment() {
    throw new Error('Not implemented')
  }

  async getCheckpoint() {
    throw new Error('Not implemented')
  }

  async saveCheckpoint() {
    throw new Error('Not implemented')
  }
}
