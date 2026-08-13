import { describe, expect, it } from 'vitest'
import type { DashboardState, Task } from '../types'
import { createInitialState, rolloverTasks, taskIsCompleteOn, toggleTaskComplete } from './state'

describe('dashboard task behavior', () => {
  it('rolls an unfinished task into today and keeps its original date', () => {
    const state = createInitialState()
    const task: Task = {
      ...state.tasks[0],
      recurrence: null,
      dueDate: '2026-08-08',
      completedDates: []
    }
    const input: DashboardState = { ...state, tasks: [task] }

    const result = rolloverTasks(input, '2026-08-12')

    expect(result.tasks[0].dueDate).toBe('2026-08-12')
    expect(result.tasks[0].rolledOverFrom).toBe('2026-08-08')
    expect(result.tasks[0].rolloverCount).toBe(4)
  })

  it('advances a completed daily task and records its completion date', () => {
    const task = createInitialState().tasks.find((item) => item.recurrence?.kind === 'daily')!
    const completed = toggleTaskComplete({ ...task, dueDate: '2026-08-12' }, '2026-08-12')

    expect(taskIsCompleteOn(completed, '2026-08-12')).toBe(true)
    expect(completed.dueDate).toBe('2026-08-13')
  })

  it('skips weekends for weekday recurrence', () => {
    const task = createInitialState().tasks.find((item) => item.recurrence?.kind === 'weekdays')!
    const completed = toggleTaskComplete({ ...task, dueDate: '2026-08-14' }, '2026-08-14')

    expect(completed.dueDate).toBe('2026-08-17')
  })
})
