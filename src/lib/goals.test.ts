import { describe, expect, it } from 'vitest'
import type { Goal, Task } from '../types'
import { goalProgress, toggleCheckin, weekDays } from './goals'
import { normalizeDashboardState } from './state'

const goal = (patch: Partial<Goal> = {}): Goal => ({
  id: 'goal-1',
  title: 'Read',
  emoji: '📚',
  color: 'sky',
  weeklyTarget: 3,
  checkins: [],
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
  ...patch
})

const linked = (completedDates: string[]): Task => ({
  id: 'task-1',
  title: 'Read a chapter',
  notes: '',
  category: 'personal',
  dueDate: '2026-09-30',
  estimateMinutes: 20,
  recurrence: { kind: 'daily' },
  priority: 2,
  goalId: 'goal-1',
  completed: false,
  completedDates,
  rollover: true,
  rolloverCount: 0,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z'
})

describe('weekly goals', () => {
  it('uses a Sunday-to-Saturday week', () => {
    expect(weekDays('2026-09-24')).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26'
    ])
  })

  it('counts manual check-ins and linked task completions once per day', () => {
    const progress = goalProgress(
      goal({ checkins: ['2026-09-21', '2026-09-22'] }),
      [linked(['2026-09-22', '2026-09-24'])],
      '2026-09-24'
    )
    expect(progress.done).toBe(3)
    expect(progress.checkedToday).toBe(true)
    expect(progress.lockedToday).toBe(true)
  })

  it('counts consecutive weeks that met the target as a streak', () => {
    const progress = goalProgress(
      goal({
        weeklyTarget: 2,
        checkins: ['2026-09-07', '2026-09-08', '2026-09-14', '2026-09-15', '2026-09-21']
      }),
      [],
      '2026-09-24'
    )
    // Current week has 1 of 2, so only the two previous full weeks count.
    expect(progress.streak).toBe(2)
  })

  it('toggles a manual check-in', () => {
    const on = toggleCheckin(goal(), '2026-09-24')
    expect(on.checkins).toEqual(['2026-09-24'])
    expect(toggleCheckin(on, '2026-09-24').checkins).toEqual([])
  })

  it('migrates a legacy phase-plan goal into a weekly goal', () => {
    const legacy = {
      id: 'goal-swedish-b1',
      title: 'Conversational Swedish',
      target: 'B1',
      startDate: '2026-08-01',
      targetDate: '2027-08-01',
      color: '#d7ff64',
      phases: [],
      updatedAt: '2026-08-01T00:00:00.000Z'
    }
    const state = normalizeDashboardState({
      version: 2,
      tasks: [],
      goals: [legacy],
      settings: { alwaysOnTop: true },
      activeTimer: null,
      sentTaskReminders: []
    } as never)
    expect(state.goals[0]).toMatchObject({
      id: 'goal-swedish-b1',
      title: 'Conversational Swedish',
      emoji: '🎯',
      color: 'lime',
      weeklyTarget: 3,
      checkins: []
    })
    expect(state.settings.theme).toBe('system')
  })
})
