import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'
import './globals.css'
import { ToastProvider } from '@/components/toast'

export const metadata: Metadata = {
  title: 'Logistics Tracking Dashboard',
  description: 'Track your packages in real time',
}

export const viewport: Viewport = {
  themeColor: '#F9FAFB',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
