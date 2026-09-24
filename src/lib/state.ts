import type {
  DashboardSettings,
  DashboardState,
  Goal,
  GoalColor,
  GoalDraft,
  Task,
  TaskDraft
} from '../types'
import { addDays, daysBetween, nextDateForRecurrence, todayKey } from './date'

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const defaultSettings: DashboardSettings = {
  alwaysOnTop: true,
  opacity: 0.94,
  overlayOpacity: 0.5,
  overlayMode: false,
  launchAtLogin: false,
  notifications: true,
  theme: 'system'
}

export const goalColors: GoalColor[] = ['lime', 'sky', 'violet', 'coral', 'amber', 'mint']

function makeTask(
  task: Pick<Task, 'title' | 'category' | 'dueDate' | 'estimateMinutes'> & Partial<Task>
): Task {
  return {
    id: createId('task'),
    notes: '',
    recurrence: null,
    priority: 2,
    completed: false,
    completedDates: [],
    rollover: true,
    rolloverCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...task
  }
}

export function goalFromDraft(draft: GoalDraft): Goal {
  const now = new Date().toISOString()
  return {
    id: createId('goal'),
    title: draft.title.trim(),
    emoji: draft.emoji || '🎯',
    color: draft.color,
    weeklyTarget: clampTarget(draft.weeklyTarget),
    checkins: [],
    createdAt: now,
    updatedAt: now
  }
}

const clampTarget = (value: number) => Math.min(7, Math.max(1, Math.round(value) || 1))

export function createInitialState(): DashboardState {
  const today = todayKey()
  const now = new Date().toISOString()
  const move: Goal = {
    id: createId('goal'),
    title: 'Move my body',
    emoji: '🏃',
    color: 'lime',
    weeklyTarget: 3,
    checkins: [],
    createdAt: now,
    updatedAt: now
  }

  return {
    version: 3,
    goals: [move],
    settings: { ...defaultSettings },
    activeTimer: null,
    sentTaskReminders: [],
    tasks: [
      makeTask({
        title: 'Try the quick add: “Lunch with Sam fri 12:30 #work”',
        notes: 'Dates, times, #areas and “every day” are understood as you type.',
        category: 'personal',
        dueDate: today,
        estimateMinutes: 5,
        priority: 1
      }),
      makeTask({
        title: 'Plan the three things that matter today',
        category: 'work',
        dueDate: today,
        dueTime: '09:00',
        estimateMinutes: 10,
        recurrence: { kind: 'weekdays' },
        remindBefore: 0
      }),
      makeTask({
        title: '20 minute walk',
        category: 'personal',
        dueDate: today,
        dueTime: '17:30',
        estimateMinutes: 20,
        goalId: move.id,
        remindBefore: 10
      }),
      makeTask({
        title: 'Review notes for next week',
        category: 'school',
        dueDate: addDays(today, 2),
        estimateMinutes: 45
      })
    ]
  }
}

/** Legacy (v2) goals carried a long-range phase plan. Keep the goal, drop the plan. */
function normalizeGoal(goal: Partial<Goal> & { id: string; title: string }, now: string): Goal {
  const color = goalColors.includes(goal.color as GoalColor) ? (goal.color as GoalColor) : 'lime'
  return {
    id: goal.id,
    title: goal.title,
    emoji: typeof goal.emoji === 'string' && goal.emoji ? goal.emoji : '🎯',
    color,
    weeklyTarget: clampTarget(goal.weeklyTarget ?? 3),
    checkins: Array.isArray(goal.checkins) ? [...new Set(goal.checkins)].sort() : [],
    createdAt: goal.createdAt ?? (goal as { startDate?: string }).startDate ?? now,
    updatedAt: goal.updatedAt ?? now
  }
}

export function normalizeDashboardState(stored: DashboardState): DashboardState {
  const now = new Date().toISOString()
  return {
    ...stored,
    version: 3,
    activeTimer: stored.activeTimer ?? null,
    sentTaskReminders: stored.sentTaskReminders ?? [],
    settings: { ...defaultSettings, ...stored.settings },
    tasks: (stored.tasks ?? []).map((task) => ({
      ...task,
      completedDates: task.completedDates ?? [],
      updatedAt: task.updatedAt ?? task.createdAt ?? now
    })),
    goals: (stored.goals ?? []).map((goal) => normalizeGoal(goal, now))
  }
}

export function rolloverTasks(state: DashboardState, currentDate = todayKey()): DashboardState {
  let changed = false
  const tasks = state.tasks.map((task) => {
    const doneToday = task.completedDates.includes(currentDate)
    if (!task.rollover || task.completed || doneToday || task.dueDate >= currentDate) return task

    changed = true
    return {
      ...task,
      rolledOverFrom: task.rolledOverFrom ?? task.dueDate,
      rolloverCount: task.rolloverCount + Math.max(1, daysBetween(task.dueDate, currentDate)),
      dueDate: currentDate,
      updatedAt: new Date().toISOString()
    }
  })

  return changed ? { ...state, tasks } : state
}

export function taskIsCompleteOn(task: Task, dateKey: string): boolean {
  return task.recurrence ? task.completedDates.includes(dateKey) : task.completed
}

export function toggleTaskComplete(
  task: Task,
  dateKey = todayKey(),
  now = new Date().toISOString()
): Task {
  if (!task.recurrence) {
    const completed = !task.completed
    return {
      ...task,
      completed,
      completedAt: completed ? now : undefined,
      updatedAt: now
    }
  }

  const isComplete = task.completedDates.includes(dateKey)
  if (isComplete) {
    return {
      ...task,
      completedDates: task.completedDates.filter((date) => date !== dateKey),
      dueDate: dateKey,
      updatedAt: now
    }
  }

  const nextDue = nextDateForRecurrence(dateKey, task.recurrence.kind)
  return {
    ...task,
    completedDates: [...task.completedDates, dateKey].sort(),
    dueDate: nextDue,
    rolledOverFrom: undefined,
    updatedAt: now
  }
}

export function taskFromDraft(draft: TaskDraft): Task {
  return makeTask({
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    category: draft.category,
    dueDate: draft.dueDate,
    dueTime: draft.dueTime || undefined,
    estimateMinutes: draft.estimateMinutes,
    recurrence: draft.recurrence === 'none' ? null : { kind: draft.recurrence },
    priority: draft.priority,
    goalId: draft.goalId,
    remindBefore: draft.dueTime ? draft.remindBefore : null
  })
}

export function applyDraft(task: Task, draft: TaskDraft): Task {
  return {
    ...task,
    ...draft,
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    dueTime: draft.dueTime || undefined,
    remindBefore: draft.dueTime ? draft.remindBefore : null,
    recurrence: draft.recurrence === 'none' ? null : { kind: draft.recurrence },
    rolledOverFrom: draft.dueDate === task.dueDate ? task.rolledOverFrom : undefined,
    updatedAt: new Date().toISOString()
  }
}

export function taskMatchesDate(task: Task, dateKey: string): boolean {
  if (task.completedDates.includes(dateKey)) return true
  return task.dueDate === dateKey
}
