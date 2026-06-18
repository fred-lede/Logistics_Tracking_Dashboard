import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@whiskeysockets/baileys'],
  webpack: (config: Record<string, unknown>) => config,
}

export default withNextIntl(nextConfig)