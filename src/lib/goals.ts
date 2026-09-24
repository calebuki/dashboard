import type { Goal, Task } from '../types'
import { addDays, fromDateKey, toDateKey, todayKey } from './date'

/** Every day this goal was acted on: manual check-ins plus linked task completions. */
export function goalActiveDays(goal: Goal, tasks: Task[]): Set<string> {
  const days = new Set(goal.checkins)
  for (const task of tasks) {
    if (task.goalId !== goal.id) continue
    task.completedDates.forEach((date) => days.add(date))
    if (!task.recurrence && task.completed && task.completedAt)
      days.add(toDateKey(new Date(task.completedAt)))
  }
  return days
}

export function weekStart(dateKey: string): string {
  return addDays(dateKey, -fromDateKey(dateKey).getDay())
}

export function weekDays(dateKey: string): string[] {
  const start = weekStart(dateKey)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export interface GoalProgress {
  done: number
  target: number
  week: { date: string; hit: boolean }[]
  streak: number
  checkedToday: boolean
  /** Today counts because a linked task was completed, so a manual toggle can't undo it. */
  lockedToday: boolean
}

export function goalProgress(goal: Goal, tasks: Task[], today = todayKey()): GoalProgress {
  const days = goalActiveDays(goal, tasks)
  const week = weekDays(today).map((date) => ({ date, hit: days.has(date) }))
  const done = week.filter((day) => day.hit).length

  let streak = done >= goal.weeklyTarget ? 1 : 0
  let cursor = addDays(weekStart(today), -7)
  const earliest = weekStart(toDateKey(new Date(goal.createdAt)))
  while (cursor >= earliest) {
    const count = weekDays(cursor).filter((date) => days.has(date)).length
    if (count < goal.weeklyTarget) break
    streak += 1
    cursor = addDays(cursor, -7)
  }

  return {
    done,
    target: goal.weeklyTarget,
    week,
    streak,
    checkedToday: days.has(today),
    lockedToday: days.has(today) && !goal.checkins.includes(today)
  }
}

export function toggleCheckin(goal: Goal, date = todayKey()): Goal {
  const has = goal.checkins.includes(date)
  return {
    ...goal,
    checkins: has
      ? goal.checkins.filter((day) => day !== date)
      : [...goal.checkins, date].sort().slice(-400),
    updatedAt: new Date().toISOString()
  }
}
