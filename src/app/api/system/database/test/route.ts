import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { postgresPoolConfig } from '@/lib/db/postgres'
import { requireLocalRequest } from '@/lib/request-access'

export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const pool = new Pool(postgresPoolConfig())
  try {
    await pool.query('SELECT 1 AS ok')
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PostgreSQL connection error'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  } finally {
    await pool.end()
  }
}
