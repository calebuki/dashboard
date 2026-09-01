import type { DashboardState, Goal, Task, TaskDraft } from '../types'
import { addDays, daysBetween, nextDateForRecurrence, todayKey } from './date'

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

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

export function createInitialState(): DashboardState {
  const today = todayKey()
  const targetDate = addDays(today, 364)
  const swedishGoal: Goal = {
    id: 'goal-swedish-b1',
    title: 'Conversational Swedish',
    target: 'Reach a confident B1 level',
    startDate: today,
    targetDate,
    color: '#d7ff64',
    phases: [
      {
        title: 'Build the base',
        range: 'Weeks 1–8',
        outcome: 'Core pronunciation, 800 useful words, and basic sentence patterns.'
      },
      {
        title: 'Everyday Swedish',
        range: 'Weeks 9–20',
        outcome: 'Handle routine conversations and follow slow, clear speech.'
      },
      {
        title: 'Use real Swedish',
        range: 'Weeks 21–36',
        outcome: 'Read, listen, and speak about familiar topics without translating first.'
      },
      {
        title: 'Prove B1',
        range: 'Weeks 37–52',
        outcome: 'Sustain conversations, write clearly, and pass a B1-style practice assessment.'
      }
    ],
    updatedAt: new Date().toISOString()
  }

  return {
    version: 2,
    goals: [swedishGoal],
    settings: {
      alwaysOnTop: true,
      opacity: 0.88,
      overlayOpacity: 0.5,
      overlayMode: false,
      launchAtLogin: false,
      notifications: true
    },
    activeTimer: null,
    sentTaskReminders: [],
    tasks: [
      makeTask({
        title: 'Swedish recall session',
        notes:
          'Use active recall: review yesterday, then learn one small set of words or patterns.',
        category: 'personal',
        dueDate: today,
        dueTime: '18:00',
        estimateMinutes: 20,
        recurrence: { kind: 'daily' },
        priority: 1,
        goalId: swedishGoal.id
      }),
      makeTask({
        title: 'Listen to Swedish',
        notes: 'Use learner audio, radio, or a short video. Repeat one useful sentence aloud.',
        category: 'personal',
        dueDate: today,
        estimateMinutes: 15,
        recurrence: { kind: 'daily' },
        priority: 2,
        goalId: swedishGoal.id
      }),
      makeTask({
        title: 'Speak or write in Swedish',
        notes: 'Describe your day. Keep moving even when you do not know the perfect word.',
        category: 'personal',
        dueDate: today,
        estimateMinutes: 10,
        recurrence: { kind: 'daily' },
        priority: 2,
        goalId: swedishGoal.id
      }),
      makeTask({
        title: 'Weekly Swedish checkpoint',
        notes:
          'Have a longer conversation or record a two-minute summary, then note one weak area.',
        category: 'personal',
        dueDate: addDays(today, 6),
        estimateMinutes: 45,
        recurrence: { kind: 'weekly' },
        priority: 2,
        goalId: swedishGoal.id
      }),
      makeTask({
        title: 'Call the financial aid office',
        notes: 'Write down your question and student ID before calling.',
        category: 'school',
        dueDate: addDays(today, 1),
        dueTime: '10:00',
        estimateMinutes: 20,
        recurrence: null,
        priority: 1
      }),
      makeTask({
        title: 'Choose today’s three work priorities',
        notes: 'Pick the outcomes that would make today count.',
        category: 'work',
        dueDate: today,
        dueTime: '09:00',
        estimateMinutes: 10,
        recurrence: { kind: 'weekdays' },
        priority: 1
      })
    ]
  }
}

export function normalizeDashboardState(stored: DashboardState): DashboardState {
  const now = new Date().toISOString()
  return {
    ...stored,
    version: 2,
    sentTaskReminders: stored.sentTaskReminders ?? [],
    tasks: stored.tasks.map((task) => ({
      ...task,
      updatedAt: task.updatedAt ?? task.createdAt ?? now
    })),
    goals: stored.goals.map((goal) => ({
      ...goal,
      updatedAt: goal.updatedAt ?? now
    }))
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
    goalId: draft.goalId
  })
}

export function taskMatchesDate(task: Task, dateKey: string): boolean {
  if (task.completedDates.includes(dateKey)) return true
  return task.dueDate === dateKey
}

export function goalDay(goal: Goal, currentDate = todayKey()): number {
  return Math.min(365, Math.max(1, daysBetween(goal.startDate, currentDate) + 1))
}
