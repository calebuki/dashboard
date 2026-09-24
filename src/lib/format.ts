import { addDays, formatShortDate, fromDateKey, todayKey } from './date'

export function timeLabel(time?: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function timeRangeLabel(time: string | undefined, minutes: number): string {
  if (!time) return ''
  const end = addMinutesToTime(time, minutes)
  const sameHalf = Number(time.slice(0, 2)) >= 12 === Number(end.slice(0, 2)) >= 12
  const start = timeLabel(time)
  return `${sameHalf ? start.replace(/am|pm/, '') : start}–${timeLabel(end)}`
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function relativeDayLabel(dateKey: string, today = todayKey()): string {
  if (dateKey === today) return 'Today'
  if (dateKey === addDays(today, 1)) return 'Tomorrow'
  if (dateKey === addDays(today, -1)) return 'Yesterday'
  const diff = (fromDateKey(dateKey).getTime() - fromDateKey(today).getTime()) / 86_400_000
  if (diff > 0 && diff < 7)
    return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(fromDateKey(dateKey))
  return formatShortDate(dateKey)
}

export function reminderLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'No reminder'
  if (minutes === 0) return 'At start'
  if (minutes < 60) return `${minutes} min before`
  if (minutes < 1440) return `${minutes / 60} hr before`
  return `${minutes / 1440} day before`
}

export function countdown(seconds: number): string {
  const safe = Math.max(0, seconds)
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
