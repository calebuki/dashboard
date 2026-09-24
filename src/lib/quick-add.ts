import { casual } from 'chrono-node'
import type { Category, RecurrenceKind } from '../types'
import { addDays, toDateKey, todayKey } from './date'

export interface ParsedQuickTask {
  title: string
  dueDate: string
  dueTime: string
  category?: Category
  recurrence?: RecurrenceKind
  important?: boolean
  /** The date/time phrase that was recognized, if any. */
  when?: string
  /** Human-readable pieces that were understood, for live preview chips. */
  tokens: string[]
}

function toTimeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const areaAliases: Record<string, Category> = {
  personal: 'personal',
  home: 'personal',
  me: 'personal',
  work: 'work',
  job: 'work',
  school: 'school',
  class: 'school',
  uni: 'school'
}

const recurrencePatterns: [RegExp, RecurrenceKind][] = [
  [/\b(every\s*day|daily|each\s+day)\b/i, 'daily'],
  [/\b(every\s+week\s*days?|week\s*days|every\s+weekday)\b/i, 'weekdays'],
  [/\b(every\s+week|weekly|each\s+week)\b/i, 'weekly']
]

const tidy = (text: string) =>
  text
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .replace(/\s{2,}/g, ' ')

export function parseQuickTask(input: string, reference = new Date()): ParsedQuickTask {
  let text = ` ${input.trim()} `
  const tokens: string[] = []
  let category: Category | undefined
  let recurrence: RecurrenceKind | undefined
  let important: boolean | undefined

  text = text.replace(/\s#(\w+)/g, (match, tag: string) => {
    const area = areaAliases[tag.toLowerCase()]
    if (!area || category) return match
    category = area
    return ' '
  })

  if (/(^|\s)!(\s|$)/.test(text) || /\s!!?\s*$/.test(text)) {
    important = true
    text = text.replace(/(^|\s)!!?(?=\s|$)/g, ' ')
    tokens.push('Important')
  }

  for (const [pattern, kind] of recurrencePatterns) {
    if (pattern.test(text)) {
      recurrence = kind
      text = text.replace(pattern, ' ')
      break
    }
  }
  // "every monday" repeats weekly; keep the weekday so the date lands on it.
  if (!recurrence) {
    text = text.replace(/\bevery\s+(mon|tue|wed|thu|fri|sat|sun)\w*/i, (_match, day: string) => {
      recurrence = 'weekly'
      return ` ${day}`
    })
  }

  const trimmed = tidy(text)
  const result = casual.parse(trimmed, reference, { forwardDate: true })[0]
  let title = trimmed
  let dueDate = toDateKey(reference)
  let dueTime = ''
  if (result) {
    title = tidy(`${trimmed.slice(0, result.index)} ${trimmed.slice(result.index + result.text.length)}`)
    dueDate = toDateKey(result.start.date())
    dueTime = result.start.isCertain('hour') ? toTimeKey(result.start.date()) : ''
    tokens.unshift(result.text)
  }
  if (recurrence) tokens.push(recurrence === 'weekdays' ? 'Weekdays' : recurrence === 'daily' ? 'Daily' : 'Weekly')
  if (category) tokens.push(`#${category}`)

  return {
    title: title || trimmed || input.trim(),
    dueDate,
    dueTime,
    ...(category ? { category } : {}),
    ...(recurrence ? { recurrence } : {}),
    ...(important ? { important } : {}),
    ...(result ? { when: result.text } : {}),
    tokens
  }
}

export function parseFlexibleTime(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, '')
  if (!value) return ''
  if (value === 'noon') return '12:00'
  if (value === 'midnight') return '00:00'
  const match = value.match(/^(\d{1,2})(?::?(\d{2}))?(a|p|am|pm)?$/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3]?.[0]
  if (minute > 59 || hour > (meridiem ? 12 : 23) || (hour === 0 && meridiem)) return null
  if (meridiem === 'p' && hour !== 12) hour += 12
  if (meridiem === 'a' && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function nextWeekend(from = todayKey()): string {
  const date = new Date(`${from}T12:00:00`)
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7
  return addDays(from, daysUntilSaturday)
}
