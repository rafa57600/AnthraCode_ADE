import type { TuiAgent } from './types'

export type FreeTestProviderModel = {
  id: string
  label: string
  providerLabel: string
  modelProvider: string
  modelName: string
  requiresApiKey: boolean
  freeTierNote: string
  supportedAgents: readonly TuiAgent[]
  supportedNativeTargets?: readonly FreeTestNativeTarget[]
}

export type FreeTestNativeTarget = 'pi-native'
export type FreeTestCompatibilityTarget = TuiAgent | FreeTestNativeTarget

export type FreeTestCompatibility =
  | { status: 'supported'; model: FreeTestProviderModel }
  | { status: 'disabled' }
  | { status: 'unknown-model'; selectedModelId: string }
  | { status: 'unsupported'; model: FreeTestProviderModel; target: FreeTestCompatibilityTarget }

export const FREE_TEST_PROVIDER_OFF = 'off'

export const FREE_TEST_PROVIDER_MODELS = [
  {
    id: 'gemini-ai-studio-flash',
    label: 'Gemini 2.5 Flash',
    providerLabel: 'Google AI Studio',
    modelProvider: 'google',
    modelName: 'gemini-2.5-flash',
    requiresApiKey: true,
    freeTierNote: 'Google AI Studio free-tier API key; rate limits are controlled by Google.',
    supportedAgents: ['gemini', 'pi'],
    supportedNativeTargets: ['pi-native']
  },
  {
    id: 'opencode-free',
    label: 'OpenCode free test model',
    providerLabel: 'OpenCode',
    modelProvider: 'opencode',
    modelName: 'opencode/free',
    requiresApiKey: false,
    freeTierNote: 'Uses OpenCode account entitlement when the OpenCode CLI supports it.',
    supportedAgents: ['opencode']
  },
  {
    id: 'openrouter-qwen3-coder-free',
    label: 'Qwen3 Coder free',
    providerLabel: 'OpenRouter',
    modelProvider: 'openrouter',
    modelName: 'qwen/qwen3-coder:free',
    requiresApiKey: true,
    freeTierNote: 'OpenRouter free-route model; availability and limits can change upstream.',
    supportedAgents: ['opencode', 'aider', 'continue', 'goose']
  },
  {
    id: 'groq-openai-oss-20b',
    label: 'GPT-OSS 20B',
    providerLabel: 'Groq',
    modelProvider: 'groq',
    modelName: 'openai/gpt-oss-20b',
    requiresApiKey: true,
    freeTierNote: 'Groq developer free tier; throughput and daily token limits are provider-side.',
    supportedAgents: ['aider', 'continue', 'goose']
  }
] as const satisfies readonly FreeTestProviderModel[]

export function getFreeTestProviderModel(id: string | null | undefined): FreeTestProviderModel | null {
  if (!id || id === FREE_TEST_PROVIDER_OFF) {
    return null
  }
  return FREE_TEST_PROVIDER_MODELS.find((model) => model.id === id) ?? null
}

export function isFreeTestModelSupportedByTarget(
  model: FreeTestProviderModel,
  target: FreeTestCompatibilityTarget
): boolean {
  if (target === 'pi-native') {
    return model.supportedNativeTargets?.includes(target) ?? false
  }
  return model.supportedAgents.includes(target)
}

export function getFreeTestCompatibility(args: {
  enabled?: boolean
  selectedModelId?: string | null
  target: FreeTestCompatibilityTarget
}): FreeTestCompatibility {
  if (args.enabled !== true || !args.selectedModelId || args.selectedModelId === FREE_TEST_PROVIDER_OFF) {
    return { status: 'disabled' }
  }

  const model = getFreeTestProviderModel(args.selectedModelId)
  if (!model) {
    return { status: 'unknown-model', selectedModelId: args.selectedModelId }
  }

  if (!isFreeTestModelSupportedByTarget(model, args.target)) {
    return { status: 'unsupported', model, target: args.target }
  }

  return { status: 'supported', model }
}
