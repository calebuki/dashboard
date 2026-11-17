import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const buildPath = (name) => fileURLToPath(new URL(`../build/${name}`, import.meta.url))

const source = await readFile(buildPath('icon.svg'))
await sharp(source).resize(1024, 1024).png().toFile(buildPath('icon.png'))

// Tray icons are drawn on a 16px grid and rendered at 1x and 2x. Electron can't decode SVG,
// so the main process loads these PNGs.
for (const name of ['tray', 'trayTemplate']) {
  const tray = await readFile(buildPath(`${name}.svg`))
  for (const [suffix, size] of [['', 16], ['@2x', 32]]) {
    await sharp(tray, { density: (72 * size) / 16 })
      .resize(size, size)
      .png()
      .toFile(buildPath(`${name}${suffix}.png`))
  }
}

if (process.platform === 'darwin') {
  const iconset = buildPath('icon.iconset')
  await rm(iconset, { recursive: true, force: true })
  await mkdir(iconset, { recursive: true })
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(source).resize(size, size).png().toFile(`${iconset}/icon_${size}x${size}.png`)
    await sharp(source)
      .resize(size * 2, size * 2)
      .png()
      .toFile(`${iconset}/icon_${size}x${size}@2x.png`)
  }
  await promisify(execFile)('iconutil', ['-c', 'icns', iconset, '-o', buildPath('icon.icns')])
  await rm(iconset, { recursive: true, force: true })
} else {
  // No iconutil here: write the PNG-backed entries iconutil produces (32px to 1024px).
  const entries = [
    ['ic11', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic13', 256],
    ['ic08', 256],
    ['ic14', 512],
    ['ic09', 512],
    ['ic10', 1024]
  ]
  const chunks = []
  for (const [type, size] of entries) {
    const png = await sharp(source).resize(size, size).png().toBuffer()
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    chunks.push(header, png)
  }
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  await writeFile(buildPath('icon.icns'), Buffer.concat([header, body]))
}

console.log('Generated build/icon.png, build/icon.icns and the tray icons')
