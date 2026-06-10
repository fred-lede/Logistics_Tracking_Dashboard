import { NextResponse } from 'next/server'
import { dryRunSqliteToPostgres, migrateSqliteToPostgres } from '@/lib/db/migration'
import { requireLocalRequest } from '@/lib/request-access'

export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const body = await request.json().catch(() => ({})) as { mode?: string }

  try {
    const result = body.mode === 'execute'
      ? await migrateSqliteToPostgres()
      : await dryRunSqliteToPostgres()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
