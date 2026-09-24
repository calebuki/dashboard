import type { DashboardState, Task } from '../types'
import { addDays, fromDateKey, toDateKey } from './date'
import { timeLabel } from './format'

export interface TaskReminder {
  key: string
  title: string
  body: string
}

/** Timed reminders stay useful for an hour after the start time, then are skipped. */
const STALE_AFTER_MS = 60 * 60_000

function reminderFor(task: Task, kind: 'tomorrow' | 'today'): TaskReminder {
  const key = `${task.id}:${task.dueDate}:${kind}`
  const time = task.dueTime ? ` at ${timeLabel(task.dueTime)}` : ''
  return {
    key,
    title: kind === 'tomorrow' ? 'Due tomorrow' : 'Due today',
    body: `${task.title}${time}`
  }
}

function startsAt(task: Task): number | null {
  if (!task.dueTime) return null
  const [hours, minutes] = task.dueTime.split(':').map(Number)
  const date = fromDateKey(task.dueDate)
  date.setHours(hours, minutes, 0, 0)
  return date.getTime()
}

function timedReminder(task: Task, now: Date): TaskReminder | null {
  const start = startsAt(task)
  if (start === null || task.remindBefore === null || task.remindBefore === undefined) return null
  const fireAt = start - task.remindBefore * 60_000
  if (now.getTime() < fireAt || now.getTime() > start + STALE_AFTER_MS) return null
  const minutesLeft = Math.round((start - now.getTime()) / 60_000)
  const title =
    minutesLeft <= 0
      ? 'Starting now'
      : minutesLeft < 60
        ? `In ${minutesLeft} min`
        : minutesLeft < 1440
          ? `In ${Math.round(minutesLeft / 60)} hr`
          : 'Tomorrow'
  return {
    key: `${task.id}:${task.dueDate}:${task.dueTime}:at`,
    title,
    body: `${task.title} · ${timeLabel(task.dueTime)}`
  }
}

export function pendingTaskReminders(
  state: DashboardState,
  now = new Date()
): TaskReminder[] {
  const today = toDateKey(now)
  const tomorrow = addDays(today, 1)
  const sent = new Set(state.sentTaskReminders)

  return state.tasks.flatMap((task) => {
    if (task.completed || task.completedDates.includes(task.dueDate)) return []
    const reminders: TaskReminder[] = []
    // A task made today doesn't need a same-day heads-up about itself.
    const createdToday = toDateKey(new Date(task.createdAt)) === today
    if (!createdToday && task.dueDate === today) reminders.push(reminderFor(task, 'today'))
    if (!createdToday && task.dueDate === tomorrow) reminders.push(reminderFor(task, 'tomorrow'))
    const timed = timedReminder(task, now)
    if (timed) reminders.push(timed)
    return reminders.filter((reminder) => !sent.has(reminder.key))
  })
}
