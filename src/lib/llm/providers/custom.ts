import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

function createPatchedFetch(): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await globalThis.fetch(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes('/responses')) return response
    const clone = response.clone()
    try {
      const body: Record<string, unknown> = await clone.json()
      let patched = false
      if ('created' in body && !('created_at' in body)) {
        body['created_at'] = body['created']
        patched = true
      }
      if (patched) {
        return new Response(JSON.stringify(body), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }
    } catch {}
    return response
  }
}

export function createCustomProvider(
  baseUrl: string,
  modelName: string,
  apiKey?: string | null,
  label?: string | null,
  compatMode: string = 'chat',
): LLMProvider {
  const useResponses = compatMode === 'responses'
  const openai = createOpenAI({
    baseURL: baseUrl,
    apiKey: apiKey || undefined,
    ...(useResponses ? { fetch: createPatchedFetch() } : {}),
  })

  const getModel = () => {
    if (useResponses) return openai.responses(modelName)
    return openai.chat(modelName)
  }

  return {
    name: label || 'custom',
    async generateText(prompt, options) {
      const { text } = await generateText({
        model: getModel(),
        prompt,
        maxOutputTokens: options?.maxTokens ?? 200,
        timeout: options?.timeout,
      })
      return text
    },
  }
}
