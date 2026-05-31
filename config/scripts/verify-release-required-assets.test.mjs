import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractManifestAssetNames,
  getRequiredReleaseAssetNames,
  verifyRequiredReleaseAssets
} from './verify-release-required-assets.mjs'

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn(async () => body),
    text: vi.fn(async () => (typeof body === 'string' ? body : JSON.stringify(body)))
  }
}

function releaseWithAssets(tag, assetNames) {
  return {
    tag_name: tag,
    draft: true,
    prerelease: false,
    assets: assetNames.map((name, index) => ({
      id: index + 1,
      name,
      state: 'uploaded',
      size: 123
    }))
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getRequiredReleaseAssetNames', () => {
  it('includes both mac updater ZIP names for the tag version', () => {
    expect(getRequiredReleaseAssetNames('v1.4.27')).toEqual(
      expect.arrayContaining([
        'AnthraSpace-1.4.27-mac.zip',
        'AnthraSpace-1.4.27-mac.zip.blockmap',
        'AnthraSpace-1.4.27-arm64-mac.zip',
        'AnthraSpace-1.4.27-arm64-mac.zip.blockmap'
      ])
    )
  })
})

describe('extractManifestAssetNames', () => {
  it('extracts relative and absolute manifest asset names', () => {
    expect(
      extractManifestAssetNames(
        [
          'files:',
          '  - url: AnthraSpace-1.4.27-arm64-mac.zip',
          '  - url: https://example.com/downloads/anthraspace-windows-setup.exe',
          'path: anthraspace-linux.AppImage'
        ].join('\n')
      )
    ).toEqual(['AnthraSpace-1.4.27-arm64-mac.zip', 'anthraspace-windows-setup.exe', 'anthraspace-linux.AppImage'])
  })
})

describe('verifyRequiredReleaseAssets', () => {
  it('fails when a manifest-referenced asset has not been uploaded', async () => {
    const tag = 'v1.4.27'
    const required = getRequiredReleaseAssetNames(tag)
    const assets = required.filter((name) => name !== 'AnthraSpace-1.4.27-arm64-mac.zip')
    const release = releaseWithAssets(tag, assets)
    const latestMacAsset = release.assets.find((asset) => asset.name === 'latest-mac.yml')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([release]))
      .mockResolvedValueOnce(
        jsonResponse(
          [
            'version: 1.4.27',
            'files:',
            '  - url: AnthraSpace-1.4.27-arm64-mac.zip',
            '    sha512: test',
            'path: AnthraSpace-1.4.27-arm64-mac.zip'
          ].join('\n')
        )
      )
      .mockResolvedValue(jsonResponse('version: 1.4.27\n'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyRequiredReleaseAssets({ repo: 'rafa57600/AnthraSpace', tag, token: 'token' })
    ).rejects.toThrow('Missing: AnthraSpace-1.4.27-arm64-mac.zip')
    expect(latestMacAsset).toBeTruthy()
  })
})
