import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

export function createAnthropicProvider(apiKey: string, modelName?: string): LLMProvider {
  const anthropic = createAnthropic({ apiKey })
  const model = modelName ?? 'claude-sonnet-4-20250514'
  return {
    name: 'anthropic',
    async generateText(prompt, options) {
      const { text } = await generateText({
        model: anthropic(model),
        prompt,
        maxOutputTokens: options?.maxTokens ?? 200,
        timeout: options?.timeout,
      })
      return text
    },
  }
}
