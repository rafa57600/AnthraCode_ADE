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

export type PiModelConfigInput = {
  /** Preferred IPC shape for native Pi launches. */
  modelConfig?: Partial<PiModelConfig> | null
  /** Legacy flat IPC shape; kept so older call sites still resolve safely. */
  modelProvider?: string | null
  modelName?: string | null
}

// Why: Pi SDK's getModel() only returns models in its exact registry.
// claude-sonnet-4-* does not exist under the 'anthropic' provider in Pi's
// registry — the latest Sonnet available is claude-3-7-sonnet-20250219.
// NOTE: switched to Groq for testing; revert to anthropic when user has
// an Anthropic API key configured.
// Why: llama-3.3-70b-versatile generates XML-style function calls (<function=...>)
// that Groq's API cannot reliably translate to OpenAI JSON format.
// llama-3.1-8b-instant generates proper JSON tool_calls in non-streaming mode.
export const DEFAULT_NATIVE_PI_MODEL_CONFIG = {
  modelProvider: 'groq',
  modelName: 'llama-3.1-8b-instant'
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

export function resolvePiModelConfig(model: PiModelConfigInput | null | undefined): PiModelConfig {
  if (!model) {
    return DEFAULT_NATIVE_PI_MODEL_CONFIG
  }

  // Why: new IPC callers pass a nested modelConfig object so the model payload
  // stays distinct from session lifecycle fields. Flat fields remain as a
  // compatibility shim for older renderer/preload callers.
  return (
    toPiModelConfig(model.modelConfig ?? model) ??
    toPiModelConfig(model) ??
    DEFAULT_NATIVE_PI_MODEL_CONFIG
  )
}
