import { mkdir, readFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const source = await readFile(new URL('../build/icon.svg', import.meta.url))
await sharp(source)
  .resize(1024, 1024)
  .png()
  .toFile(fileURLToPath(new URL('../build/icon.png', import.meta.url)))

if (process.platform === 'darwin') {
  const iconset = fileURLToPath(new URL('../build/icon.iconset', import.meta.url))
  await rm(iconset, { recursive: true, force: true })
  await mkdir(iconset, { recursive: true })
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(source).resize(size, size).png().toFile(`${iconset}/icon_${size}x${size}.png`)
    await sharp(source)
      .resize(size * 2, size * 2)
      .png()
      .toFile(`${iconset}/icon_${size}x${size}@2x.png`)
  }
  await promisify(execFile)('iconutil', [
    '-c',
    'icns',
    iconset,
    '-o',
    fileURLToPath(new URL('../build/icon.icns', import.meta.url))
  ])
  await rm(iconset, { recursive: true, force: true })
}

console.log(
  `Generated build/icon.png${process.platform === 'darwin' ? ' and build/icon.icns' : ''}`
)
