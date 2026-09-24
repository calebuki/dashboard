import { describe, expect, it } from 'vitest'
import type { DashboardState, Task, TaskDraft } from '../types'
import {
  applyDraft,
  createInitialState,
  rolloverTasks,
  taskFromDraft,
  taskIsCompleteOn,
  toggleTaskComplete
} from './state'

const task = (patch: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Practice',
  notes: '',
  category: 'personal',
  dueDate: '2026-08-12',
  estimateMinutes: 20,
  recurrence: null,
  priority: 2,
  completed: false,
  completedDates: [],
  rollover: true,
  rolloverCount: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...patch
})

const draft = (patch: Partial<TaskDraft> = {}): TaskDraft => ({
  title: '  Dentist  ',
  notes: '',
  category: 'personal',
  dueDate: '2026-09-25',
  dueTime: '15:30',
  estimateMinutes: 45,
  recurrence: 'none',
  priority: 2,
  remindBefore: 30,
  ...patch
})

describe('dashboard task behavior', () => {
  it('rolls an unfinished task into today and keeps its original date', () => {
    const input: DashboardState = { ...createInitialState(), tasks: [task({ dueDate: '2026-08-08' })] }

    const result = rolloverTasks(input, '2026-08-12')

    expect(result.tasks[0].dueDate).toBe('2026-08-12')
    expect(result.tasks[0].rolledOverFrom).toBe('2026-08-08')
    expect(result.tasks[0].rolloverCount).toBe(4)
  })

  it('advances a completed daily task and records its completion date', () => {
    const completed = toggleTaskComplete(task({ recurrence: { kind: 'daily' } }), '2026-08-12')

    expect(taskIsCompleteOn(completed, '2026-08-12')).toBe(true)
    expect(completed.dueDate).toBe('2026-08-13')
  })

  it('skips weekends for weekday recurrence', () => {
    const completed = toggleTaskComplete(
      task({ recurrence: { kind: 'weekdays' }, dueDate: '2026-08-14' }),
      '2026-08-14'
    )

    expect(completed.dueDate).toBe('2026-08-17')
  })

  it('creates a timed task with a reminder and drops the reminder without a time', () => {
    expect(taskFromDraft(draft())).toMatchObject({
      title: 'Dentist',
      dueTime: '15:30',
      remindBefore: 30
    })
    expect(taskFromDraft(draft({ dueTime: '' }))).toMatchObject({
      dueTime: undefined,
      remindBefore: null
    })
  })

  it('clears the carried-over marker when an edit reschedules the task', () => {
    const carried = task({ dueDate: '2026-09-24', rolledOverFrom: '2026-09-20' })
    expect(applyDraft(carried, draft({ dueDate: '2026-09-24' })).rolledOverFrom).toBe('2026-09-20')
    expect(applyDraft(carried, draft()).rolledOverFrom).toBeUndefined()
  })
})
