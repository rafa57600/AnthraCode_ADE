import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NATIVE_PI_MODEL_CONFIG,
  mapToPiModelProvider,
  resolvePiModelConfig,
  toPiModelConfig
} from './pi-model-config'

describe('pi-model-config', () => {
  it('maps AnthraSpace-facing provider aliases to Pi provider ids', () => {
    expect(mapToPiModelProvider('claude')).toBe('anthropic')
    expect(mapToPiModelProvider('gemini')).toBe('google')
    expect(mapToPiModelProvider('google-ai-studio')).toBe('google')
    expect(mapToPiModelProvider('openrouter')).toBe('openrouter')
  })

  it('normalizes and preserves already-supported Pi provider ids', () => {
    expect(mapToPiModelProvider('  Groq  ')).toBe('groq')
    expect(mapToPiModelProvider('custom-provider')).toBe('custom-provider')
  })

  it('converts model selections to serializable Pi model configs', () => {
    expect(toPiModelConfig({ modelProvider: 'gemini', modelName: ' gemini-2.5-flash ' })).toEqual({
      modelProvider: 'google',
      modelName: 'gemini-2.5-flash'
    })
  })

  it('falls back to the default native Pi model when config is incomplete', () => {
    expect(resolvePiModelConfig(null)).toEqual(DEFAULT_NATIVE_PI_MODEL_CONFIG)
    expect(resolvePiModelConfig({ modelProvider: 'anthropic', modelName: '' })).toEqual(
      DEFAULT_NATIVE_PI_MODEL_CONFIG
    )
  })

  it('prefers nested IPC modelConfig over legacy flat model fields', () => {
    expect(
      resolvePiModelConfig({
        modelProvider: 'anthropic',
        modelName: 'claude-sonnet-4-20250514',
        modelConfig: { modelProvider: 'gemini', modelName: 'gemini-2.5-flash' }
      })
    ).toEqual({ modelProvider: 'google', modelName: 'gemini-2.5-flash' })
  })

  it('keeps legacy flat IPC model fields as a compatibility fallback', () => {
    expect(resolvePiModelConfig({ modelProvider: 'claude', modelName: 'claude-sonnet-4-0' })).toEqual({
      modelProvider: 'anthropic',
      modelName: 'claude-sonnet-4-0'
    })
  })
})
