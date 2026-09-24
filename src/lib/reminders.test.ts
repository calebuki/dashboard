import { describe, expect, it } from 'vitest'
import type { DashboardState, Task } from '../types'
import { pendingTaskReminders } from './reminders'

const task = (patch: Partial<Task> = {}): Task => ({
  id: 'assignment-1',
  title: 'Submit assignment',
  notes: '',
  category: 'school',
  dueDate: '2026-09-03',
  estimateMinutes: 20,
  recurrence: null,
  priority: 2,
  completed: false,
  completedDates: [],
  rollover: true,
  rolloverCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...patch
})

const state = (tasks: Task[], sentTaskReminders: string[] = []): DashboardState => ({
  version: 3,
  tasks,
  goals: [],
  settings: {
    alwaysOnTop: false,
    opacity: 1,
    overlayOpacity: 0.5,
    overlayMode: false,
    launchAtLogin: false,
    notifications: true,
    theme: 'system'
  },
  activeTimer: null,
  sentTaskReminders
})

describe('pendingTaskReminders', () => {
  it('returns a reminder the day before and on the due date', () => {
    expect(pendingTaskReminders(state([task()]), new Date(2026, 8, 2, 12))).toMatchObject([
      { key: 'assignment-1:2026-09-03:tomorrow', title: 'Due tomorrow' }
    ])
    expect(pendingTaskReminders(state([task()]), new Date(2026, 8, 3, 12))).toMatchObject([
      { key: 'assignment-1:2026-09-03:today', title: 'Due today' }
    ])
  })

  it('does not repeat a sent reminder or notify for completed work', () => {
    expect(
      pendingTaskReminders(
        state([task()], ['assignment-1:2026-09-03:tomorrow']),
        new Date(2026, 8, 2, 12)
      )
    ).toEqual([])
    expect(
      pendingTaskReminders(state([task({ completed: true })]), new Date(2026, 8, 3, 12))
    ).toEqual([])
  })

  it('sends a timed reminder inside its window and skips stale ones', () => {
    const timed = task({ dueTime: '15:30', remindBefore: 10 })
    expect(pendingTaskReminders(state([timed], ['assignment-1:2026-09-03:today']), new Date(2026, 8, 3, 15, 15))).toEqual([])
    expect(
      pendingTaskReminders(state([timed], ['assignment-1:2026-09-03:today']), new Date(2026, 8, 3, 15, 21))
    ).toMatchObject([
      { key: 'assignment-1:2026-09-03:15:30:at', title: 'In 9 min', body: 'Submit assignment · 3:30pm' }
    ])
    expect(
      pendingTaskReminders(state([timed], ['assignment-1:2026-09-03:today']), new Date(2026, 8, 3, 17, 0))
    ).toEqual([])
  })

  it('does not announce a task on the day it was created', () => {
    const fresh = task({ createdAt: new Date(2026, 8, 3, 9).toISOString() })
    expect(pendingTaskReminders(state([fresh]), new Date(2026, 8, 3, 12))).toEqual([])
  })
})
