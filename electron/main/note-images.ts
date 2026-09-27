import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isNoteImageFile, noteImageTypes, noteImageUrl } from '../../src/lib/notes'

export const maxNoteImageBytes = 10 * 1024 * 1024

export function noteImageDir(userDataPath: string): string {
  return join(userDataPath, 'note-images')
}

export function noteImagePath(userDataPath: string, file: string): string {
  if (!isNoteImageFile(file)) throw new Error('Not a note image.')
  return join(noteImageDir(userDataPath), file)
}

export async function writeNoteImage(userDataPath: string, file: string, data: Uint8Array): Promise<void> {
  const path = noteImagePath(userDataPath, file)
  await mkdir(noteImageDir(userDataPath), { recursive: true })
  await writeFile(`${path}.tmp`, data)
  await rename(`${path}.tmp`, path)
}

/** Saves an image pasted into a note and returns the URL the note embeds. */
export async function saveNoteImage(userDataPath: string, data: ArrayBuffer, type: string): Promise<string> {
  const extension = Object.entries(noteImageTypes).find(([, mime]) => mime === type)?.[0]
  if (!extension) throw new Error('That image type is not supported.')
  if (!data || data.byteLength === 0 || data.byteLength > maxNoteImageBytes)
    throw new Error('Images must be smaller than 10 MB.')
  const file = `${randomUUID()}.${extension}`
  await writeNoteImage(userDataPath, file, new Uint8Array(data))
  return noteImageUrl(file)
}

export async function readNoteImage(userDataPath: string, file: string): Promise<Buffer | null> {
  try {
    return await readFile(noteImagePath(userDataPath, file))
  } catch {
    return null
  }
}

export function noteImageType(file: string): string {
  return noteImageTypes[file.split('.').pop() ?? ''] ?? 'application/octet-stream'
}
