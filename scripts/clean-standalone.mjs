import { existsSync, unlinkSync, rmSync, readdirSync } from 'fs'
import { join } from 'path'

const dir = '.next/standalone'
if (!existsSync(dir)) process.exit(0)

for (const name of readdirSync(dir)) {
  const full = join(dir, name)

  // skip required directories
  if (['.next', 'node_modules', 'public', 'electron', 'prisma', 'messages', 'assets'].includes(name)) continue
  if (name === 'package.json') continue
  if (name === 'server.js') continue

  // dev.db*
  if (name.startsWith('dev.db')) {
    unlinkSync(full)
    continue
  }

  // env files
  if (name.startsWith('.env') || name === '.carrier-creds.json') {
    rmSync(full, { recursive: true, force: true })
    continue
  }

  // everything else: release, docs, src, scripts, AGENTS.md, etc.
  rmSync(full, { recursive: true, force: true })
}
