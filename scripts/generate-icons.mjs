import sharp from 'sharp'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(__dirname, '..', 'assets')

if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true })

const SVG_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0.2" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000" flood-opacity="0.2"/>
    </filter>
  </defs>

  <!-- Background rounded rect -->
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>

  <!-- Package box (enlarged) -->
  <g transform="translate(256, 278)" filter="url(#shadow)">
    <!-- Box top face (lid) -->
    <path d="M-145,-55 L-120,-90 L120,-90 L145,-55 Z" fill="#D4A574"/>
    <!-- Box front face -->
    <rect x="-145" y="-55" width="290" height="145" rx="10" fill="#C8956A"/>
    <!-- Box right face (depth) -->
    <path d="M145,-55 L170,-90 L170,45 L145,90 Z" fill="#B07A4E"/>
    <!-- Dividing line between front and lid -->
    <line x1="-145" y1="-55" x2="145" y2="-55" stroke="rgba(0,0,0,0.08)" stroke-width="2"/>
    <!-- Tape vertical -->
    <rect x="-9" y="-90" width="18" height="180" rx="3" fill="rgba(37,99,235,0.08)"/>
    <!-- Tape horizontal (front) -->
    <rect x="-145" y="-8" width="290" height="16" rx="3" fill="rgba(37,99,235,0.08)"/>
  </g>

  <!-- Magnifying glass overlay -->
  <g transform="translate(375, 155)">
    <!-- Glass circle -->
    <circle cx="0" cy="0" r="52" fill="none" stroke="white" stroke-width="10" opacity="0.9"/>
    <!-- Glass inner -->
    <circle cx="0" cy="0" r="40" fill="rgba(255,255,255,0.1)"/>
    <!-- Handle -->
    <line x1="38" y1="38" x2="68" y2="68" stroke="white" stroke-width="11" stroke-linecap="round" opacity="0.9"/>
    <!-- Scan lines inside glass -->
    <line x1="-28" y1="0" x2="28" y2="0" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.35"/>
    <line x1="0" y1="-28" x2="0" y2="28" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.35"/>
    <circle cx="0" cy="0" r="20" fill="none" stroke="white" stroke-width="2" opacity="0.2"/>
  </g>
</svg>`

async function generate() {
  const customIcon = join(assetsDir, 'icon.png')

  let sourceBuffer
  let sourceLabel

  if (existsSync(customIcon)) {
    sourceBuffer = await sharp(customIcon).png().toBuffer()
    sourceLabel = 'custom icon.png'
  } else {
    sourceBuffer = Buffer.from(SVG_LOGO)
    sourceLabel = 'built-in SVG'
  }

  console.log(`Generating icons from ${sourceLabel}...\n`)

  // Generate 512x512
  await sharp(sourceBuffer).resize(512, 512).png().toFile(join(assetsDir, 'icon-512.png'))

  // Generate 256x256
  await sharp(sourceBuffer).resize(256, 256).png().toFile(join(assetsDir, 'icon-256.png'))

  // Generate 32x32
  await sharp(sourceBuffer).resize(32, 32).png().toFile(join(assetsDir, 'icon-32.png'))

  // Generate 16x16 tray icon
  await sharp(sourceBuffer).resize(16, 16).png().toFile(join(assetsDir, 'tray-icon.png'))

  // Generate favicon 32x32
  await sharp(sourceBuffer).resize(32, 32).toFile(join(assetsDir, 'favicon.png'))

  console.log('✓ Icons generated in assets/')
  console.log('  icon-512.png   (512×512)')
  console.log('  icon-256.png   (256×256)')
  console.log('  icon-32.png    (32×32)')
  console.log('  tray-icon.png  (16×16)')
  console.log('  favicon.png    (32×32)')

  // Try to generate .ico for Windows (macOS sips -> ico conversion)
  try {
    execSync('which iconutil 2>/dev/null', { stdio: 'pipe' })
    // Generate iconset for macOS .icns
    const iconsetDir = join(assetsDir, 'icon.iconset')
    if (!existsSync(iconsetDir)) mkdirSync(iconsetDir)

    const sizes = [16, 32, 64, 128, 256, 512]
    for (const s of sizes) {
      await sharp(sourceBuffer).resize(s, s).png().toFile(join(iconsetDir, `icon_${s}x${s}.png`))
      if (s !== 512) {
        await sharp(sourceBuffer).resize(s * 2, s * 2).png().toFile(join(iconsetDir, `icon_${s}x${s}@2x.png`))
      }
    }

    execSync('iconutil -c icns "' + join(iconsetDir) + '" -o "' + join(assetsDir, 'icon.icns') + '"', { stdio: 'pipe' })
    execSync('rm -rf "' + iconsetDir + '"', { stdio: 'pipe' })
    console.log('  icon.icns      (macOS)')
  } catch {
    console.log('  (icon.icns skipped — iconutil not available)')
  }

  // Generate .ico via sharp (png -> ico)
  try {
    const icoBuffer = await sharp(sourceBuffer).resize(256, 256).png().toBuffer()

    const icoHeader = Buffer.alloc(6)
    icoHeader.writeUInt16LE(0, 0)     // reserved
    icoHeader.writeUInt16LE(1, 2)     // ICO type
    icoHeader.writeUInt16LE(1, 4)     // 1 image

    const icoDir = Buffer.alloc(16)
    icoDir.writeUInt8(0, 0)            // width (0 = 256)
    icoDir.writeUInt8(0, 1)            // height (0 = 256)
    icoDir.writeUInt8(0, 2)            // colors
    icoDir.writeUInt8(0, 3)            // reserved
    icoDir.writeUInt16LE(1, 4)         // planes
    icoDir.writeUInt16LE(32, 6)        // bpp
    icoDir.writeUInt32LE(icoBuffer.length, 8)  // size
    icoDir.writeUInt32LE(22, 12)       // offset

    writeFileSync(join(assetsDir, 'icon.ico'), Buffer.concat([icoHeader, icoDir, icoBuffer]))
    console.log('  icon.ico       (Windows)')
  } catch {
    console.log('  (icon.ico skipped)')
  }

  // Update favicon.ico in public/
  const publicDir = join(__dirname, '..', 'public')
  if (existsSync(publicDir)) {
    const favIco = Buffer.concat([
      Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 104, 6, 0, 0, 22, 0, 0, 0]),
      await sharp(sourceBuffer).resize(16, 16).png().toBuffer()
    ])
    writeFileSync(join(publicDir, 'favicon.ico'), favIco)
    console.log('  favicon.ico    (public/)')
  }

  console.log('\nDone!')
}

generate().catch((err) => { console.error(err); process.exit(1) })
