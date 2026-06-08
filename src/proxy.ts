import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const locales = ['en', 'zh-TW', 'zh-CN', 'es-MX']
const defaultLocale = 'en'

export function proxy(request: NextRequest) {
  const locale = request.cookies.get('locale')?.value || defaultLocale
  const validLocale = locales.includes(locale) ? locale : defaultLocale

  const response = NextResponse.next()
  response.cookies.set('locale', validLocale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return response
}

export const config = {
  matcher: '/((?!api|_next|.*\\..*).*)',
}
