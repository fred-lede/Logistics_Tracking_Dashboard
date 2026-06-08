export interface LLMProvider {
  name: string
  generateText(prompt: string, options?: { maxTokens?: number; timeout?: number }): Promise<string>
}

export interface DelayRisk {
  level: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  suggestion: string | null
  assessedAt: string
}

export interface AnalysisResult {
  summary: string
  rootCause: string | null
  delayRisk: DelayRisk | null
}
