/**
 * Shared model configuration for native Pi SDK sessions.
 *
 * The renderer chooses models from AnthraSpace settings, while the main process
 * resolves them through Pi's `getModel()`. Keeping aliases and defaults here
 * prevents the two sides of the IPC boundary from drifting.
 */

export type PiModelConfig = {
  modelProvider: string
  modelName: string
}

export const DEFAULT_NATIVE_PI_MODEL_CONFIG = {
  modelProvider: 'anthropic',
  modelName: 'claude-sonnet-4-20250514'
} as const satisfies PiModelConfig

export const PI_MODEL_PROVIDER_ALIASES = {
  anthropic: 'anthropic',
  claude: 'anthropic',
  google: 'google',
  gemini: 'google',
  'google-ai-studio': 'google',
  openai: 'openai',
  openrouter: 'openrouter',
  groq: 'groq',
  opencode: 'opencode',
  'opencode-go': 'opencode-go'
} as const satisfies Record<string, string>

export type PiModelProviderAlias = keyof typeof PI_MODEL_PROVIDER_ALIASES

export function mapToPiModelProvider(provider: string | null | undefined): string | null {
  const normalized = provider?.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return PI_MODEL_PROVIDER_ALIASES[normalized as PiModelProviderAlias] ?? normalized
}

export function toPiModelConfig(model: {
  modelProvider?: string | null
  modelName?: string | null
}): PiModelConfig | null {
  const modelProvider = mapToPiModelProvider(model.modelProvider)
  const modelName = model.modelName?.trim()
  if (!modelProvider || !modelName) {
    return null
  }
  return { modelProvider, modelName }
}

export function resolvePiModelConfig(
  model: { modelProvider?: string | null; modelName?: string | null } | null | undefined
): PiModelConfig {
  return model ? (toPiModelConfig(model) ?? DEFAULT_NATIVE_PI_MODEL_CONFIG) : DEFAULT_NATIVE_PI_MODEL_CONFIG
}
