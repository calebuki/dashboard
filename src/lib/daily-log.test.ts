import { describe, expect, it } from 'vitest'
import type { DailyLog, Goal } from '../types'
import {
  caffeineIsLate,
  compareFactors,
  defaultLogConfig,
  defaultLogFields,
  emptyLog,
  habitStreak,
  logDayKey,
  logGoalDays,
  logProgress,
  normalizeLogConfig,
  pendingLogReminder,
  sleepMinutes,
  trend,
  scoreValue,
  typicalBedtime,
  updateLog
} from './daily-log'
import { addDays } from './date'
import { goalProgress } from './goals'
import { createInitialState, normalizeDashboardState } from './state'

const log = (id: string, patch: Partial<DailyLog> = {}): DailyLog => ({
  ...emptyLog(id, '2026-10-01T00:00:00.000Z'),
  ...patch
})

const goal = (patch: Partial<Goal> = {}): Goal => ({
  id: 'goal-gym',
  title: 'Work out',
  emoji: '💪',
  color: 'coral',
  weeklyTarget: 3,
  checkins: [],
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
  ...patch
})

describe('log day', () => {
  it('treats the small hours as the day before', () => {
    expect(logDayKey(new Date(2026, 9, 13, 1, 30))).toBe('2026-10-12')
    expect(logDayKey(new Date(2026, 9, 13, 4, 0))).toBe('2026-10-13')
    expect(logDayKey(new Date(2026, 9, 13, 23, 59))).toBe('2026-10-13')
  })
})

describe('sleep and caffeine', () => {
  it('handles bedtimes before and after midnight', () => {
    expect(sleepMinutes({ bedtime: '23:30', wake: '07:00' })).toBe(450)
    expect(sleepMinutes({ bedtime: '01:15', wake: '08:45' })).toBe(450)
    expect(sleepMinutes({ bedtime: '23:30' })).toBeNull()
  })

  it('flags caffeine within eight hours of bed', () => {
    expect(caffeineIsLate('16:00', '23:00')).toBe(true)
    expect(caffeineIsLate('14:30', '23:00')).toBe(false)
    expect(caffeineIsLate('18:00', '01:30')).toBe(true)
    expect(caffeineIsLate('17:00', '01:30')).toBe(false)
  })

  it('finds the usual bedtime across midnight', () => {
    const logs = ['23:30', '00:30', '23:45'].map((bedtime, index) =>
      log(`2026-10-0${index + 1}`, { sleep: { bedtime, wake: '08:00' } })
    )
    expect(typicalBedtime(logs, '2026-10-03')).toBe('23:45')
  })
})

describe('defaults and progress', () => {
  it('links the gym to a workout goal when one exists', () => {
    const fields = defaultLogFields([goal()])
    expect(fields.find((field) => field.kind === 'gym')?.goalId).toBe('goal-gym')
    expect(fields.filter((field) => field.kind === 'score').map((field) => field.label)).toEqual([
      'Mental clarity',
      'Concentration',
      'Memory',
      'Emotional connection'
    ])
  })

  it('counts filled sections, not habits', () => {
    const { fields } = defaultLogConfig()
    const entry = log('2026-10-10', {
      checks: { 'no-scroll': true },
      scores: { clarity: 6, focus: 7 },
      sleep: { bedtime: '23:00', wake: '07:00' },
      caffeine: { mg: 0 },
      gym: { rest: true, kinds: [] }
    })
    expect(logProgress(entry, fields)).toEqual({ filled: 5, total: 7 })
  })

  it('drops links to goals that no longer exist', () => {
    const config = normalizeLogConfig(
      { fields: [{ id: 'gym', kind: 'gym', label: 'Gym', emoji: '🏋️', goalId: 'gone' }], reminderTime: null },
      []
    )
    expect(config.fields[0].goalId).toBeUndefined()
    expect(config.reminderTime).toBeNull()
  })

  it('fills in a log for existing saved state', () => {
    const stored = createInitialState() as Partial<ReturnType<typeof createInitialState>>
    delete stored.logs
    delete stored.logConfig
    const state = normalizeDashboardState(stored as ReturnType<typeof createInitialState>)
    expect(state.logs).toEqual([])
    expect(state.logConfig.fields.length).toBe(8)
  })
})

describe('habits and goals', () => {
  it('keeps a streak going while today is still open', () => {
    const logs = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12'].map((id) =>
      log(id, { checks: { 'no-scroll': true } })
    )
    expect(habitStreak(logs, 'no-scroll', '2026-10-13')).toEqual({ current: 1, best: 3 })
    expect(habitStreak(logs, 'no-scroll', '2026-10-14')).toEqual({ current: 0, best: 3 })
  })

  it('counts linked gym sessions and habits toward a goal', () => {
    const fields = defaultLogFields([goal()])
    const logs = [
      log('2026-10-12', { gym: { kinds: ['lift', 'cardio'], minutes: 60 } }),
      log('2026-10-13', { gym: { rest: true, kinds: [] } })
    ]
    const days = logGoalDays(logs, fields, 'goal-gym')
    expect(days).toEqual(['2026-10-12'])
    const progress = goalProgress(goal(), [], '2026-10-13', days)
    expect(progress.done).toBe(1)
    expect(progress.checkedToday).toBe(false)
  })
})

describe('trends and comparisons', () => {
  it('averages a period and compares it with the one before', () => {
    const logs = Array.from({ length: 14 }, (_, index) =>
      log(addDays('2026-10-01', index), { scores: { clarity: index < 7 ? 4 : 6 } })
    )
    const result = trend(logs, scoreValue('clarity'), 7, '2026-10-14')
    expect(result.points).toHaveLength(7)
    expect(result.average).toBe(6)
    expect(result.change).toBe(2)
  })

  it('waits for enough days before comparing', () => {
    const logs = Array.from({ length: 10 }, (_, index) =>
      log(addDays('2026-10-01', index), { scores: { clarity: 5 } })
    )
    expect(compareFactors(logs, defaultLogFields())).toEqual([])
  })

  it('finds that longer sleep goes with clearer days', () => {
    const logs = Array.from({ length: 16 }, (_, index) => {
      const rested = index % 2 === 0
      return log(addDays('2026-10-01', index), {
        sleep: { bedtime: rested ? '22:30' : '01:00', wake: '07:00', quality: rested ? 4 : 2 },
        scores: { clarity: rested ? 8 : 5, focus: rested ? 7 : 6 }
      })
    })
    const results = compareFactors(logs, defaultLogFields())
    const sleep = results.find((item) => item.key === 'sleep-hours')
    expect(sleep).toMatchObject({ factor: 'Nights with 7.5h+ sleep', outcome: 'Mental clarity' })
    expect(sleep?.withAverage).toBe(8)
    expect(sleep?.withoutAverage).toBe(5)
  })

  it('pairs late caffeine with the following night', () => {
    const logs = Array.from({ length: 16 }, (_, index) => {
      const late = index % 2 === 0
      return log(addDays('2026-10-01', index), {
        caffeine: { mg: 150, lastAt: late ? '18:00' : '10:00' },
        // Tonight's sleep lives in tomorrow's entry: after a late day, the next night is short.
        sleep: { bedtime: '23:00', wake: index % 2 === 1 ? '05:30' : '07:30' },
        scores: { clarity: 6 }
      })
    })
    const late = compareFactors(logs, defaultLogFields()).find((item) => item.key === 'caffeine-late')
    expect(late).toMatchObject({ outcome: 'Sleep', nextDay: true, unit: 'h', withAverage: 6.5, withoutAverage: 8.5 })
  })
})

describe('log reminder', () => {
  const base = () => ({ ...createInitialState(), sentTaskReminders: [] as string[] })

  it('nudges after the reminder time when the day is empty', () => {
    const state = base()
    expect(pendingLogReminder(state, new Date(2026, 9, 13, 21, 0))).toBeNull()
    expect(pendingLogReminder(state, new Date(2026, 9, 13, 21, 45))?.key).toBe('log:2026-10-13')
    expect(pendingLogReminder(state, new Date(2026, 9, 14, 1, 0))?.key).toBe('log:2026-10-13')
  })

  it('stays quiet once logged, sent, or turned off', () => {
    const now = new Date(2026, 9, 13, 22, 0)
    const logged = { ...base(), logs: [log('2026-10-13', { scores: { clarity: 7 } })] }
    expect(pendingLogReminder(logged, now)).toBeNull()
    expect(pendingLogReminder({ ...base(), sentTaskReminders: ['log:2026-10-13'] }, now)).toBeNull()
    const off = base()
    off.logConfig = { ...off.logConfig, reminderTime: null }
    expect(pendingLogReminder(off, now)).toBeNull()
  })
})

describe('updateLog', () => {
  it('creates a day on first edit and keeps days in order', () => {
    const logs = updateLog([log('2026-10-12')], '2026-10-11', (entry) => ({ ...entry, note: 'hi' }), 'now')
    expect(logs.map((entry) => entry.id)).toEqual(['2026-10-11', '2026-10-12'])
    expect(logs[0]).toMatchObject({ note: 'hi', updatedAt: 'now' })
  })
})
