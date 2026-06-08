import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzePackage, translateSummary } from '@/lib/llm/service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const pkg = await prisma.package.findUnique({ where: { id } })
  if (!pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  }

  const result = await analyzePackage(id)
  if (!result) {
    return NextResponse.json({ error: 'LLM analysis not available' }, { status: 503 })
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const localeMatch = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/)
  const locale = localeMatch?.[1] ?? 'en'

  if (locale !== 'en' && result.summary) {
    const translated = await translateSummary(result.summary, locale).catch(() => null)
    if (translated) result.summary = translated
  }
  if (locale !== 'en' && result.rootCause) {
    const translated = await translateSummary(result.rootCause, locale).catch(() => null)
    if (translated) result.rootCause = translated
  }

  return NextResponse.json(result)
}
