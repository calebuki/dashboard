import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { LoaderCircle } from 'lucide-react'
import type {
  ActiveTimer,
  DashboardSettings,
  DashboardState,
  Goal,
  GoalDraft,
  SyncStatus,
  Task,
  TaskDraft,
  ThemePreference
} from './types'
import { startOfMonth, todayKey } from './lib/date'
import { relativeDayLabel, timeLabel } from './lib/format'
import { toggleCheckin } from './lib/goals'
import { parseQuickTask } from './lib/quick-add'
import { pendingTaskReminders } from './lib/reminders'
import {
  applyDraft,
  createInitialState,
  goalFromDraft,
  normalizeDashboardState,
  rolloverTasks,
  taskFromDraft,
  toggleTaskComplete
} from './lib/state'
import { CalendarView } from './components/CalendarView'
import { Composer, blankDraft, type ComposerRequest } from './components/Composer'
import { FocusTimer } from './components/FocusTimer'
import { GoalSheet, GoalsView } from './components/GoalsView'
import { NavBar, views, type View } from './components/NavBar'
import { SettingsView } from './components/SettingsView'
import { TitleBar } from './components/TitleBar'
import { Toast, type ToastMessage } from './components/Toast'
import { TodayView, type Filter, type TaskHandlers } from './components/TodayView'
import { spring } from './components/primitives'

const noSync: SyncStatus = {
  configured: false,
  signedIn: false,
  phase: 'unavailable',
  message: 'Cloud sync is not configured in this build.'
}

const draftFor = (task: Task): TaskDraft => ({
  title: task.title,
  notes: task.notes,
  category: task.category,
  dueDate: task.dueDate,
  dueTime: task.dueTime ?? '',
  estimateMinutes: task.estimateMinutes,
  recurrence: task.recurrence?.kind ?? 'none',
  priority: task.priority,
  goalId: task.goalId,
  remindBefore: task.remindBefore ?? null
})

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)))
}

export default function App() {
  const [state, setState] = useState<DashboardState | null>(null)
  const [sync, setSync] = useState<SyncStatus>(noSync)
  const [view, setView] = useState<View>('today')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState(todayKey())
  const [month, setMonth] = useState(startOfMonth(todayKey()))
  const [composer, setComposer] = useState<ComposerRequest | null>(null)
  const [goalSheet, setGoalSheet] = useState<{ goal?: Goal; draft?: GoalDraft } | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [now, setNow] = useState(Date.now())
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    darkQuery().matches ? 'dark' : 'light'
  )
  const themePreference = useRef<ThemePreference>('system')
  const loaded = useRef(false)
  const remindersInFlight = useRef(new Set<string>())
  const reduceMotion = useReducedMotion()
  const today = todayKey()

  useEffect(() => {
    document.documentElement.classList.add(`platform-${window.dashboard.platform}`)
    const offSync = window.dashboard.onSyncStatus(setSync)
    // Synced data replaces tasks, goals, and settings; the timer and sent reminders stay per-device.
    const offRemote = window.dashboard.onRemoteState((remote) =>
      setState((current) => {
        const next = rolloverTasks(normalizeDashboardState(remote))
        return current
          ? { ...next, activeTimer: current.activeTimer, sentTaskReminders: current.sentTaskReminders }
          : next
      })
    )
    void window.dashboard.getSyncStatus().then(setSync)
    void window.dashboard.loadState().then((stored) => {
      const next = rolloverTasks(stored ? normalizeDashboardState(stored) : createInitialState())
      setState(next)
      loaded.current = true
      void window.dashboard.setAlwaysOnTop(next.settings.alwaysOnTop)
      void window.dashboard.setOpacity(
        next.settings.overlayMode ? next.settings.overlayOpacity : next.settings.opacity
      )
    })
    const query = darkQuery()
    const onScheme = () => {
      if (themePreference.current === 'system') setResolvedTheme(query.matches ? 'dark' : 'light')
    }
    query.addEventListener('change', onScheme)
    return () => {
      offSync()
      offRemote()
      query.removeEventListener('change', onScheme)
    }
  }, [])

  // Keep the native theme in step with the stored preference (including synced changes).
  const storedTheme = state?.settings.theme
  useEffect(() => {
    if (!storedTheme) return
    themePreference.current = storedTheme
    void window.dashboard.setTheme(storedTheme).then(setResolvedTheme)
  }, [storedTheme])

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = resolvedTheme
    root.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  useEffect(() => {
    if (!state || !loaded.current) return
    const id = window.setTimeout(() => void window.dashboard.saveState(state), 220)
    return () => clearTimeout(id)
  }, [state])

  const timerRunning = Boolean(state?.activeTimer && state.activeTimer.pausedRemainingSeconds === undefined)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), timerRunning ? 1000 : 30_000)
    return () => clearInterval(id)
  }, [timerRunning])

  // Carry unfinished work forward when the day changes while the app stays open.
  useEffect(() => {
    if (!loaded.current) return
    setState((current) => (current ? rolloverTasks(current, today) : current))
    setSelected((current) => (current < today ? today : current))
  }, [today])

  useEffect(() => {
    if (!state?.activeTimer || state.activeTimer.pausedRemainingSeconds !== undefined) return
    if (state.activeTimer.endsAt > now) return
    const task = state.tasks.find((item) => item.id === state.activeTimer?.taskId)
    if (state.settings.notifications)
      void window.dashboard.notify({
        title: 'Time is up',
        body: task ? `${task.title} — check it off or add more time.` : 'Your timer finished.'
      })
    setState((current) => (current ? { ...current, activeTimer: null } : current))
  }, [now, state?.activeTimer, state?.settings.notifications, state?.tasks])

  useEffect(() => {
    if (!state?.settings.notifications) return
    const reminders = pendingTaskReminders(state, new Date(now)).filter(
      (reminder) => !remindersInFlight.current.has(reminder.key)
    )
    if (!reminders.length) return
    reminders.forEach((reminder) => {
      remindersInFlight.current.add(reminder.key)
      void window.dashboard.notify({ title: reminder.title, body: reminder.body })
    })
    setState((current) =>
      current
        ? {
            ...current,
            sentTaskReminders: [
              ...new Set([...current.sentTaskReminders, ...reminders.map(({ key }) => key)])
            ].slice(-500)
          }
        : current
    )
  }, [now, state?.settings.notifications, state?.tasks, state?.sentTaskReminders])

  const update = useCallback(
    (fn: (current: DashboardState) => DashboardState) =>
      setState((current) => (current ? fn(current) : current)),
    []
  )
  const showToast = useCallback(
    (text: string, action?: ToastMessage['action']) => setToast({ id: Date.now(), text, action }),
    []
  )
  const dismissToast = useCallback(() => setToast(null), [])

  const settings = (patch: Partial<DashboardSettings>) =>
    update((current) => ({ ...current, settings: { ...current.settings, ...patch } }))

  const applyTheme = async (preference: ThemePreference, origin?: { x: number; y: number }) => {
    themePreference.current = preference
    const next = await window.dashboard.setTheme(preference)
    const commit = () =>
      flushSync(() => {
        setResolvedTheme(next)
        settings({ theme: preference })
      })
    if (next === resolvedTheme || !origin || reduceMotion || !document.startViewTransition) {
      commit()
      return
    }
    const transition = document.startViewTransition(() => {
      document.documentElement.dataset.theme = next
      document.documentElement.classList.toggle('dark', next === 'dark')
      commit()
    })
    void transition.ready.then(() => {
      const radius = Math.hypot(
        Math.max(origin.x, window.innerWidth - origin.x),
        Math.max(origin.y, window.innerHeight - origin.y)
      )
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`
          ]
        },
        { duration: 560, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', pseudoElement: '::view-transition-new(root)' }
      )
    })
  }

  const openNew = useCallback(
    (date = view === 'calendar' ? selected : todayKey(), text?: string) =>
      setComposer({ date, text, category: filter === 'all' ? undefined : filter }),
    [view, selected, filter]
  )

  const restoreTask = (task: Task, index: number) =>
    update((current) => {
      const tasks = [...current.tasks]
      tasks.splice(Math.min(index, tasks.length), 0, task)
      return { ...current, tasks }
    })

  const deleteTask = (task: Task) => {
    if (!state) return
    const index = state.tasks.findIndex((item) => item.id === task.id)
    update((current) => ({
      ...current,
      activeTimer: current.activeTimer?.taskId === task.id ? null : current.activeTimer,
      tasks: current.tasks.filter((item) => item.id !== task.id)
    }))
    setComposer(null)
    showToast(`Deleted “${task.title}”`, { label: 'Undo', run: () => restoreTask(task, index) })
  }

  const handlers: TaskHandlers = {
    onToggle: (task, date) =>
      update((current) => ({
        ...current,
        activeTimer: current.activeTimer?.taskId === task.id ? null : current.activeTimer,
        tasks: current.tasks.map((item) => (item.id === task.id ? toggleTaskComplete(item, date) : item))
      })),
    onEdit: (task) => setComposer({ date: task.dueDate, taskId: task.id, draft: draftFor(task) }),
    onDelete: deleteTask,
    onTimer: (task) => {
      const durationSeconds = Math.max(60, task.estimateMinutes * 60)
      update((current) => ({
        ...current,
        activeTimer: { taskId: task.id, durationSeconds, endsAt: Date.now() + durationSeconds * 1000 }
      }))
    }
  }

  const saveTask = (draft: TaskDraft, taskId?: string) => {
    update((current) => ({
      ...current,
      tasks: taskId
        ? current.tasks.map((task) => (task.id === taskId ? applyDraft(task, draft) : task))
        : [...current.tasks, taskFromDraft(draft)]
    }))
    setComposer(null)
    if (!taskId && draft.dueDate !== todayKey())
      showToast(
        `Added for ${relativeDayLabel(draft.dueDate)}${draft.dueTime ? ` at ${timeLabel(draft.dueTime)}` : ''}`
      )
  }

  const quickAdd = (text: string) => {
    const parsed = parseQuickTask(text)
    if (!parsed.title) return
    const task = taskFromDraft({
      ...blankDraft(parsed.dueDate, parsed.category ?? (filter === 'all' ? 'personal' : filter)),
      title: parsed.title,
      dueTime: parsed.dueTime,
      estimateMinutes: 20,
      recurrence: parsed.recurrence ?? 'none',
      priority: parsed.important ? 1 : 2
    })
    update((current) => ({ ...current, tasks: [...current.tasks, task] }))
    if (parsed.dueDate !== todayKey())
      showToast(
        `Added for ${relativeDayLabel(parsed.dueDate)}${parsed.dueTime ? ` at ${timeLabel(parsed.dueTime)}` : ''}`,
        {
          label: 'Edit',
          run: () => setComposer({ date: task.dueDate, taskId: task.id, draft: draftFor(task) })
        }
      )
  }

  const pauseTimer = () =>
    update((current) => {
      if (!current.activeTimer) return current
      const timer = current.activeTimer
      const activeTimer: ActiveTimer =
        timer.pausedRemainingSeconds !== undefined
          ? {
              taskId: timer.taskId,
              durationSeconds: timer.durationSeconds,
              endsAt: Date.now() + timer.pausedRemainingSeconds * 1000
            }
          : {
              ...timer,
              pausedRemainingSeconds: Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000))
            }
      return { ...current, activeTimer }
    })
  const extendTimer = () =>
    update((current) => {
      const timer = current.activeTimer
      if (!timer) return current
      return {
        ...current,
        activeTimer: {
          ...timer,
          durationSeconds: timer.durationSeconds + 300,
          endsAt: timer.endsAt + 300_000,
          ...(timer.pausedRemainingSeconds !== undefined
            ? { pausedRemainingSeconds: timer.pausedRemainingSeconds + 300 }
            : {})
        }
      }
    })

  const checkin = (goal: Goal, date = todayKey()) =>
    update((current) => ({
      ...current,
      goals: current.goals.map((item) => (item.id === goal.id ? toggleCheckin(item, date) : item))
    }))

  const saveGoal = (draft: GoalDraft, goalId?: string) => {
    update((current) => ({
      ...current,
      goals: goalId
        ? current.goals.map((goal) =>
            goal.id === goalId
              ? {
                  ...goal,
                  title: draft.title.trim(),
                  emoji: draft.emoji,
                  color: draft.color,
                  weeklyTarget: draft.weeklyTarget,
                  updatedAt: new Date().toISOString()
                }
              : goal
          )
        : [...current.goals, goalFromDraft(draft)]
    }))
    setGoalSheet(null)
  }

  const deleteGoal = (goalId: string) => {
    if (!state) return
    const goal = state.goals.find((item) => item.id === goalId)
    const linked = state.tasks.filter((task) => task.goalId === goalId).map((task) => task.id)
    const index = state.goals.findIndex((item) => item.id === goalId)
    const unlink = (tasks: Task[]) =>
      tasks.map((task) =>
        task.goalId === goalId
          ? { ...task, goalId: undefined, updatedAt: new Date().toISOString() }
          : task
      )
    update((current) => ({
      ...current,
      goals: current.goals.filter((item) => item.id !== goalId),
      tasks: unlink(current.tasks)
    }))
    setGoalSheet(null)
    if (goal)
      showToast(`Deleted “${goal.title}”`, {
        label: 'Undo',
        run: () =>
          update((current) => {
            const goals = [...current.goals]
            goals.splice(index, 0, goal)
            return {
              ...current,
              goals,
              tasks: current.tasks.map((task) =>
                linked.includes(task.id)
                  ? { ...task, goalId: goal.id, updatedAt: new Date().toISOString() }
                  : task
              )
            }
          })
      })
  }

  // Keyboard shortcuts
  const sheetOpen = Boolean(composer || goalSheet)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !isTyping(event.target)) {
        if (toast?.action?.label === 'Undo') {
          event.preventDefault()
          toast.action.run()
          setToast(null)
        }
        return
      }
      if (sheetOpen || isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'n') {
        event.preventDefault()
        openNew()
      } else if (event.key === '/') {
        event.preventDefault()
        flushSync(() => setView('today'))
        document.getElementById('quick-add')?.focus()
      } else if (/^[1-4]$/.test(event.key)) {
        setView(views[Number(event.key) - 1].value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen, openNew, toast])

  if (!state)
    return (
      <div className="loading-shell">
        <LoaderCircle className="spin" size={16} />
        Getting today ready…
      </div>
    )

  const timer = state.activeTimer
  const timerTask = timer ? state.tasks.find((task) => task.id === timer.taskId) : undefined
  // Read the clock directly: `now` can lag by up to one tick right after a timer starts.
  const seconds = timer
    ? (timer.pausedRemainingSeconds ??
      Math.min(timer.durationSeconds, Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000))))
    : 0

  return (
    <MotionConfig reducedMotion="user">
      <main className={`app-shell ${timerTask ? 'has-timer' : ''}`}>
        <TitleBar
          pinned={state.settings.alwaysOnTop}
          ghost={state.settings.overlayMode}
          dark={resolvedTheme === 'dark'}
          sync={sync}
          onPin={() => {
            const value = !state.settings.alwaysOnTop
            settings({ alwaysOnTop: value })
            void window.dashboard.setAlwaysOnTop(value)
          }}
          onGhost={() => {
            const value = !state.settings.overlayMode
            settings({ overlayMode: value })
            void window.dashboard.setOpacity(value ? state.settings.overlayOpacity : state.settings.opacity)
          }}
          onTheme={(origin) => void applyTheme(resolvedTheme === 'dark' ? 'light' : 'dark', origin)}
        />
        <div className="app-body">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={view}
              className="view-frame"
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)', transition: { duration: 0.12 } }}
              transition={spring}
            >
              {view === 'today' && (
                <TodayView
                  state={state}
                  sync={sync}
                  filter={filter}
                  timerTaskId={timerTask?.id}
                  onFilter={setFilter}
                  onQuickAdd={quickAdd}
                  onDetails={(text) => openNew(todayKey(), text)}
                  onCheckin={(goal) => checkin(goal)}
                  onGoals={() => setView('goals')}
                  handlers={handlers}
                />
              )}
              {view === 'calendar' && (
                <CalendarView
                  tasks={state.tasks}
                  goals={state.goals}
                  filter={filter}
                  selected={selected}
                  month={month}
                  onFilter={setFilter}
                  onSelected={setSelected}
                  onMonth={setMonth}
                  onAdd={() => openNew(selected)}
                  handlers={handlers}
                />
              )}
              {view === 'goals' && (
                <GoalsView
                  goals={state.goals}
                  tasks={state.tasks}
                  onCheckin={checkin}
                  onCreate={(draft) => setGoalSheet({ draft })}
                  onEdit={(goal) => setGoalSheet({ goal })}
                />
              )}
              {view === 'settings' && (
                <SettingsView
                  settings={state.settings}
                  sync={sync}
                  onSync={setSync}
                  onSettings={settings}
                  onTheme={(theme, origin) => void applyTheme(theme, origin)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {timer && timerTask && (
            <FocusTimer
              task={timerTask}
              seconds={seconds}
              total={timer.durationSeconds}
              paused={timer.pausedRemainingSeconds !== undefined}
              onPause={pauseTimer}
              onExtend={extendTimer}
              onComplete={() => handlers.onToggle(timerTask, todayKey())}
              onClose={() => update((current) => ({ ...current, activeTimer: null }))}
            />
          )}
        </AnimatePresence>
        <Toast toast={toast} onDismiss={dismissToast} />
        <NavBar value={view} onChange={setView} onAdd={() => openNew()} />

        <Composer
          request={composer}
          goals={state.goals}
          onClose={() => setComposer(null)}
          onSave={saveTask}
          onDelete={(taskId) => {
            const task = state.tasks.find((item) => item.id === taskId)
            if (task) deleteTask(task)
          }}
        />
        <GoalSheet
          open={Boolean(goalSheet)}
          goal={goalSheet?.goal}
          draft={goalSheet?.draft}
          onClose={() => setGoalSheet(null)}
          onSave={saveGoal}
          onDelete={deleteGoal}
        />
      </main>
    </MotionConfig>
  )
}
