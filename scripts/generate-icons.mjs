import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(__dirname, '..', 'assets')

if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true })

function createSolidPNG(width, height, r, g, b, a = 255) {
  const rawData = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0
    for (let x = 0; x < width; x++) {
      const offset = y * (1 + width * 4) + 1 + x * 4
      rawData[offset] = r
      rawData[offset + 1] = g
      rawData[offset + 2] = b
      rawData[offset + 3] = a
    }
  }

  const compressed = deflateSync(rawData)

  function crc32(buf) {
    let c = 0xFFFFFFFF
    const table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let cval = n
      for (let k = 0; k < 8; k++) {
        cval = (cval & 1) ? (0xEDB88320 ^ (cval >>> 1)) : (cval >>> 1)
      }
      table[n] = cval
    }
    for (let i = 0; i < buf.length; i++) {
      c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
    }
    return (c ^ 0xFFFFFFFF) >>> 0
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type, 'ascii')
    const crcData = Buffer.concat([typeB, data])
    const crcVal = crc32(crcData)
    const crcB = Buffer.alloc(4)
    crcB.writeUInt32BE(crcVal)
    return Buffer.concat([len, typeB, data, crcB])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const iend = Buffer.alloc(0)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend),
  ])
}

const colors = {
  primary: { r: 0x4A, g: 0x90, b: 0xD9 },
  primaryDark: { r: 0x2C, g: 0x6F, b: 0xAD },
}

writeFileSync(join(assetsDir, 'tray-icon.png'), createSolidPNG(16, 16, colors.primary.r, colors.primary.g, colors.primary.b))
writeFileSync(join(assetsDir, 'icon-512.png'), createSolidPNG(512, 512, colors.primary.r, colors.primary.g, colors.primary.b))
writeFileSync(join(assetsDir, 'icon-256.png'), createSolidPNG(256, 256, colors.primary.r, colors.primary.g, colors.primary.b))

console.log('Icons generated in assets/')
console.log('  tray-icon.png  (16x16)')
console.log('  icon-512.png   (512x512)')
console.log('  icon-256.png   (256x256)')
console.log('')
console.log('Note: Replace with proper icons for production use.')
