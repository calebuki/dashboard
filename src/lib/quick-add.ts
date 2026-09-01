import { casual } from 'chrono-node'
import { addDays, todayKey } from './date'

export interface ParsedQuickTask {
  title: string
  dueDate: string
  dueTime: string
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toTimeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function parseQuickTask(input: string, reference = new Date()): ParsedQuickTask {
  const trimmed = input.trim()
  const result = casual.parse(trimmed, reference, { forwardDate: true })[0]
  if (!result) return { title: trimmed, dueDate: toDateKey(reference), dueTime: '' }

  const title =
    `${trimmed.slice(0, result.index)} ${trimmed.slice(result.index + result.text.length)}`
      .replace(/\s+([,.;!?])/g, '$1')
      .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
      .replace(/\s{2,}/g, ' ')

  return {
    title: title || trimmed,
    dueDate: toDateKey(result.start.date()),
    dueTime: result.start.isCertain('hour') ? toTimeKey(result.start.date()) : ''
  }
}

export function parseFlexibleTime(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, '')
  if (!value) return ''
  const match = value.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3]
  if (minute > 59 || hour > (meridiem ? 12 : 23) || (hour === 0 && meridiem)) return null
  if (meridiem === 'pm' && hour !== 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function nextWeekend(from = todayKey()): string {
  const date = new Date(`${from}T12:00:00`)
  const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7
  return addDays(from, daysUntilSaturday)
}
