import { createOllama } from 'ollama-ai-provider-v2'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

export function createOllamaProvider(baseUrl?: string, modelName?: string): LLMProvider {
  const base = (baseUrl ?? 'http://localhost:11434').replace(/\/$/, '')
  const ollama = createOllama({ baseURL: base.endsWith('/api') ? base : `${base}/api` })
  const model = modelName ?? 'gemma3:1b'
  return {
    name: 'ollama',
    async generateText(prompt, options) {
      try {
        const { text } = await generateText({
          model: ollama(model),
          prompt,
          maxOutputTokens: options?.maxTokens ?? 200,
          timeout: options?.timeout,
        })
        return text
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Not Found') || msg.includes('not found') || msg.includes('404')) {
          throw new Error(`Model "${model}" not found in Ollama. Pull it first: ollama pull ${model}`)
        }
        throw err
      }
    },
  }
}
