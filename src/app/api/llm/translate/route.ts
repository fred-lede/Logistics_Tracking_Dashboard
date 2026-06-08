import { NextResponse } from 'next/server'
import { translateSummary } from '@/lib/llm/service'

export async function POST(request: Request) {
  const body = await request.json()
  const { items, locale } = body as { items: { id: string; summary: string | null; rootCause: string | null }[]; locale: string }

  if (!Array.isArray(items) || !locale || locale === 'en') {
    return NextResponse.json({ items: [] })
  }

  const results = await Promise.all(
    items.map(async (item) => {
      const [translatedSummary, translatedRootCause] = await Promise.all([
        item.summary ? translateSummary(item.summary, locale).catch(() => item.summary) : null,
        item.rootCause ? translateSummary(item.rootCause, locale).catch(() => item.rootCause) : null,
      ])
      return {
        id: item.id,
        summary: translatedSummary,
        rootCause: translatedRootCause,
      }
    }),
  )

  return NextResponse.json({ items: results })
}
