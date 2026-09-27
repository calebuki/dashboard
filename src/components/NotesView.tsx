import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Pin,
  Plus,
  Search,
  Strikethrough,
  Trash2,
  Underline,
  X
} from 'lucide-react'
import type { Note } from '../types'
import { prepareImage, sanitizeNoteHtml } from '../lib/note-html'
import {
  noteDisplayTitle,
  noteImageFiles,
  noteImageUrl,
  notePreview,
  noteTimeLabel,
  searchNotes,
  sortNotes
} from '../lib/notes'
import { spring } from './primitives'
import { cn } from '@/lib/utils'

export function NotesView({
  notes,
  openId,
  synced,
  now,
  onOpen,
  onCreate,
  onClose,
  onChange,
  onDelete,
  onError
}: {
  notes: Note[]
  openId: string | null
  synced: boolean
  now: number
  onOpen: (id: string) => void
  onCreate: () => void
  onClose: () => void
  onChange: (id: string, patch: Partial<Pick<Note, 'title' | 'html' | 'pinned'>>) => void
  onDelete: (note: Note) => void
  onError: (message: string) => void
}) {
  const open = openId ? notes.find((note) => note.id === openId) : undefined
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {open ? (
        <motion.section
          key="editor"
          className="view note-editor-view"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24, transition: { duration: 0.12 } }}
          transition={spring}
        >
          <NoteEditor
            key={open.id}
            note={open}
            now={now}
            onBack={onClose}
            onChange={(patch) => onChange(open.id, patch)}
            onDelete={() => onDelete(open)}
            onError={onError}
          />
        </motion.section>
      ) : (
        <motion.div
          key="list"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24, transition: { duration: 0.12 } }}
          transition={spring}
        >
          <NoteList notes={notes} synced={synced} now={now} onOpen={onOpen} onCreate={onCreate} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function NoteList({
  notes,
  synced,
  now,
  onOpen,
  onCreate
}: {
  notes: Note[]
  synced: boolean
  now: number
  onOpen: (id: string) => void
  onCreate: () => void
}) {
  const [query, setQuery] = useState('')
  const shown = sortNotes(searchNotes(notes, query))
  const count = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`

  return (
    <section className="view notes-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Jot it down</p>
          <h1>Notes</h1>
          <p className="view-sub">
            {notes.length
              ? `${count} · ${synced ? 'synced across your computers' : 'saved on this computer'}`
              : 'Ideas, lists, and screenshots — all in one place.'}
          </p>
        </div>
        <motion.button type="button" className="soft-button" onClick={onCreate} whileTap={{ scale: 0.95 }}>
          <Plus size={14} /> New
        </motion.button>
      </header>

      {notes.length > 0 && (
        <label className="notes-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
              <X size={13} />
            </button>
          )}
        </label>
      )}

      {notes.length === 0 ? (
        <div className="empty">
          <div className="empty-art" aria-hidden>
            <i />
            <i />
            <i />
          </div>
          <strong>No notes yet</strong>
          <span>
            Write things down, make a checklist, or paste a screenshot. Press <kbd>N</kbd> to start one.
          </span>
        </div>
      ) : shown.length === 0 ? (
        <p className="notes-none">Nothing matches “{query.trim()}”.</p>
      ) : (
        <div className="note-list">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((note) => (
              <NoteCard key={note.id} note={note} now={now} onOpen={() => onOpen(note.id)} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}

const NoteCard = forwardRef<HTMLButtonElement, { note: Note; now: number; onOpen: () => void }>(
  function NoteCard({ note, now, onOpen }, ref) {
    const preview = notePreview(note)
    const image = noteImageFiles(note.html)[0]
    return (
      <motion.button
        ref={ref}
        type="button"
        layout
        className="note-card"
        onClick={onOpen}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={spring}
      >
        <span className="note-card-copy">
          <strong>
            {note.pinned && <Pin size={11} className="note-pin" aria-label="Pinned" />}
            {noteDisplayTitle(note)}
          </strong>
          <span className="note-card-preview">{preview || (image ? 'Image' : 'No additional text')}</span>
          <small>{noteTimeLabel(note.updatedAt, now)}</small>
        </span>
        {image && <img className="note-thumb" src={noteImageUrl(image)} alt="" draggable={false} />}
      </motion.button>
    )
  }
)

// ───────────────────────── Editor ─────────────────────────

type Block = 'h1' | 'h2' | 'h3' | 'p'

const sizes: { value: Block; label: string }[] = [
  { value: 'h1', label: 'Title' },
  { value: 'h2', label: 'Heading' },
  { value: 'h3', label: 'Subheading' },
  { value: 'p', label: 'Body' }
]

interface Formats {
  block: Block
  bold: boolean
  italic: boolean
  underline: boolean
  strikeThrough: boolean
  list: 'ul' | 'ol' | 'check' | null
}

const noFormats: Formats = {
  block: 'p',
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  list: null
}

const mod = window.dashboard?.platform === 'darwin' ? '⌘' : 'Ctrl+'

function NoteEditor({
  note,
  now,
  onBack,
  onChange,
  onDelete,
  onError
}: {
  note: Note
  now: number
  onBack: () => void
  onChange: (patch: Partial<Pick<Note, 'title' | 'html' | 'pinned'>>) => void
  onDelete: () => void
  onError: (message: string) => void
}) {
  const body = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const emitted = useRef<string | null>(null)
  const pending = useRef<number | null>(null)
  const savedRange = useRef<Range | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [formats, setFormats] = useState<Formats>(noFormats)

  const refreshEmpty = useCallback(() => {
    const el = body.current
    if (el) el.classList.toggle('is-empty', !el.textContent?.trim() && !el.querySelector('img, li'))
  }, [])

  const flush = useCallback(() => {
    if (pending.current === null) return
    clearTimeout(pending.current)
    pending.current = null
    const el = body.current
    if (!el) return
    const html = sanitizeNoteHtml(el.innerHTML)
    if (html === emitted.current) return
    emitted.current = html
    onChangeRef.current({ html })
  }, [])

  const changed = useCallback(
    (immediate = false) => {
      refreshEmpty()
      if (pending.current !== null) clearTimeout(pending.current)
      pending.current = window.setTimeout(flush, 300)
      if (immediate) flush()
    },
    [flush, refreshEmpty]
  )

  // Load the note, and take in edits synced from another computer unless we're mid-edit.
  useLayoutEffect(() => {
    const el = body.current
    if (!el || pending.current !== null || note.html === emitted.current) return
    const clean = sanitizeNoteHtml(note.html)
    if (clean !== el.innerHTML) el.innerHTML = clean
    emitted.current = note.html
    refreshEmpty()
  }, [note.html, refreshEmpty])

  useEffect(() => () => flush(), [flush])

  const startsEmpty = useRef(!note.title && !note.html)
  useEffect(() => {
    // Chromium's list commands nest lists inside <p> lines, but handle <div> lines cleanly.
    document.execCommand('defaultParagraphSeparator', false, 'div')
    if (startsEmpty.current) document.getElementById('note-title')?.focus()
  }, [])

  // An image synced from another computer can arrive a moment after its note; retry a few times.
  useEffect(() => {
    const el = body.current
    if (!el) return
    const onError = (event: Event) => {
      const image = event.target as HTMLImageElement
      if (image.tagName !== 'IMG') return
      const attempt = Number(image.dataset.retry ?? 0) + 1
      if (attempt > 4) return
      image.dataset.retry = String(attempt)
      window.setTimeout(() => {
        image.src = `${image.src.split('?')[0]}?r=${attempt}`
      }, attempt * 2500)
    }
    el.addEventListener('error', onError, true)
    return () => el.removeEventListener('error', onError, true)
  }, [])

  const currentList = () => {
    const node = window.getSelection()?.anchorNode
    const element = node instanceof Element ? node : node?.parentElement
    const list = element?.closest('ul, ol')
    return list && body.current?.contains(list) ? (list as HTMLUListElement | HTMLOListElement) : null
  }

  const refreshFormats = useCallback(() => {
    const selection = window.getSelection()
    const el = body.current
    if (!el || !selection?.anchorNode || !el.contains(selection.anchorNode)) return
    savedRange.current = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    const block = document.queryCommandValue('formatBlock').toLowerCase()
    const list = currentList()
    setFormats({
      block: (['h1', 'h2', 'h3'].includes(block) ? block : 'p') as Block,
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      list: !list
        ? null
        : list.tagName === 'OL'
          ? 'ol'
          : list.classList.contains('checklist')
            ? 'check'
            : 'ul'
    })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshFormats)
    return () => document.removeEventListener('selectionchange', refreshFormats)
  }, [refreshFormats])

  /** Put the caret back where it was before a toolbar click or an image upload. */
  const restoreSelection = () => {
    const el = body.current
    if (!el) return
    el.focus()
    const selection = window.getSelection()
    const range = savedRange.current
    if (!selection) return
    selection.removeAllRanges()
    if (range && el.contains(range.startContainer)) selection.addRange(range)
    else {
      const end = document.createRange()
      end.selectNodeContents(el)
      end.collapse(false)
      selection.addRange(end)
    }
  }

  const exec = (command: string, value?: string) => {
    restoreSelection()
    document.execCommand(command, false, value)
    changed()
    refreshFormats()
  }

  const setBlock = (block: Block) =>
    exec('formatBlock', block === 'p' || block === formats.block ? 'div' : block)

  const toggleBullets = () => {
    const list = currentList()
    if (list?.classList.contains('checklist')) {
      list.classList.remove('checklist')
      list.querySelectorAll('li[data-checked]').forEach((item) => item.removeAttribute('data-checked'))
      changed()
      refreshFormats()
    } else exec('insertUnorderedList')
  }

  const toggleChecklist = () => {
    const list = currentList()
    if (list?.classList.contains('checklist')) {
      exec('insertUnorderedList')
      return
    }
    if (!list || list.tagName === 'OL') exec('insertUnorderedList')
    currentList()?.classList.add('checklist')
    changed()
    refreshFormats()
  }

  const insertImages = async (files: File[]) => {
    for (const file of files) {
      try {
        const { data, type } = await prepareImage(file)
        const url = await window.dashboard.saveNoteImage(data, type)
        restoreSelection()
        document.execCommand('insertHTML', false, `<img src="${url}" alt="">`)
        refreshFormats()
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        // IPC errors arrive as "Error invoking remote method '…': Error: <reason>".
        onError(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Could not add that image.')
      }
    }
    changed(true)
  }

  const imagesIn = (list: FileList | null | undefined) =>
    [...(list ?? [])].filter((file) => file.type.startsWith('image/'))

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const images = imagesIn(event.clipboardData.files)
    if (images.length) {
      void insertImages(images)
      return
    }
    const html = sanitizeNoteHtml(event.clipboardData.getData('text/html'))
    const text = event.clipboardData.getData('text/plain')
    if (html.replace(/<[^>]+>/g, '').trim() || html.includes('<img'))
      document.execCommand('insertHTML', false, html)
    else if (text) document.execCommand('insertText', false, text)
    changed()
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const images = imagesIn(event.dataTransfer.files)
    if (!images.length) return
    event.preventDefault()
    const range = document.caretRangeFromPoint(event.clientX, event.clientY)
    if (range) savedRange.current = range
    void insertImages(images)
  }

  const onInput = (event: FormEvent<HTMLDivElement>) => {
    // A new checklist item starts unchecked, even when Enter was pressed on a checked one.
    if ((event.nativeEvent as InputEvent).inputType === 'insertParagraph') {
      const node = window.getSelection()?.anchorNode
      const item = (node instanceof Element ? node : node?.parentElement)?.closest('li')
      if (item?.hasAttribute('data-checked') && !item.textContent?.trim()) item.removeAttribute('data-checked')
    }
    changed()
  }

  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    // The checkbox is drawn in the item's left gutter.
    const item = (event.target as HTMLElement).closest('ul.checklist > li')
    if (!item || event.clientX >= item.getBoundingClientRect().left) return
    event.preventDefault()
    item.toggleAttribute('data-checked')
    if (item.hasAttribute('data-checked')) item.setAttribute('data-checked', 'true')
    changed(true)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      flush()
      onBack()
    } else if (event.key === 'Tab' && currentList()) {
      event.preventDefault()
      document.execCommand(event.shiftKey ? 'outdent' : 'indent')
      changed()
    }
  }

  const back = () => {
    flush()
    onBack()
  }

  return (
    <div className="note-editor">
      <header className="note-bar">
        <button type="button" className="ghost-button note-back" onClick={back}>
          <ChevronLeft size={15} /> Notes
        </button>
        <small className="note-edited">Edited {noteTimeLabel(note.updatedAt, now).toLowerCase()}</small>
        <button
          type="button"
          className={cn('icon-button subtle', note.pinned && 'on')}
          aria-pressed={note.pinned}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          title={note.pinned ? 'Unpin' : 'Pin to top'}
          onClick={() => onChange({ pinned: !note.pinned })}
        >
          <Pin size={14} />
        </button>
        <button
          type="button"
          className="icon-button subtle note-delete"
          aria-label="Delete note"
          title="Delete note"
          onClick={() => {
            flush()
            onDelete()
          }}
        >
          <Trash2 size={14} />
        </button>
      </header>

      <input
        id="note-title"
        className="note-title"
        value={note.title}
        placeholder="Title"
        aria-label="Note title"
        onChange={(event) => onChange({ title: event.target.value })}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === 'ArrowDown') && body.current) {
            event.preventDefault()
            const start = document.createRange()
            start.setStart(body.current, 0)
            savedRange.current = start
            restoreSelection()
          } else if (event.key === 'Escape') back()
        }}
      />

      <div className="note-toolbar" role="toolbar" aria-label="Formatting" onMouseDown={(e) => e.preventDefault()}>
        <SizeMenu value={formats.block} onChange={setBlock} />
        <span className="note-toolbar-gap" />
        <ToolButton label={`Bold (${mod}B)`} active={formats.bold} onClick={() => exec('bold')}>
          <Bold size={14} strokeWidth={2.6} />
        </ToolButton>
        <ToolButton label={`Italic (${mod}I)`} active={formats.italic} onClick={() => exec('italic')}>
          <Italic size={14} />
        </ToolButton>
        <ToolButton label={`Underline (${mod}U)`} active={formats.underline} onClick={() => exec('underline')}>
          <Underline size={14} />
        </ToolButton>
        <ToolButton label="Strikethrough" active={formats.strikeThrough} onClick={() => exec('strikeThrough')}>
          <Strikethrough size={14} />
        </ToolButton>
        <span className="note-toolbar-gap" />
        <ToolButton label="Bulleted list" active={formats.list === 'ul'} onClick={toggleBullets}>
          <List size={15} />
        </ToolButton>
        <ToolButton label="Numbered list" active={formats.list === 'ol'} onClick={() => exec('insertOrderedList')}>
          <ListOrdered size={15} />
        </ToolButton>
        <ToolButton label="Checklist" active={formats.list === 'check'} onClick={toggleChecklist}>
          <ListChecks size={15} />
        </ToolButton>
        <span className="note-toolbar-gap" />
        <ToolButton label="Add image (or paste one)" onClick={() => fileInput.current?.click()}>
          <ImagePlus size={15} />
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(event) => {
            const images = imagesIn(event.target.files)
            event.target.value = ''
            if (images.length) void insertImages(images)
          }}
        />
      </div>

      <div
        ref={body}
        className="note-body is-empty"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Note"
        data-placeholder="Start writing, or paste an image…"
        spellCheck
        onInput={onInput}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(event) => {
          if ([...event.dataTransfer.items].some((item) => item.kind === 'file')) event.preventDefault()
        }}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
        onBlur={flush}
      />
    </div>
  )
}

function ToolButton({
  label,
  active,
  onClick,
  children
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={cn('tool-button', active && 'active')}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function SizeMenu({ value, onChange }: { value: Block; onChange: (block: Block) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  const current = sizes.find((size) => size.value === value) ?? sizes[3]
  return (
    <div className="size-menu" ref={root}>
      <button
        type="button"
        className={cn('tool-button size-trigger', open && 'active')}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Text size"
        onClick={() => setOpen((v) => !v)}
      >
        {current.label}
        <ChevronDown size={12} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className="size-options"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.1 } }}
            transition={spring}
          >
            {sizes.map((size) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={size.value === value}
                key={size.value}
                className={`size-${size.value}`}
                onClick={() => {
                  setOpen(false)
                  onChange(size.value)
                }}
              >
                {size.label}
                {size.value === value && <Check size={13} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
