import type { DashboardState, Task } from '../types'
import { addDays, toDateKey } from './date'

export interface TaskReminder {
  key: string
  title: string
  body: string
}

function reminderFor(task: Task, kind: 'tomorrow' | 'today'): TaskReminder {
  const key = `${task.id}:${task.dueDate}:${kind}`
  const time = task.dueTime ? ` at ${task.dueTime}` : ''
  return {
    key,
    title: kind === 'tomorrow' ? 'Due tomorrow' : 'Due today',
    body: `${task.title}${time}`
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
    if (task.dueDate === today) {
      const reminder = reminderFor(task, 'today')
      return sent.has(reminder.key) ? [] : [reminder]
    }
    if (task.dueDate === tomorrow) {
      const reminder = reminderFor(task, 'tomorrow')
      return sent.has(reminder.key) ? [] : [reminder]
    }
    return []
  })
}
