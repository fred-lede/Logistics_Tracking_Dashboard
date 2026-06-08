import type { LLMProvider } from './types'

const providers = new Map<string, LLMProvider>()

export function registerLLMProvider(name: string, provider: LLMProvider): void {
  providers.set(name, provider)
}

export function getLLMProvider(name: string): LLMProvider | undefined {
  return providers.get(name)
}
