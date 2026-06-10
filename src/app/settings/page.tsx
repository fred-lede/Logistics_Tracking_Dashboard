import { headers } from 'next/headers'
import { SettingsPage } from '@/components/settings/settings-page'
import { isLocalRequest } from '@/lib/request-access'
import Link from 'next/link'

export default async function SettingsRoute() {
  const requestHeaders = await headers()
  if (!isLocalRequest(requestHeaders)) {
    return (
      <div id="main-content" className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Read-only dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">Settings are available only on the host computer.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-fedex-purple hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return <div id="main-content"><SettingsPage /></div>
}
