import type { Note } from '../types'
import { createId } from './state'

/** Pasted images are stored as files and embedded as `note-image://local/<file>`. */
export const noteImageScheme = 'note-image'

export const noteImageTypes: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif'
}

const imageFilePattern = /^[a-f0-9-]{36}\.(webp|png|jpg|gif)$/

export function isNoteImageFile(file: string): boolean {
  return imageFilePattern.test(file)
}

export function noteImageUrl(file: string): string {
  return `${noteImageScheme}://local/${file}`
}

/** The image file a `note-image://` URL points at, ignoring any retry query. */
export function noteImageFileFromUrl(url: string): string | null {
  const match = /^note-image:\/\/local\/([^?#]+)/.exec(url)
  return match && isNoteImageFile(match[1]) ? match[1] : null
}

/** Every image file a note's markup references, in order, without duplicates. */
export function noteImageFiles(html: string): string[] {
  const files = new Set<string>()
  for (const match of html.matchAll(/note-image:\/\/local\/([a-f0-9-]{36}\.(?:webp|png|jpg|gif))/g))
    files.add(match[1])
  return [...files]
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }

/** Plain text of a note body, with block boundaries turned into newlines. */
export function notePlainText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/h[1-3]|\/li|\/blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => entities[name])
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

export function noteDisplayTitle(note: Note): string {
  return note.title.trim() || notePlainText(note.html).split('\n')[0]?.trim() || 'New note'
}

/** Body text shown under the title in the list, skipping the line already used as the title. */
export function notePreview(note: Note): string {
  const lines = notePlainText(note.html).split('\n').filter(Boolean)
  return (note.title.trim() ? lines : lines.slice(1)).join(' ').slice(0, 180)
}

export function noteIsEmpty(note: Note): boolean {
  return !note.title.trim() && !notePlainText(note.html) && noteImageFiles(note.html).length === 0
}

export function createNote(now = new Date().toISOString()): Note {
  return { id: createId('note'), title: '', html: '', pinned: false, createdAt: now, updatedAt: now }
}

/** Pinned notes first, then the most recently edited. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)
  )
}

export function searchNotes(notes: Note[], query: string): Note[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return notes
  return notes.filter((note) =>
    `${note.title}\n${notePlainText(note.html)}`.toLowerCase().includes(needle)
  )
}

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

/** "Just now", "12m ago", "3h ago", "Yesterday", "Tue", or "Sep 3". */
export function noteTimeLabel(iso: string, now = Date.now()): string {
  const then = new Date(iso)
  const minutes = Math.floor((now - then.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = Math.ceil((today.getTime() - then.getTime()) / 86_400_000)
  if (days <= 0) return `${Math.floor(minutes / 60)}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekday.format(then)
  return shortDate.format(then)
}
