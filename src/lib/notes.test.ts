import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import {
  noteDisplayTitle,
  noteImageFileFromUrl,
  noteImageFiles,
  noteIsEmpty,
  notePlainText,
  notePreview,
  noteTimeLabel,
  searchNotes,
  sortNotes
} from './notes'

const file = '3f2c1a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f.webp'

const note = (patch: Partial<Note> = {}): Note => ({
  id: 'note-1',
  title: '',
  html: '',
  pinned: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...patch
})

describe('notes', () => {
  it('finds referenced images once and ignores other sources', () => {
    const html = `<p>a<img src="note-image://local/${file}"></p><img src="note-image://local/${file}?r=2"><img src="https://example.com/x.png">`
    expect(noteImageFiles(html)).toEqual([file])
    expect(noteImageFileFromUrl(`note-image://local/${file}?r=2`)).toBe(file)
    expect(noteImageFileFromUrl('note-image://local/../secrets.webp')).toBeNull()
  })

  it('turns markup into readable plain text', () => {
    expect(notePlainText('<h1>Trip</h1><ul><li>Pack &amp; go</li><li>Tickets</li></ul><p><br></p>')).toBe(
      'Trip\nPack & go\nTickets'
    )
  })

  it('uses the first line as the title when none is set', () => {
    const untitled = note({ html: '<p>Groceries</p><p>milk, eggs</p>' })
    expect(noteDisplayTitle(untitled)).toBe('Groceries')
    expect(notePreview(untitled)).toBe('milk, eggs')
    expect(notePreview(note({ title: 'List', html: '<p>Groceries</p>' }))).toBe('Groceries')
  })

  it('treats a note with only an image as not empty', () => {
    expect(noteIsEmpty(note({ html: '<p><br></p>' }))).toBe(true)
    expect(noteIsEmpty(note({ html: `<p><img src="note-image://local/${file}"></p>` }))).toBe(false)
  })

  it('sorts pinned first, then most recent, and searches body text', () => {
    const notes = [
      note({ id: 'old', updatedAt: '2026-09-01T00:00:00.000Z', html: '<p>ideas for the garden</p>' }),
      note({ id: 'new', updatedAt: '2026-09-03T00:00:00.000Z' }),
      note({ id: 'pinned', pinned: true, updatedAt: '2026-08-01T00:00:00.000Z' })
    ]
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['pinned', 'new', 'old'])
    expect(searchNotes(notes, 'GARDEN').map((n) => n.id)).toEqual(['old'])
  })
})

describe('noteTimeLabel', () => {
  const now = new Date(2026, 8, 24, 15, 0).getTime()
  it('reads naturally', () => {
    expect(noteTimeLabel(new Date(now - 20_000).toISOString(), now)).toBe('Just now')
    expect(noteTimeLabel(new Date(now - 12 * 60_000).toISOString(), now)).toBe('12m ago')
    expect(noteTimeLabel(new Date(2026, 8, 24, 9, 0).toISOString(), now)).toBe('6h ago')
    expect(noteTimeLabel(new Date(2026, 8, 23, 22, 0).toISOString(), now)).toBe('Yesterday')
    expect(noteTimeLabel(new Date(2026, 8, 20, 12, 0).toISOString(), now)).toBe('Sun')
    expect(noteTimeLabel(new Date(2026, 7, 3, 12, 0).toISOString(), now)).toBe('Aug 3')
  })
})
