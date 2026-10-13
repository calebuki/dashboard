import type {
  DailyLog,
  DashboardState,
  Goal,
  GymEntry,
  GymKind,
  LogConfig,
  LogField,
  LogFieldKind,
  SleepEntry
} from '../types'
import { addDays, fromDateKey, toDateKey } from './date'
import type { TaskReminder } from './reminders'

/** Logging at 1am still belongs to the day before: the log day starts at 4am. */
export const LOG_DAY_START_HOUR = 4
/** Comparisons need enough days to mean anything. */
export const MIN_DAYS_FOR_INSIGHTS = 14
/** Caffeine closer than this to bedtime counts as late. */
export const LATE_CAFFEINE_MINUTES = 8 * 60

export const gymKinds: { value: GymKind; label: string }[] = [
  { value: 'lift', label: 'Lift' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'sport', label: 'Sport' },
  { value: 'mobility', label: 'Mobility' }
]

export const builtInKinds: LogFieldKind[] = ['sleep', 'caffeine', 'gym']

export const builtInFields: Record<'sleep' | 'caffeine' | 'gym', LogField> = {
  sleep: { id: 'sleep', kind: 'sleep', label: 'Sleep', emoji: '😴' },
  caffeine: { id: 'caffeine', kind: 'caffeine', label: 'Caffeine', emoji: '☕' },
  gym: { id: 'gym', kind: 'gym', label: 'Gym', emoji: '🏋️' }
}

export function logDayKey(now = new Date()): string {
  return toDateKey(new Date(now.getTime() - LOG_DAY_START_HOUR * 3_600_000))
}

const findGoal = (goals: Goal[], pattern: RegExp) => goals.find((goal) => pattern.test(goal.title))?.id

export function defaultLogFields(goals: Goal[] = []): LogField[] {
  return [
    {
      id: 'no-scroll',
      kind: 'habit',
      label: 'No TikTok / Reels',
      emoji: '📵',
      goalId: findGoal(goals, /tiktok|reels|scroll|social|phone/i)
    },
    builtInFields.sleep,
    builtInFields.caffeine,
    { ...builtInFields.gym, goalId: findGoal(goals, /work ?out|gym|lift|exercise|train|move/i) },
    { id: 'clarity', kind: 'score', label: 'Mental clarity', emoji: '🧠' },
    { id: 'focus', kind: 'score', label: 'Concentration', emoji: '🎯' },
    { id: 'memory', kind: 'score', label: 'Memory', emoji: '💭' },
    { id: 'connection', kind: 'score', label: 'Emotional connection', emoji: '💛' }
  ]
}

export function defaultLogConfig(goals: Goal[] = []): LogConfig {
  return {
    fields: defaultLogFields(goals),
    reminderTime: '21:30',
    updatedAt: new Date(0).toISOString()
  }
}

export function emptyLog(date: string, now = new Date().toISOString()): DailyLog {
  return { id: date, checks: {}, scores: {}, numbers: {}, note: '', createdAt: now, updatedAt: now }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))
const isTime = (value: unknown): value is string => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
const numberRecord = (value: unknown, min: number, max: number) =>
  Object.fromEntries(
    Object.entries((value as Record<string, unknown>) ?? {})
      .filter(([, item]) => typeof item === 'number' && Number.isFinite(item))
      .map(([key, item]) => [key, clamp(item as number, min, max)])
  )

export function normalizeLog(log: Partial<DailyLog> & { id: string }, now: string): DailyLog {
  const sleep = log.sleep
  const caffeine = log.caffeine
  const gym = log.gym
  return {
    id: log.id,
    checks: Object.fromEntries(
      Object.entries(log.checks ?? {}).filter(([, value]) => typeof value === 'boolean')
    ),
    scores: numberRecord(log.scores, 1, 10),
    numbers: numberRecord(log.numbers, 0, 100_000),
    sleep: sleep
      ? {
          bedtime: isTime(sleep.bedtime) ? sleep.bedtime : undefined,
          wake: isTime(sleep.wake) ? sleep.wake : undefined,
          quality: typeof sleep.quality === 'number' ? clamp(sleep.quality, 1, 5) : undefined
        }
      : undefined,
    caffeine:
      caffeine && typeof caffeine.mg === 'number'
        ? { mg: clamp(caffeine.mg, 0, 2000), lastAt: isTime(caffeine.lastAt) ? caffeine.lastAt : undefined }
        : undefined,
    gym: gym
      ? {
          rest: Boolean(gym.rest),
          kinds: (gym.kinds ?? []).filter((kind) => gymKinds.some((item) => item.value === kind)),
          time: isTime(gym.time) ? gym.time : undefined,
          minutes: typeof gym.minutes === 'number' ? clamp(gym.minutes, 0, 600) : undefined
        }
      : undefined,
    note: typeof log.note === 'string' ? log.note : '',
    createdAt: log.createdAt ?? now,
    updatedAt: log.updatedAt ?? log.createdAt ?? now
  }
}

export function normalizeLogConfig(config: Partial<LogConfig> | undefined, goals: Goal[]): LogConfig {
  if (!config || !Array.isArray(config.fields)) return defaultLogConfig(goals)
  const seen = new Set<string>()
  const kinds: LogFieldKind[] = ['habit', 'score', 'number', ...builtInKinds]
  const goalIds = new Set(goals.map((goal) => goal.id))
  return {
    fields: config.fields
      .filter((field) => field && kinds.includes(field.kind) && !seen.has(field.id) && seen.add(field.id))
      .map((field) => ({
        ...field,
        label: field.label || builtInFields[field.kind as 'sleep']?.label || 'Untitled',
        emoji: field.emoji || '•',
        goalId: field.goalId && goalIds.has(field.goalId) ? field.goalId : undefined
      })),
    reminderTime: config.reminderTime === null || isTime(config.reminderTime) ? config.reminderTime : '21:30',
    updatedAt: config.updatedAt ?? new Date(0).toISOString()
  }
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(total: number): string {
  const wrapped = ((Math.round(total) % 1440) + 1440) % 1440
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** Bedtimes are evening-relative: 1am sorts after 11pm. */
const bedtimeMinutes = (time: string) => {
  const minutes = timeToMinutes(time)
  return minutes < 12 * 60 ? minutes + 1440 : minutes
}

export function sleepMinutes(sleep: SleepEntry | undefined): number | null {
  if (!sleep?.bedtime || !sleep.wake) return null
  const minutes = (timeToMinutes(sleep.wake) - timeToMinutes(sleep.bedtime) + 1440) % 1440
  return minutes || null
}

export function gymTrained(gym: GymEntry | undefined): boolean {
  return Boolean(gym && !gym.rest && (gym.kinds.length || gym.time || gym.minutes))
}

/** Late when the last caffeine is within eight hours of that night's bedtime. */
export function caffeineIsLate(lastAt: string | undefined, bedtime: string | undefined): boolean {
  if (!lastAt || !bedtime) return false
  const last = timeToMinutes(lastAt)
  const lastEvening = last < LOG_DAY_START_HOUR * 60 ? last + 1440 : last
  return bedtimeMinutes(bedtime) - lastEvening < LATE_CAFFEINE_MINUTES
}

/** Median bedtime of recent logs, for warning about caffeine before tonight's bedtime is known. */
export function typicalBedtime(logs: DailyLog[], today: string): string | null {
  const times = logs
    .filter((log) => log.id <= today && log.sleep?.bedtime)
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .slice(0, 14)
    .map((log) => bedtimeMinutes(log.sleep!.bedtime!))
    .sort((a, b) => a - b)
  if (!times.length) return null
  return minutesToTime(times[Math.floor(times.length / 2)])
}

/** Whether a field has an answer. Habits always count as answered once a day is logged. */
export function fieldAnswered(log: DailyLog | undefined, field: LogField): boolean {
  if (!log) return false
  switch (field.kind) {
    case 'habit':
      return field.id in log.checks
    case 'score':
      return field.id in log.scores
    case 'number':
      return field.id in log.numbers
    case 'sleep':
      return Boolean(log.sleep?.bedtime && log.sleep.wake)
    case 'caffeine':
      return log.caffeine !== undefined
    case 'gym':
      return Boolean(log.gym?.rest || gymTrained(log.gym))
  }
}

export function logProgress(log: DailyLog | undefined, fields: LogField[]) {
  const counted = fields.filter((field) => field.kind !== 'habit')
  return {
    filled: counted.filter((field) => fieldAnswered(log, field)).length,
    total: counted.length
  }
}

export function isLogged(log: DailyLog | undefined): log is DailyLog {
  return Boolean(
    log &&
      (Object.keys(log.scores).length ||
        Object.keys(log.numbers).length ||
        Object.values(log.checks).some(Boolean) ||
        sleepMinutes(log.sleep) ||
        log.sleep?.quality ||
        log.caffeine ||
        log.gym?.rest ||
        gymTrained(log.gym) ||
        log.note.trim())
  )
}

export function habitDone(log: DailyLog | undefined, fieldId: string): boolean {
  return Boolean(log?.checks[fieldId])
}

/** Days a log entry counts toward `goalId` through a linked habit or a linked gym session. */
export function logGoalDays(logs: DailyLog[], fields: LogField[], goalId: string): string[] {
  const linked = fields.filter((field) => field.goalId === goalId)
  if (!linked.length) return []
  return logs
    .filter((log) =>
      linked.some((field) =>
        field.kind === 'gym' ? gymTrained(log.gym) : field.kind === 'habit' && habitDone(log, field.id)
      )
    )
    .map((log) => log.id)
}

export interface Streak {
  current: number
  best: number
}

/** Current streak counts back from today, or from yesterday while today isn't checked yet. */
export function habitStreak(logs: DailyLog[], fieldId: string, today: string): Streak {
  const done = new Set(logs.filter((log) => habitDone(log, fieldId)).map((log) => log.id))
  let cursor = done.has(today) ? today : addDays(today, -1)
  let current = 0
  while (done.has(cursor)) {
    current += 1
    cursor = addDays(cursor, -1)
  }
  let best = 0
  let run = 0
  let previous = ''
  for (const day of [...done].sort()) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }
  return { current, best }
}

export interface SeriesPoint {
  date: string
  value: number | null
}

export interface Trend {
  points: SeriesPoint[]
  average: number | null
  /** Change in average against the period before, when both have data. */
  change: number | null
}

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

export type SeriesValue = (log: DailyLog) => number | null | undefined

export const scoreValue = (fieldId: string): SeriesValue => (log) => log.scores[fieldId]
export const sleepHoursValue: SeriesValue = (log) => {
  const minutes = sleepMinutes(log.sleep)
  return minutes === null ? null : minutes / 60
}

export function trend(logs: DailyLog[], value: SeriesValue, days: number, today: string): Trend {
  const byDate = new Map(logs.map((log) => [log.id, log]))
  const read = (date: string) => {
    const log = byDate.get(date)
    const result = log ? value(log) : null
    return typeof result === 'number' ? result : null
  }
  const points = Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - days + 1)
    return { date, value: read(date) }
  })
  const before = Array.from({ length: days }, (_, index) => read(addDays(today, index - 2 * days + 1)))
  const current = average(points.flatMap((point) => (point.value === null ? [] : [point.value])))
  const previous = average(before.flatMap((item) => (item === null ? [] : [item])))
  return {
    points,
    average: current,
    change: current !== null && previous !== null ? current - previous : null
  }
}

export interface Comparison {
  key: string
  emoji: string
  /** e.g. "Nights with 7.5h+ sleep" */
  factor: string
  /** e.g. "Mental clarity" */
  outcome: string
  /** The outcome is read from the following day (late caffeine → that night's sleep). */
  nextDay: boolean
  unit: string
  withAverage: number
  withoutAverage: number
  withDays: number
  withoutDays: number
}

interface Factor {
  key: string
  emoji: string
  label: string
  /** true/false splits the day into a group; null leaves it out. */
  test: (log: DailyLog) => boolean | null
  /** Which day's log the outcome is read from, relative to the factor's day. */
  outcomeOffset?: number
  outcomes?: Outcome[]
}

interface Outcome {
  label: string
  unit: string
  value: SeriesValue
  /** Smallest gap worth mentioning. */
  minGap: number
}

const MIN_GROUP = 3

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/**
 * Splits logged days by each factor (slept 7.5h+, kept a habit, trained…) and reports the
 * outcome that differs most between the two groups. Correlation only, and labelled as such.
 */
export function compareFactors(logs: DailyLog[], fields: LogField[]): Comparison[] {
  const logged = logs.filter(isLogged)
  if (logged.length < MIN_DAYS_FOR_INSIGHTS) return []
  const byDate = new Map(logged.map((log) => [log.id, log]))
  const scoreOutcomes: Outcome[] = fields
    .filter((field) => field.kind === 'score')
    .map((field) => ({ label: field.label, unit: '', value: scoreValue(field.id), minGap: 0.5 }))
  const sleepOutcomes: Outcome[] = [
    { label: 'Sleep', unit: 'h', value: sleepHoursValue, minGap: 0.3 },
    { label: 'Sleep quality', unit: '/5', value: (log) => log.sleep?.quality, minGap: 0.4 }
  ]
  const hasField = (kind: LogFieldKind) => fields.some((field) => field.kind === kind)

  const factors: Factor[] = []
  if (hasField('sleep')) {
    const hours = logged.flatMap((log) => {
      const value = sleepHoursValue(log)
      return typeof value === 'number' ? [value] : []
    })
    const threshold = [7.5, 7, 8, 6.5].find(
      (limit) =>
        hours.filter((value) => value >= limit).length >= MIN_GROUP &&
        hours.filter((value) => value < limit).length >= MIN_GROUP
    )
    if (threshold !== undefined)
      factors.push({
        key: 'sleep-hours',
        emoji: '😴',
        label: `Nights with ${threshold}h+ sleep`,
        test: (log) => {
          const value = sleepHoursValue(log)
          return typeof value === 'number' ? value >= threshold : null
        }
      })
    factors.push({
      key: 'sleep-quality',
      emoji: '🛌',
      label: 'Good-sleep nights (4–5)',
      test: (log) => (log.sleep?.quality ? log.sleep.quality >= 4 : null)
    })
  }
  for (const field of fields.filter((item) => item.kind === 'habit'))
    factors.push({
      key: `habit-${field.id}`,
      emoji: field.emoji,
      label: `Days you kept “${field.label}”`,
      test: (log) => habitDone(log, field.id)
    })
  if (hasField('gym'))
    factors.push({
      key: 'gym',
      emoji: '🏋️',
      label: 'Gym days',
      test: (log) => (log.gym ? gymTrained(log.gym) : null)
    })
  if (hasField('caffeine')) {
    const amounts = logged.flatMap((log) => (log.caffeine ? [log.caffeine.mg] : []))
    if (amounts.length) {
      const middle = median(amounts)
      factors.push({
        key: 'caffeine-amount',
        emoji: '☕',
        label: `Days with more than ${middle}mg caffeine`,
        test: (log) => (log.caffeine ? log.caffeine.mg > middle : null)
      })
    }
    if (hasField('sleep'))
      factors.push({
        key: 'caffeine-late',
        emoji: '🌙',
        label: 'Days with caffeine within 8h of bed',
        outcomeOffset: 1,
        outcomes: sleepOutcomes,
        test: (log) => {
          const bedtime = byDate.get(addDays(log.id, 1))?.sleep?.bedtime
          if (!log.caffeine || !bedtime) return null
          return log.caffeine.mg > 0 && caffeineIsLate(log.caffeine.lastAt, bedtime)
        }
      })
  }
  for (const field of fields.filter((item) => item.kind === 'number')) {
    const values = logged.flatMap((log) => (field.id in log.numbers ? [log.numbers[field.id]] : []))
    if (!values.length) continue
    const middle = median(values)
    factors.push({
      key: `number-${field.id}`,
      emoji: field.emoji,
      label: `Days with more than ${middle}${field.unit ? ` ${field.unit}` : ''} ${field.label.toLowerCase()}`,
      test: (log) => (field.id in log.numbers ? log.numbers[field.id] > middle : null)
    })
  }

  const results: Comparison[] = []
  for (const factor of factors) {
    let best: Comparison | null = null
    for (const outcome of factor.outcomes ?? scoreOutcomes) {
      const groups: Record<'yes' | 'no', number[]> = { yes: [], no: [] }
      for (const log of logged) {
        const split = factor.test(log)
        if (split === null) continue
        const target = byDate.get(addDays(log.id, factor.outcomeOffset ?? 0))
        const value = target ? outcome.value(target) : null
        if (typeof value !== 'number') continue
        groups[split ? 'yes' : 'no'].push(value)
      }
      if (groups.yes.length < MIN_GROUP || groups.no.length < MIN_GROUP) continue
      const withAverage = average(groups.yes)!
      const withoutAverage = average(groups.no)!
      const gap = Math.abs(withAverage - withoutAverage)
      if (gap < outcome.minGap) continue
      // Compare in units of each outcome's minimum gap so hours and 1–10 scores rank fairly.
      if (best && gap / outcome.minGap <= relativeGap(best)) continue
      best = {
        key: factor.key,
        emoji: factor.emoji,
        factor: factor.label,
        outcome: outcome.label,
        nextDay: Boolean(factor.outcomeOffset),
        unit: outcome.unit,
        withAverage,
        withoutAverage,
        withDays: groups.yes.length,
        withoutDays: groups.no.length
      }
    }
    if (best) results.push(best)
  }
  return results.sort((a, b) => relativeGap(b) - relativeGap(a)).slice(0, 4)
}

const unitGap = (unit: string) => (unit === 'h' ? 0.3 : unit === '/5' ? 0.4 : 0.5)
const relativeGap = (item: Comparison) => Math.abs(item.withAverage - item.withoutAverage) / unitGap(item.unit)

export function loggedDayCount(logs: DailyLog[]): number {
  return logs.filter(isLogged).length
}

/** A nightly nudge once the reminder time passes, if today's log is still empty. */
export function pendingLogReminder(state: DashboardState, now = new Date()): TaskReminder | null {
  const time = state.logConfig.reminderTime
  if (!time) return null
  const day = logDayKey(now)
  const fireAt = fromDateKey(day)
  const minutes = timeToMinutes(time)
  // A 1am reminder belongs to the evening before it.
  fireAt.setHours(0, minutes + (minutes < LOG_DAY_START_HOUR * 60 ? 1440 : 0), 0, 0)
  if (now.getTime() < fireAt.getTime()) return null
  const key = `log:${day}`
  if (state.sentTaskReminders.includes(key)) return null
  if (isLogged(state.logs.find((log) => log.id === day))) return null
  return { key, title: 'Daily log', body: 'How was today? Take a minute to log it.' }
}

export function updateLog(
  logs: DailyLog[],
  date: string,
  change: (log: DailyLog) => DailyLog,
  now = new Date().toISOString()
): DailyLog[] {
  const existing = logs.find((log) => log.id === date)
  const next = { ...change(existing ?? emptyLog(date, now)), updatedAt: now }
  return existing
    ? logs.map((log) => (log.id === date ? next : log))
    : [...logs, next].sort((a, b) => (a.id < b.id ? -1 : 1))
}
