import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

export function createGoogleProvider(apiKey: string, modelName?: string): LLMProvider {
  const google = createGoogleGenerativeAI({ apiKey })
  const model = modelName ?? 'gemini-2.5-flash'
  return {
    name: 'google',
    async generateText(prompt, options) {
      const { text } = await generateText({
        model: google(model),
        prompt,
        maxOutputTokens: options?.maxTokens ?? 200,
        timeout: options?.timeout,
      })
      return text
    },
  }
}
