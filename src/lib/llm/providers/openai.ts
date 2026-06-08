import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

export function createOpenAIProvider(apiKey: string, modelName?: string): LLMProvider {
  const openai = createOpenAI({ apiKey })
  const model = modelName ?? 'gpt-4o-mini'
  return {
    name: 'openai',
    async generateText(prompt, options) {
      const { text } = await generateText({
        model: openai.chat(model),
        prompt,
        maxOutputTokens: options?.maxTokens ?? 200,
        timeout: options?.timeout,
      })
      return text
    },
  }
}
