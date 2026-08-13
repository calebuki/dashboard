import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  BriefcaseBusiness,
  Blend,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GraduationCap,
  LayoutList,
  Minus,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Target,
  Trash2,
  UserRound,
  X
} from 'lucide-react'
import type {
  ActiveTimer,
  Category,
  DashboardSettings,
  DashboardState,
  Goal,
  Task,
  TaskDraft
} from './types'
import {
  calendarDays,
  changeMonth,
  formatLongDate,
  formatShortDate,
  fromDateKey,
  isSameMonth,
  monthTitle,
  startOfMonth,
  todayKey
} from './lib/date'
import {
  createInitialState,
  goalDay,
  rolloverTasks,
  taskFromDraft,
  taskIsCompleteOn,
  taskMatchesDate,
  toggleTaskComplete
} from './lib/state'

type View = 'today' | 'calendar' | 'settings'
type CategoryFilter = 'all' | Category

const categoryMeta: Record<Category, { label: string; icon: typeof UserRound }> = {
  personal: { label: 'Personal', icon: UserRound },
  work: { label: 'Work', icon: BriefcaseBusiness },
  school: { label: 'School', icon: GraduationCap }
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainder = safeSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function draftForTask(task: Task): TaskDraft {
  return {
    title: task.title,
    notes: task.notes,
    category: task.category,
    dueDate: task.dueDate,
    dueTime: task.dueTime ?? '',
    estimateMinutes: task.estimateMinutes,
    recurrence: task.recurrence?.kind ?? 'none',
    priority: task.priority,
    goalId: task.goalId
  }
}

function App() {
  const [state, setState] = useState<DashboardState | null>(null)
  const [view, setView] = useState<View>('today')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(todayKey()))
  const [composer, setComposer] = useState<{ date: string; task?: Task } | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const loaded = useRef(false)
  const notifiedTimer = useRef<string | null>(null)
  const currentDate = useRef(todayKey())

  useEffect(() => {
    void window.dashboard.loadState().then((stored) => {
      const next = rolloverTasks(stored ?? createInitialState())
      setState(next)
      loaded.current = true
      void window.dashboard.setAlwaysOnTop(next.settings.alwaysOnTop)
      void window.dashboard.setOpacity(
        next.settings.overlayMode ? next.settings.overlayOpacity : next.settings.opacity
      )
    })
  }, [])

  useEffect(() => {
    if (!state || !loaded.current) return
    const timeout = window.setTimeout(() => void window.dashboard.saveState(state), 180)
    return () => window.clearTimeout(timeout)
  }, [state])

  useEffect(() => {
    if (!state?.activeTimer || state.activeTimer.pausedRemainingSeconds !== undefined) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [state?.activeTimer?.endsAt, state?.activeTimer?.pausedRemainingSeconds])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextDate = todayKey()
      if (nextDate === currentDate.current) return
      const previousDate = currentDate.current
      currentDate.current = nextDate
      setState((current) => current ? rolloverTasks(current, nextDate) : current)
      setSelectedDate((selected) => selected === previousDate ? nextDate : selected)
      setVisibleMonth((month) => isSameMonth(month, previousDate) ? startOfMonth(nextDate) : month)
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!state?.activeTimer || state.activeTimer.pausedRemainingSeconds !== undefined) return
    const timer = state.activeTimer
    if (timer.endsAt > now || notifiedTimer.current === timer.taskId) return

    notifiedTimer.current = timer.taskId
    const task = state.tasks.find((item) => item.id === timer.taskId)
    if (state.settings.notifications) {
      void window.dashboard.notify({
        title: 'Time is up',
        body: task ? `${task.title} — check it off or add more time.` : 'Your task timer has finished.'
      })
    }
    setState((current) => (current ? { ...current, activeTimer: null } : current))
  }, [now, state?.activeTimer, state?.settings.notifications, state?.tasks])

  const updateSettings = (patch: Partial<DashboardSettings>) => {
    setState((current) =>
      current ? { ...current, settings: { ...current.settings, ...patch } } : current
    )
  }

  const toggleOverlay = () => {
    if (!state) return
    const overlayMode = !state.settings.overlayMode
    updateSettings({ overlayMode })
    void window.dashboard.setOpacity(
      overlayMode ? state.settings.overlayOpacity : state.settings.opacity
    )
  }

  const togglePin = () => {
    if (!state) return
    const enabled = !state.settings.alwaysOnTop
    updateSettings({ alwaysOnTop: enabled })
    void window.dashboard.setAlwaysOnTop(enabled)
  }

  const toggleTask = (task: Task, date = todayKey()) => {
    setState((current) => {
      if (!current) return current
      const completedTask = toggleTaskComplete(task, date)
      const activeTimer = current.activeTimer?.taskId === task.id ? null : current.activeTimer
      return {
        ...current,
        activeTimer,
        tasks: current.tasks.map((item) => (item.id === task.id ? completedTask : item))
      }
    })
  }

  const deleteTask = (taskId: string) => {
    setState((current) =>
      current
        ? {
            ...current,
            activeTimer: current.activeTimer?.taskId === taskId ? null : current.activeTimer,
            tasks: current.tasks.filter((task) => task.id !== taskId)
          }
        : current
    )
  }

  const saveDraft = (draft: TaskDraft) => {
    setState((current) => {
      if (!current) return current
      if (!composer?.task) return { ...current, tasks: [...current.tasks, taskFromDraft(draft)] }

      return {
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === composer.task?.id
            ? {
                ...task,
                title: draft.title.trim(),
                notes: draft.notes.trim(),
                category: draft.category,
                dueDate: draft.dueDate,
                dueTime: draft.dueTime || undefined,
                estimateMinutes: draft.estimateMinutes,
                recurrence: draft.recurrence === 'none' ? null : { kind: draft.recurrence },
                priority: draft.priority,
                goalId: draft.goalId,
                rolledOverFrom: undefined
              }
            : task
        )
      }
    })
    setComposer(null)
  }

  const startTimer = (task: Task) => {
    notifiedTimer.current = null
    const durationSeconds = Math.max(60, task.estimateMinutes * 60)
    setState((current) =>
      current
        ? {
            ...current,
            activeTimer: {
              taskId: task.id,
              durationSeconds,
              endsAt: Date.now() + durationSeconds * 1000
            }
          }
        : current
    )
  }

  const pauseOrResumeTimer = () => {
    setState((current) => {
      if (!current?.activeTimer) return current
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
  }

  if (!state) {
    return <div className="loading-shell">Getting today ready…</div>
  }

  const activeTimerTask = state.activeTimer
    ? state.tasks.find((task) => task.id === state.activeTimer?.taskId)
    : undefined
  const remainingSeconds = state.activeTimer
    ? (state.activeTimer.pausedRemainingSeconds ??
      Math.max(0, Math.ceil((state.activeTimer.endsAt - now) / 1000)))
    : 0

  return (
    <main className="app-shell">
      <TitleBar
        overlayMode={state.settings.overlayMode}
        pinned={state.settings.alwaysOnTop}
        onToggleOverlay={toggleOverlay}
        onTogglePin={togglePin}
      />

      <div className="app-body">
        {view === 'today' && (
          <TodayView
            state={state}
            category={category}
            goalOpen={goalOpen}
            onCategoryChange={setCategory}
            onGoalToggle={() => setGoalOpen((open) => !open)}
            onToggleTask={(task) => toggleTask(task)}
            onEditTask={(task) => setComposer({ date: task.dueDate, task })}
            onDeleteTask={deleteTask}
            onStartTimer={startTimer}
            onAdd={() => setComposer({ date: todayKey() })}
          />
        )}

        {view === 'calendar' && (
          <CalendarView
            tasks={state.tasks}
            category={category}
            selectedDate={selectedDate}
            visibleMonth={visibleMonth}
            onCategoryChange={setCategory}
            onSelectDate={setSelectedDate}
            onMonthChange={setVisibleMonth}
            onToggleTask={toggleTask}
            onEditTask={(task) => setComposer({ date: task.dueDate, task })}
            onDeleteTask={deleteTask}
            onStartTimer={startTimer}
            onAdd={() => setComposer({ date: selectedDate })}
          />
        )}

        {view === 'settings' && (
          <SettingsView
            settings={state.settings}
            onSettingsChange={updateSettings}
          />
        )}
      </div>

      {state.activeTimer && activeTimerTask && (
        <TimerBar
          task={activeTimerTask}
          seconds={remainingSeconds}
          paused={state.activeTimer.pausedRemainingSeconds !== undefined}
          onPauseResume={pauseOrResumeTimer}
          onReset={() => startTimer(activeTimerTask)}
          onClose={() => setState((current) => current ? { ...current, activeTimer: null } : current)}
        />
      )}

      <BottomNav view={view} onChange={setView} />

      {composer && (
        <TaskComposer
          initial={composer.task ? draftForTask(composer.task) : undefined}
          defaultDate={composer.date}
          goals={state.goals}
          onCancel={() => setComposer(null)}
          onSave={saveDraft}
        />
      )}
    </main>
  )
}

function TitleBar({
  overlayMode,
  pinned,
  onToggleOverlay,
  onTogglePin
}: {
  overlayMode: boolean
  pinned: boolean
  onToggleOverlay: () => void
  onTogglePin: () => void
}) {
  return (
    <header className="title-bar">
      <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
      <span className="brand-name">Dashboard</span>
      <div className="window-actions">
        <button
          className={overlayMode ? 'active' : ''}
          onClick={onToggleOverlay}
          aria-label={overlayMode ? 'Use regular opacity' : 'Use 50% overlay opacity'}
          title="Toggle 50% overlay"
        >
          <Blend size={14} />
        </button>
        <button
          className={pinned ? 'active' : ''}
          onClick={onTogglePin}
          aria-label={pinned ? 'Stop keeping above other apps' : 'Keep above other apps'}
          title="Always on top"
        >
          {pinned ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        <button onClick={() => window.dashboard.minimize()} aria-label="Minimize">
          <Minus size={14} />
        </button>
        <button onClick={() => window.dashboard.hide()} aria-label="Hide to tray">
          <X size={14} />
        </button>
      </div>
    </header>
  )
}

function TodayView({
  state,
  category,
  goalOpen,
  onCategoryChange,
  onGoalToggle,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onStartTimer,
  onAdd
}: {
  state: DashboardState
  category: CategoryFilter
  goalOpen: boolean
  onCategoryChange: (category: CategoryFilter) => void
  onGoalToggle: () => void
  onToggleTask: (task: Task) => void
  onEditTask: (task: Task) => void
  onDeleteTask: (taskId: string) => void
  onStartTimer: (task: Task) => void
  onAdd: () => void
}) {
  const today = todayKey()
  const tasks = state.tasks
    .filter((task) => taskMatchesDate(task, today))
    .filter((task) => category === 'all' || task.category === category)
    .sort((left, right) => {
      const completion = Number(taskIsCompleteOn(left, today)) - Number(taskIsCompleteOn(right, today))
      if (completion !== 0) return completion
      if (left.priority !== right.priority) return left.priority - right.priority
      return (left.dueTime ?? '99:99').localeCompare(right.dueTime ?? '99:99')
    })
  const completed = tasks.filter((task) => taskIsCompleteOn(task, today)).length
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0
  const goal = state.goals[0]

  return (
    <section className="view-panel today-view">
      <div className="today-heading">
        <div>
          <p className="eyebrow">{formatLongDate(today)}</p>
          <h1>Right now</h1>
        </div>
        <div className="progress-orbit" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}>
          <span>{completed}/{tasks.length}</span>
        </div>
      </div>

      {goal && <GoalCard goal={goal} tasks={state.tasks} open={goalOpen} onToggle={onGoalToggle} />}

      <CategoryTabs value={category} onChange={onCategoryChange} />

      <div className="task-section-heading">
        <span>{completed === tasks.length && tasks.length > 0 ? 'All clear' : 'Next actions'}</span>
        <span>{tasks.reduce((sum, task) => sum + (taskIsCompleteOn(task, today) ? 0 : task.estimateMinutes), 0)} min left</span>
      </div>

      <div className="task-list">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            date={today}
            onToggle={() => onToggleTask(task)}
            onEdit={() => onEditTask(task)}
            onDelete={() => onDeleteTask(task.id)}
            onStartTimer={() => onStartTimer(task)}
          />
        ))}
        {tasks.length === 0 && (
          <EmptyState
            title="Nothing due here"
            body="Add one concrete next action, or enjoy the clear space."
          />
        )}
      </div>

      <button className="add-task-button" onClick={onAdd}>
        <Plus size={18} /> Add a task
      </button>
    </section>
  )
}

function GoalCard({ goal, tasks, open, onToggle }: { goal: Goal; tasks: Task[]; open: boolean; onToggle: () => void }) {
  const day = goalDay(goal)
  const goalTasks = tasks.filter((task) => task.goalId === goal.id)
  const completedSessions = goalTasks.reduce((sum, task) => sum + task.completedDates.length, 0)
  const phaseIndex = day <= 56 ? 0 : day <= 140 ? 1 : day <= 252 ? 2 : 3

  return (
    <article className={`goal-card ${open ? 'open' : ''}`}>
      <button className="goal-summary" onClick={onToggle} aria-expanded={open}>
        <div className="goal-icon"><Target size={18} /></div>
        <div className="goal-copy">
          <span className="goal-kicker">12-month goal · Day {day}</span>
          <strong>{goal.title}</strong>
          <span>{goal.phases[phaseIndex]?.title} · {completedSessions} sessions done</span>
        </div>
        <ChevronDown size={17} className="goal-chevron" />
      </button>
      {open && (
        <div className="goal-plan">
          <div className="goal-progress-track"><span style={{ width: `${(day / 365) * 100}%` }} /></div>
          {goal.phases.map((phase, index) => (
            <div key={phase.title} className={`phase-row ${index === phaseIndex ? 'current' : ''}`}>
              <span className="phase-dot">{index < phaseIndex ? <Check size={11} /> : index + 1}</span>
              <div><strong>{phase.title}</strong><span>{phase.range}</span><p>{phase.outcome}</p></div>
            </div>
          ))}
          <p className="goal-footnote">Target: {formatShortDate(goal.targetDate)} · 30–60 minutes most days</p>
        </div>
      )}
    </article>
  )
}

function CategoryTabs({ value, onChange }: { value: CategoryFilter; onChange: (value: CategoryFilter) => void }) {
  return (
    <div className="category-tabs" role="tablist" aria-label="Task category">
      <button className={value === 'all' ? 'active' : ''} onClick={() => onChange('all')}>All</button>
      {(Object.entries(categoryMeta) as [Category, (typeof categoryMeta)[Category]][]).map(([key, meta]) => (
        <button key={key} className={value === key ? `active ${key}` : key} onClick={() => onChange(key)}>
          {meta.label}
        </button>
      ))}
    </div>
  )
}

function TaskCard({
  task,
  date,
  onToggle,
  onEdit,
  onDelete,
  onStartTimer
}: {
  task: Task
  date: string
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onStartTimer: () => void
}) {
  const complete = taskIsCompleteOn(task, date)
  const CategoryIcon = categoryMeta[task.category].icon

  return (
    <article className={`task-card ${task.category} ${complete ? 'complete' : ''}`}>
      <button className="task-check" onClick={onToggle} aria-label={complete ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}>
        {complete && <Check size={15} strokeWidth={3} />}
      </button>
      <div className="task-main">
        <button className="task-title" onClick={onEdit}>{task.title}</button>
        <div className="task-meta">
          <span className={`category-label ${task.category}`}><CategoryIcon size={12} />{categoryMeta[task.category].label}</span>
          {task.dueTime && <span><Clock3 size={12} />{task.dueTime}</span>}
          <span>{task.estimateMinutes} min</span>
          {task.recurrence && <span><RotateCcw size={11} />{task.recurrence.kind}</span>}
          {task.rolledOverFrom && !complete && <span className="carried">carried over</span>}
        </div>
      </div>
      {!complete && (
        <button className="task-timer" onClick={onStartTimer} aria-label={`Start ${task.estimateMinutes} minute timer`} title="Start timer">
          <Play size={15} fill="currentColor" />
        </button>
      )}
      <div className="task-actions">
        <button onClick={onEdit} aria-label={`Edit ${task.title}`}><Pencil size={14} /></button>
        <button onClick={onDelete} aria-label={`Delete ${task.title}`}><Trash2 size={14} /></button>
      </div>
    </article>
  )
}

function CalendarView({
  tasks,
  category,
  selectedDate,
  visibleMonth,
  onCategoryChange,
  onSelectDate,
  onMonthChange,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onStartTimer,
  onAdd
}: {
  tasks: Task[]
  category: CategoryFilter
  selectedDate: string
  visibleMonth: string
  onCategoryChange: (category: CategoryFilter) => void
  onSelectDate: (date: string) => void
  onMonthChange: (date: string) => void
  onToggleTask: (task: Task, date: string) => void
  onEditTask: (task: Task) => void
  onDeleteTask: (taskId: string) => void
  onStartTimer: (task: Task) => void
  onAdd: () => void
}) {
  const filteredTasks = tasks.filter((task) => category === 'all' || task.category === category)
  const selectedTasks = filteredTasks
    .filter((task) => taskMatchesDate(task, selectedDate))
    .sort((left, right) => (left.dueTime ?? '99:99').localeCompare(right.dueTime ?? '99:99'))
  const days = calendarDays(visibleMonth)

  return (
    <section className="view-panel calendar-view">
      <div className="calendar-heading">
        <div><p className="eyebrow">Plan ahead</p><h1>Calendar</h1></div>
        <div className="month-controls">
          <button onClick={() => onMonthChange(changeMonth(visibleMonth, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <strong>{monthTitle(visibleMonth)}</strong>
          <button onClick={() => onMonthChange(changeMonth(visibleMonth, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
      </div>

      <CategoryTabs value={category} onChange={onCategoryChange} />

      <div className="calendar-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span className="weekday" key={`${day}-${index}`}>{day}</span>)}
        {days.map((date) => {
          const dayTasks = filteredTasks.filter((task) => taskMatchesDate(task, date))
          const selected = date === selectedDate
          const isToday = date === todayKey()
          return (
            <button
              key={date}
              className={`calendar-day ${selected ? 'selected' : ''} ${isToday ? 'today' : ''} ${!isSameMonth(date, visibleMonth) ? 'outside' : ''}`}
              onClick={() => onSelectDate(date)}
              aria-label={`${formatLongDate(date)}, ${dayTasks.length} tasks`}
            >
              <span>{fromDateKey(date).getDate()}</span>
              <div className="calendar-dots">
                {Array.from(new Set(dayTasks.map((task) => task.category))).slice(0, 3).map((taskCategory) => (
                  <i key={taskCategory} className={taskCategory} />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      <div className="agenda-heading">
        <div><span>{selectedDate === todayKey() ? 'Today' : formatLongDate(selectedDate)}</span><small>{selectedTasks.length} {selectedTasks.length === 1 ? 'task' : 'tasks'}</small></div>
        <button onClick={onAdd}><Plus size={16} /> Add</button>
      </div>

      <div className="task-list compact-list">
        {selectedTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            date={selectedDate}
            onToggle={() => onToggleTask(task, selectedDate)}
            onEdit={() => onEditTask(task)}
            onDelete={() => onDeleteTask(task.id)}
            onStartTimer={() => onStartTimer(task)}
          />
        ))}
        {selectedTasks.length === 0 && <EmptyState title="Open day" body="Nothing is scheduled here yet." />}
      </div>
    </section>
  )
}

function SettingsView({
  settings,
  onSettingsChange
}: {
  settings: DashboardSettings
  onSettingsChange: (patch: Partial<DashboardSettings>) => void
}) {
  const shownOpacity = settings.overlayMode ? settings.overlayOpacity : settings.opacity
  const changeOpacity = (value: number) => {
    const key = settings.overlayMode ? 'overlayOpacity' : 'opacity'
    onSettingsChange({ [key]: value })
    void window.dashboard.setOpacity(value)
  }

  return (
    <section className="view-panel settings-view">
      <div className="settings-heading"><div><p className="eyebrow">Make it yours</p><h1>Settings</h1></div></div>

      <div className="settings-group">
        <span className="settings-label">Window</span>
        <SettingRow
          icon={settings.alwaysOnTop ? Pin : PinOff}
          title="Always on top"
          detail="Stay above Chrome, Discord, Spotify, and other windows."
          control={<Switch checked={settings.alwaysOnTop} onChange={(checked) => {
            onSettingsChange({ alwaysOnTop: checked })
            void window.dashboard.setAlwaysOnTop(checked)
          }} />}
        />
        <div className="setting-row opacity-row">
          <div className="setting-icon"><Blend size={17} /></div>
          <div className="setting-copy"><strong>Window opacity</strong><span>{Math.round(shownOpacity * 100)}% · {settings.overlayMode ? 'overlay mode' : 'regular mode'}</span></div>
          <input
            aria-label="Window opacity"
            type="range"
            min="40"
            max="100"
            value={Math.round(shownOpacity * 100)}
            onChange={(event) => changeOpacity(Number(event.target.value) / 100)}
          />
        </div>
        <SettingRow
          icon={Blend}
          title="50% overlay mode"
          detail="Use the half-opacity button in the title bar to switch quickly."
          control={<Switch checked={settings.overlayMode} onChange={(checked) => {
            onSettingsChange({ overlayMode: checked })
            void window.dashboard.setOpacity(checked ? settings.overlayOpacity : settings.opacity)
          }} />}
        />
      </div>

      <div className="settings-group">
        <span className="settings-label">System</span>
        <SettingRow
          icon={RotateCcw}
          title="Open when Windows starts"
          detail="Start quietly in the system tray."
          control={<Switch checked={settings.launchAtLogin} onChange={(checked) => {
            onSettingsChange({ launchAtLogin: checked })
            void window.dashboard.setLaunchAtLogin(checked)
          }} />}
        />
        <SettingRow
          icon={Bell}
          title="Timer notifications"
          detail="Notify when a focused task timer ends."
          control={<Switch checked={settings.notifications} onChange={(checked) => onSettingsChange({ notifications: checked })} />}
        />
      </div>

      <div className="privacy-note">
        <strong>Your dashboard stays on this PC.</strong>
        <span>No login, cloud sync, tracking, or account connection. Closing the window keeps it available in the tray.</span>
      </div>
      <p className="shortcut-note">Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd> anywhere to show or hide Dashboard.</p>
    </section>
  )
}

function SettingRow({ icon: Icon, title, detail, control }: { icon: typeof Pin; title: string; detail: string; control: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-icon"><Icon size={17} /></div>
      <div className="setting-copy"><strong>{title}</strong><span>{detail}</span></div>
      {control}
    </div>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <button className={`switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>
}

function BottomNav({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Dashboard views">
      <button className={view === 'today' ? 'active' : ''} onClick={() => onChange('today')}><LayoutList size={18} /><span>Today</span></button>
      <button className={view === 'calendar' ? 'active' : ''} onClick={() => onChange('calendar')}><CalendarDays size={18} /><span>Calendar</span></button>
      <button className={view === 'settings' ? 'active' : ''} onClick={() => onChange('settings')}><Settings size={18} /><span>Settings</span></button>
    </nav>
  )
}

function TimerBar({ task, seconds, paused, onPauseResume, onReset, onClose }: {
  task: Task
  seconds: number
  paused: boolean
  onPauseResume: () => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <aside className="timer-bar">
      <div className="timer-pulse" />
      <div className="timer-copy"><span>{paused ? 'Paused' : 'Focus timer'}</span><strong>{task.title}</strong></div>
      <time>{formatCountdown(seconds)}</time>
      <button onClick={onPauseResume} aria-label={paused ? 'Resume timer' : 'Pause timer'}>{paused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}</button>
      <button onClick={onReset} aria-label="Reset timer"><RotateCcw size={15} /></button>
      <button onClick={onClose} aria-label="Close timer"><X size={15} /></button>
    </aside>
  )
}

function TaskComposer({
  initial,
  defaultDate,
  goals,
  onCancel,
  onSave
}: {
  initial?: TaskDraft
  defaultDate: string
  goals: Goal[]
  onCancel: () => void
  onSave: (draft: TaskDraft) => void
}) {
  const [draft, setDraft] = useState<TaskDraft>(initial ?? {
    title: '',
    notes: '',
    category: 'personal',
    dueDate: defaultDate,
    dueTime: '',
    estimateMinutes: 20,
    recurrence: 'none',
    priority: 2
  })

  const patchDraft = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="composer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <form className="task-composer" onSubmit={(event) => {
        event.preventDefault()
        if (draft.title.trim()) onSave(draft)
      }}>
        <div className="composer-heading">
          <div><p className="eyebrow">{initial ? 'Change the plan' : 'Capture the next action'}</p><h2>{initial ? 'Edit task' : 'New task'}</h2></div>
          <button type="button" onClick={onCancel} aria-label="Close"><X size={18} /></button>
        </div>

        <label className="field full"><span>What needs doing?</span><input autoFocus value={draft.title} onChange={(event) => patchDraft('title', event.target.value)} placeholder="One clear next action" /></label>

        <fieldset className="composer-categories">
          <legend>Area</legend>
          {(Object.entries(categoryMeta) as [Category, (typeof categoryMeta)[Category]][]).map(([key, meta]) => {
            const Icon = meta.icon
            return <button type="button" key={key} className={`${key} ${draft.category === key ? 'active' : ''}`} onClick={() => patchDraft('category', key)}><Icon size={14} />{meta.label}</button>
          })}
        </fieldset>

        <div className="field-grid">
          <label className="field"><span>Date</span><input type="date" value={draft.dueDate} onChange={(event) => patchDraft('dueDate', event.target.value)} required /></label>
          <label className="field"><span>Time</span><input type="time" value={draft.dueTime} onChange={(event) => patchDraft('dueTime', event.target.value)} /></label>
          <label className="field"><span>Time limit</span><div className="input-suffix"><input type="number" min="1" max="480" value={draft.estimateMinutes} onChange={(event) => patchDraft('estimateMinutes', Math.max(1, Number(event.target.value)))} /><span>min</span></div></label>
          <label className="field"><span>Repeat</span><select value={draft.recurrence} onChange={(event) => patchDraft('recurrence', event.target.value as TaskDraft['recurrence'])}><option value="none">Doesn't repeat</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option></select></label>
        </div>

        <label className="field full"><span>Notes <i>optional</i></span><textarea rows={3} value={draft.notes} onChange={(event) => patchDraft('notes', event.target.value)} placeholder="Context, phone number, or the first tiny step" /></label>

        {goals.length > 0 && (
          <label className="field full"><span>Goal <i>optional</i></span><select value={draft.goalId ?? ''} onChange={(event) => patchDraft('goalId', event.target.value || undefined)}><option value="">No linked goal</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>
        )}

        <div className="composer-actions"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="submit" className="primary" disabled={!draft.title.trim()}>{initial ? 'Save changes' : 'Add task'}</button></div>
      </form>
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><div><Check size={18} /></div><strong>{title}</strong><span>{body}</span></div>
}

export default App
