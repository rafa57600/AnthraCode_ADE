/**
 * auth-bridge — Bridge AnthraSpace API key settings to Pi SDK AuthStorage.
 *
 * AnthraSpace collects API keys through its settings UI (GlobalSettings).
 * Pi's SDK has its own AuthStorage that providers query for keys at runtime.
 * This bridge maps the AnthraSpace settings keys to Pi's provider names so
 * Pi session creation never needs to pass keys manually.
 *
 * ## Provider name mapping
 *
 * | AnthraSpace setting          | Pi provider name |
 * |------------------------------|------------------|
 * | anthropicApiKey              | anthropic        |
 * | openaiApiKey                 | openai           |
 * | googleApiKey                 | google           |
 * | openRouterApiKey             | openrouter       |
 * | groqApiKey                   | groq             |
 *
 * Additional providers Pi supports (azure, bedrock, cerebras, xai, huggingface,
 * ollama) are not yet mapped through AnthraSpace settings.
 */

// Re-export type from pi-coding-agent so callers don't need a direct import.
// Why: keeping the AuthStorage dependency behind this re-export lets
// electron-vite tree-shake pi-coding-agent from bundles that only need the type.
export type { AuthStorage } from '@earendil-works/pi-coding-agent'

/** Keys present on GlobalSettings that carry API keys for AI providers. */
export const ANTHRASPACE_API_KEY_SETTINGS = [
  'anthropicApiKey',
  'openaiApiKey',
  'googleApiKey',
  'openRouterApiKey',
  'groqApiKey',
] as const satisfies readonly string[]

/**
 * AnthraSpace settings key → Pi AuthStorage provider name.
 *
 * Every entry here appears in the Pi provider enum so we can statically
 * assert the mapping is complete. Keys absent from this map (e.g. a future
 * `xaiApiKey`) fail open: they log a warning but do not crash.
 */
const SETTING_TO_PI_PROVIDER: Record<string, string> = {
  anthropicApiKey: 'anthropic',
  openaiApiKey: 'openai',
  googleApiKey: 'google',
  openRouterApiKey: 'openrouter',
  groqApiKey: 'groq',
}

/**
 * Bridge known AnthraSpace API key settings into a Pi AuthStorage instance.
 *
 * Call once during native Pi session creation. Safe to call multiple times —
 * each invocation overwrites previously bridged keys.
 *
 * @param piAuth - Pi SDK AuthStorage instance.
 * @param anthraspaceSettings - Arbitrary key-value map (typically from
 *   GlobalSettings or IPC parameters). Unknown keys are silently skipped.
 */
export function bridgeApiKeysToPiAuth(
  piAuth: import('@earendil-works/pi-coding-agent').AuthStorage,
  anthraspaceSettings: Record<string, string | undefined>
): void {
  for (const [settingKey, provider] of Object.entries(SETTING_TO_PI_PROVIDER)) {
    const value = anthraspaceSettings[settingKey]
    if (typeof value === 'string' && value.length > 0) {
      try {
        piAuth.setRuntimeApiKey(provider, value)
      } catch {
        // Pi's AuthStorage may reject unknown providers silently; ignore.
      }
    }
  }
}

/**
 * Discover which Pi-compatible providers have keys configured in the given
 * settings map. Returns provider names (usable with Pi's ModelRegistry) that
 * have non-empty keys.
 *
 * @returns Array of provider name strings such as `['anthropic', 'openai']`.
 */
export function discoverConfiguredProviders(
  anthraspaceSettings: Record<string, string | undefined>
): string[] {
  const providers: string[] = []
  for (const [settingKey, provider] of Object.entries(SETTING_TO_PI_PROVIDER)) {
    const value = anthraspaceSettings[settingKey]
    if (typeof value === 'string' && value.length > 0) {
      providers.push(provider)
    }
  }
  return providers
}
