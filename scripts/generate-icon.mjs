import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const source = await readFile(new URL('../build/icon.svg', import.meta.url))
await sharp(source).resize(1024, 1024).png().toFile(fileURLToPath(new URL('../build/icon.png', import.meta.url)))
console.log('Generated build/icon.png')
