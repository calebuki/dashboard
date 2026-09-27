import { noteImageFileFromUrl, noteImageUrl } from './notes'

// Browser-only helpers for the note editor (they need the DOM and canvas).

const keptTags = new Set([
  'P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL',
  'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'IMG'
])
const droppedTags = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'META', 'LINK',
  'TITLE', 'HEAD', 'NOSCRIPT', 'CANVAS', 'VIDEO', 'AUDIO', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'
])
const headings: Record<string, string> = { H4: 'H3', H5: 'H3', H6: 'H3' }

function clean(node: Node, doc: Document): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [doc.createTextNode(node.textContent ?? '')]
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const element = node as Element
  const tag = headings[element.tagName] ?? element.tagName
  if (droppedTags.has(tag)) return []
  const children = [...element.childNodes].flatMap((child) => clean(child, doc))
  if (!keptTags.has(tag)) return children
  // Google Docs wraps whole pastes in <b style="font-weight:normal">.
  if ((tag === 'B' || tag === 'STRONG') && /font-weight:\s*(normal|[1-4]00)/.test(element.getAttribute('style') ?? ''))
    return children

  if (tag === 'IMG') {
    // Only images this app stored; remote or inline images are left out.
    const file = noteImageFileFromUrl(element.getAttribute('src') ?? '')
    if (!file) return []
    const image = doc.createElement('img')
    image.setAttribute('src', noteImageUrl(file))
    image.setAttribute('alt', '')
    return [image]
  }

  const copy = doc.createElement(tag)
  if (tag === 'UL' && element.classList.contains('checklist')) copy.className = 'checklist'
  if (tag === 'LI' && element.getAttribute('data-checked') === 'true')
    copy.setAttribute('data-checked', 'true')
  copy.append(...children)
  return [copy]
}

/**
 * Keeps only the handful of formats the editor offers and strips every attribute, style,
 * and script. Used for pasted HTML and for anything the editor saves or loads.
 */
export function sanitizeNoteHtml(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const out = doc.createElement('div')
  out.append(...[...doc.body.childNodes].flatMap((node) => clean(node, doc)))
  return out.innerHTML
}

const maxEdge = 1800

/**
 * Shrinks a pasted image to a sensible size and re-encodes it as WebP, which keeps synced
 * notes quick. GIFs keep their animation and are stored as-is.
 */
export async function prepareImage(file: Blob): Promise<{ data: ArrayBuffer; type: string }> {
  if (file.type === 'image/gif') return { data: await file.arrayBuffer(), type: file.type }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not read that image.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  if (!blob) throw new Error('Could not read that image.')
  return { data: await blob.arrayBuffer(), type: 'image/webp' }
}
