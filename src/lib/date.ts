const DAY_MS = 86_400_000

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function addDays(dateKey: string, days: number): string {
  const date = fromDateKey(dateKey)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

export function daysBetween(startKey: string, endKey: string): number {
  const start = fromDateKey(startKey)
  const end = fromDateKey(endKey)
  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

export function formatLongDate(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(fromDateKey(dateKey))
}

export function formatShortDate(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(fromDateKey(dateKey))
}

export function monthTitle(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(fromDateKey(dateKey))
}

export function startOfMonth(dateKey: string): string {
  const date = fromDateKey(dateKey)
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1))
}

export function changeMonth(dateKey: string, delta: number): string {
  const date = fromDateKey(dateKey)
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + delta, 1))
}

export function calendarDays(dateKey: string): string[] {
  const first = fromDateKey(startOfMonth(dateKey))
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - cursor.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(cursor)
    day.setDate(day.getDate() + index)
    return toDateKey(day)
  })
}

export function isSameMonth(leftKey: string, rightKey: string): boolean {
  const left = fromDateKey(leftKey)
  const right = fromDateKey(rightKey)
  return left.getMonth() === right.getMonth() && left.getFullYear() === right.getFullYear()
}

export function nextDateForRecurrence(
  currentDate: string,
  kind: 'daily' | 'weekdays' | 'weekly'
): string {
  if (kind === 'daily') return addDays(currentDate, 1)
  if (kind === 'weekly') return addDays(currentDate, 7)

  let next = addDays(currentDate, 1)
  while ([0, 6].includes(fromDateKey(next).getDay())) {
    next = addDays(next, 1)
  }
  return next
}
