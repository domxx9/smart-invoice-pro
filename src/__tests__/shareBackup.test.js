import { describe, it, expect, beforeEach, vi } from 'vitest'

const capacitorMock = { Capacitor: { isNativePlatform: vi.fn(() => false) } }
const filesystemMock = {
  Filesystem: {
    writeFile: vi.fn(async () => ({})),
    getUri: vi.fn(async () => ({ uri: 'file:///cache/backup.json' })),
  },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}
const shareMock = {
  Share: { share: vi.fn(async () => ({})) },
}

vi.mock('@capacitor/core', () => capacitorMock)
vi.mock('@capacitor/filesystem', () => filesystemMock)
vi.mock('@capacitor/share', () => shareMock)

import { shareOrDownload } from '../utils/shareBackup.js'

describe('shareOrDownload (web)', () => {
  beforeEach(() => {
    capacitorMock.Capacitor.isNativePlatform.mockReturnValue(false)
    filesystemMock.Filesystem.writeFile.mockClear()
    filesystemMock.Filesystem.getUri.mockClear()
    shareMock.Share.share.mockClear()
    vi.restoreAllMocks()
  })

  it('creates a blob URL and clicks a hidden download link', async () => {
    const createURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.fn()
    const origCreate = document.createElement.bind(document)
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    const result = await shareOrDownload({
      filename: 'backup.json',
      content: '{"ok":true}',
      mimeType: 'application/json',
    })

    expect(createURLSpy).toHaveBeenCalledTimes(1)
    const [blob] = createURLSpy.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake')
    expect(document.body.querySelector('a[download]')).toBeNull()
    expect(result).toEqual({ platform: 'web', filename: 'backup.json' })

    createSpy.mockRestore()
  })

  it('revokes the object URL even if the click handler throws', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:boom')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag)
      if (tag === 'a') {
        el.click = () => {
          throw new Error('click failed')
        }
      }
      return el
    })

    await expect(
      shareOrDownload({
        filename: 'oops.json',
        content: '{}',
        mimeType: 'application/json',
      }),
    ).rejects.toThrow('click failed')
    expect(revokeSpy).toHaveBeenCalledWith('blob:boom')
  })

  it('rejects calls missing required arguments', async () => {
    await expect(shareOrDownload({ content: 'x', mimeType: 'text/plain' })).rejects.toThrow(
      /filename/,
    )
    await expect(
      shareOrDownload({ filename: 'a.txt', mimeType: 'text/plain' }),
    ).rejects.toThrow(/content/)
    await expect(
      shareOrDownload({ filename: 'a.txt', content: 'x' }),
    ).rejects.toThrow(/mimeType/)
  })
})

describe('shareOrDownload (native)', () => {
  beforeEach(() => {
    capacitorMock.Capacitor.isNativePlatform.mockReturnValue(true)
    filesystemMock.Filesystem.writeFile.mockClear()
    filesystemMock.Filesystem.getUri.mockClear()
    filesystemMock.Filesystem.getUri.mockResolvedValue({ uri: 'file:///cache/backup.json' })
    shareMock.Share.share.mockClear()
  })

  it('writes to the cache dir and opens the share sheet with the resolved URI', async () => {
    const result = await shareOrDownload({
      filename: 'backup.json',
      content: '{"hello":"world"}',
      mimeType: 'application/json',
    })

    expect(filesystemMock.Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'backup.json',
      data: '{"hello":"world"}',
      directory: 'CACHE',
      encoding: 'utf8',
    })
    expect(filesystemMock.Filesystem.getUri).toHaveBeenCalledWith({
      path: 'backup.json',
      directory: 'CACHE',
    })
    expect(shareMock.Share.share).toHaveBeenCalledWith({
      title: 'backup.json',
      url: 'file:///cache/backup.json',
      dialogTitle: 'Share backup.json',
    })
    expect(result).toEqual({
      platform: 'native',
      filename: 'backup.json',
      uri: 'file:///cache/backup.json',
      mimeType: 'application/json',
    })
  })

  it('propagates write failures instead of silently continuing to share', async () => {
    filesystemMock.Filesystem.writeFile.mockRejectedValueOnce(new Error('disk full'))

    await expect(
      shareOrDownload({
        filename: 'backup.json',
        content: '{}',
        mimeType: 'application/json',
      }),
    ).rejects.toThrow('disk full')
    expect(shareMock.Share.share).not.toHaveBeenCalled()
  })

  it('propagates share failures after a successful write', async () => {
    shareMock.Share.share.mockRejectedValueOnce(new Error('share cancelled'))

    await expect(
      shareOrDownload({
        filename: 'backup.json',
        content: '{}',
        mimeType: 'application/json',
      }),
    ).rejects.toThrow('share cancelled')
    expect(filesystemMock.Filesystem.writeFile).toHaveBeenCalledTimes(1)
  })
})
