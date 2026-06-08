import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface ModelInfo {
  id: string
  name?: string
  size?: string
}

const TIMEOUT_MS = 30_000

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function resolveApiKey(queryKey: string | null, savedKey: string | null): Promise<string | null> {
  if (queryKey && queryKey !== '••••••••') return queryKey
  return savedKey
}

async function fetchOllamaModels(baseUrl: string): Promise<{ models: ModelInfo[]; error?: string }> {
  const base = baseUrl.replace(/\/$/, '')
  const url = base.endsWith('/api') ? `${base}/tags` : `${base}/api/tags`
  try {
    const res = await fetchWithTimeout(url)
    if (!res.ok) return { models: [], error: `Ollama returned ${res.status}` }
    const data = await res.json()
    const models: ModelInfo[] = (data.models || [])
      .filter((m: { capabilities?: string[] }) => {
        const caps = m.capabilities || []
        return caps.includes('completion') || caps.includes('tools') || caps.includes('thinking')
      })
      .map((m: { name: string; model?: string; size?: number }) => ({
        id: m.name,
        name: m.name,
        size: m.size ? formatBytes(m.size) : undefined,
      }))
    return { models }
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : 'Failed to connect to Ollama' }
  }
}

async function fetchOpenAIModels(apiKey: string): Promise<{ models: ModelInfo[]; error?: string }> {
  try {
    const res = await fetchWithTimeout('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { models: [], error: (err as { error?: { message?: string } }).error?.message || `OpenAI returned ${res.status}` }
    }
    const data = await res.json()
    const chatPattern = /^(gpt-|o[1-9]|chatgpt-)/
    const models: ModelInfo[] = (data.data || [])
      .filter((m: { id: string }) => chatPattern.test(m.id))
      .map((m: { id: string }) => ({ id: m.id, name: m.id }))
      .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
    return { models }
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : 'Failed to connect to OpenAI' }
  }
}

async function fetchAnthropicModels(apiKey: string): Promise<{ models: ModelInfo[]; error?: string }> {
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { models: [], error: (err as { error?: { message?: string } }).error?.message || `Anthropic returned ${res.status}` }
    }
    const data = await res.json()
    const models: ModelInfo[] = (data.data || [])
      .map((m: { id: string; display_name?: string }) => ({ id: m.id, name: m.display_name || m.id }))
      .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
    return { models }
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : 'Failed to connect to Anthropic' }
  }
}

async function fetchGoogleModels(apiKey: string): Promise<{ models: ModelInfo[]; error?: string }> {
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { models: [], error: (err as { error?: { message?: string } }).error?.message || `Google returned ${res.status}` }
    }
    const data = await res.json()
    const models: ModelInfo[] = (data.models || [])
      .filter((m: { supportedGenerationMethods?: string[] }) => {
        const methods = m.supportedGenerationMethods || []
        return methods.includes('generateContent')
      })
      .map((m: { name: string; displayName?: string }) => {
        const id = m.name.replace('models/', '')
        return { id, name: m.displayName || id }
      })
      .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
    return { models }
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : 'Failed to connect to Google' }
  }
}

async function fetchCustomModels(baseUrl: string, apiKey?: string | null): Promise<{ models: ModelInfo[]; error?: string }> {
  const base = baseUrl.replace(/\/$/, '')
  const url = `${base}/models`
  try {
    const headers: Record<string, string> = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const res = await fetchWithTimeout(url, { headers })
    if (!res.ok) return { models: [], error: `Custom provider returned ${res.status}` }
    const data = await res.json()
    const list = data.data || data.models || []
    const models: ModelInfo[] = list
      .map((m: { id: string; name?: string }) => ({ id: m.id, name: m.name || m.id }))
      .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id))
    return { models }
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : 'Failed to connect to custom provider' }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider') || 'openai'
  const queryApiKey = searchParams.get('apiKey')
  const queryBaseUrl = searchParams.get('baseUrl')

  const saved = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })
  const apiKey = await resolveApiKey(queryApiKey, saved?.apiKey ?? null)
  const baseUrl = queryBaseUrl || saved?.baseUrl || null

  let result: { models: ModelInfo[]; error?: string }

  switch (provider) {
    case 'ollama':
      result = await fetchOllamaModels(baseUrl || 'http://localhost:11434')
      break
    case 'openai':
      if (!apiKey) return NextResponse.json({ models: [], error: 'API key required' })
      result = await fetchOpenAIModels(apiKey)
      break
    case 'anthropic':
      if (!apiKey) return NextResponse.json({ models: [], error: 'API key required' })
      result = await fetchAnthropicModels(apiKey)
      break
    case 'google':
      if (!apiKey) return NextResponse.json({ models: [], error: 'API key required' })
      result = await fetchGoogleModels(apiKey)
      break
    case 'custom':
      if (!baseUrl) return NextResponse.json({ models: [], error: 'Base URL required' })
      result = await fetchCustomModels(baseUrl, apiKey)
      break
    default:
      result = { models: [], error: `Unknown provider: ${provider}` }
  }

  return NextResponse.json(result)
}
