// Generates the PWA icons. No image dependency — the artwork is simple enough
// to rasterise by hand and encode as PNG with zlib, which keeps `npm install`
// free of a native canvas build.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [13, 16, 23]
const ACCENT = [76, 141, 255]
const GLOW = [126, 210, 255]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixel) {
  // One filter byte (0 = none) per scanline, then RGB triples.
  const stride = size * 3 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size)
      const at = y * stride + 1 + x * 3
      raw[at] = r
      raw[at + 1] = g
      raw[at + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))))

/** A rift: two offset diamond halves with a bright seam between them. */
function pixel(x, y, size) {
  const u = (x / size - 0.5) * 2
  const v = (y / size - 0.5) * 2

  const diamond = Math.abs(u) + Math.abs(v * 0.78)
  if (diamond > 1.06) return BG

  // Antialias the outer edge.
  const edge = Math.min(1, (1.06 - diamond) * size * 0.06)

  // The seam is a slanted gap through the middle that glows.
  const seam = Math.abs(u * 0.35 + v)
  const inSeam = seam < 0.13
  const base = inSeam ? mix(ACCENT, GLOW, 1 - seam / 0.13) : ACCENT
  const shade = mix(base, BG, inSeam ? 0 : 0.28 + 0.32 * Math.abs(u))

  return mix(BG, shade, edge)
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(OUT, name), png(size, pixel))
  console.log(`wrote public/${name} (${size}px)`)
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0d1017"/>
  <path d="M32 6 56 32 32 58 8 32Z" fill="#4c8dff"/>
  <path d="M32 6 41 32 32 58 23 32Z" fill="#7ed2ff"/>
</svg>
`
writeFileSync(join(OUT, 'icon.svg'), svg)
console.log('wrote public/icon.svg')
