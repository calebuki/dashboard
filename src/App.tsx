import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  Blend,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cloud,
  CloudOff,
  GraduationCap,
  LayoutList,
  LoaderCircle,
  Minus,
  MoreHorizontal,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  WifiOff,
  X
} from 'lucide-react'
import { DurationPicker } from '@/components/ui/duration-picker'
import { GooeyNav } from '@/components/ui/gooey-nav'
import { OtpInput, type OtpStatus } from '@/components/ui/otp-input'
import type {
  ActiveTimer,
  Category,
  DashboardSettings,
  DashboardState,
  Goal,
  SyncStatus,
  Task,
  TaskDraft
} from './types'
import {
  addDays,
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
import { nextWeekend, parseFlexibleTime, parseQuickTask } from './lib/quick-add'
import {
  createInitialState,
  goalDay,
  normalizeDashboardState,
  rolloverTasks,
  taskFromDraft,
  taskIsCompleteOn,
  taskMatchesDate,
  toggleTaskComplete
} from './lib/state'

type View = 'today' | 'calendar' | 'settings'
type Filter = 'all' | Category
const areas: Record<Category, { label: string; icon: typeof UserRound }> = {
  personal: { label: 'Personal', icon: UserRound },
  work: { label: 'Work', icon: BriefcaseBusiness },
  school: { label: 'School', icon: GraduationCap }
}
const noSync: SyncStatus = {
  configured: false,
  signedIn: false,
  phase: 'unavailable',
  message: 'Cloud sync is not configured in this build.'
}
const timeLabel = (time?: string) => {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`
}
const countdown = (seconds: number) =>
  `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`
const draftFor = (task: Task): TaskDraft => ({
  title: task.title,
  notes: task.notes,
  category: task.category,
  dueDate: task.dueDate,
  dueTime: task.dueTime ?? '',
  estimateMinutes: task.estimateMinutes,
  recurrence: task.recurrence?.kind ?? 'none',
  priority: task.priority,
  goalId: task.goalId
})

export default function App() {
  const [state, setState] = useState<DashboardState | null>(null)
  const [sync, setSync] = useState<SyncStatus>(noSync)
  const [view, setView] = useState<View>('today')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState(todayKey())
  const [month, setMonth] = useState(startOfMonth(todayKey()))
  const [composer, setComposer] = useState<{
    date: string
    task?: Task
  } | null>(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [now, setNow] = useState(Date.now())
  const loaded = useRef(false)

  useEffect(() => {
    document.documentElement.classList.add('dark', `platform-${window.dashboard.platform}`)
    const offSync = window.dashboard.onSyncStatus(setSync)
    const offRemote = window.dashboard.onRemoteState((remote) =>
      setState(rolloverTasks(normalizeDashboardState(remote)))
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
    return () => {
      offSync()
      offRemote()
    }
  }, [])
  useEffect(() => {
    if (!state || !loaded.current) return
    const id = window.setTimeout(() => void window.dashboard.saveState(state), 220)
    return () => clearTimeout(id)
  }, [state])
  useEffect(() => {
    if (!state?.activeTimer || state.activeTimer.pausedRemainingSeconds !== undefined) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state?.activeTimer])
  useEffect(() => {
    if (
      !state?.activeTimer ||
      state.activeTimer.pausedRemainingSeconds !== undefined ||
      state.activeTimer.endsAt > now
    )
      return
    const task = state.tasks.find((item) => item.id === state.activeTimer?.taskId)
    if (state.settings.notifications)
      void window.dashboard.notify({
        title: 'Time is up',
        body: task ? `${task.title} — check it off or add more time.` : 'Your timer finished.'
      })
    setState((current) => (current ? { ...current, activeTimer: null } : current))
  }, [now, state?.activeTimer, state?.settings.notifications, state?.tasks])

  if (!state)
    return (
      <div className="loading-shell">
        <LoaderCircle className="spin" />
        Getting today ready…
      </div>
    )
  const settings = (patch: Partial<DashboardSettings>) =>
    setState((current) =>
      current ? { ...current, settings: { ...current.settings, ...patch } } : current
    )
  const toggle = (task: Task, date = todayKey()) =>
    setState((current) =>
      current
        ? {
            ...current,
            activeTimer: current.activeTimer?.taskId === task.id ? null : current.activeTimer,
            tasks: current.tasks.map((item) =>
              item.id === task.id ? toggleTaskComplete(task, date) : item
            )
          }
        : current
    )
  const remove = (id: string) =>
    setState((current) =>
      current
        ? {
            ...current,
            activeTimer: current.activeTimer?.taskId === id ? null : current.activeTimer,
            tasks: current.tasks.filter((task) => task.id !== id)
          }
        : current
    )
  const save = (draft: TaskDraft) => {
    setState((current) => {
      if (!current) return current
      if (!composer?.task) return { ...current, tasks: [...current.tasks, taskFromDraft(draft)] }
      return {
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === composer.task?.id
            ? {
                ...task,
                ...draft,
                dueTime: draft.dueTime || undefined,
                recurrence: draft.recurrence === 'none' ? null : { kind: draft.recurrence },
                rolledOverFrom: undefined,
                updatedAt: new Date().toISOString()
              }
            : task
        )
      }
    })
    setComposer(null)
  }
  const quickAdd = (text: string) => {
    const parsed = parseQuickTask(text)
    if (!parsed.title) return
    setState((current) =>
      current
        ? {
            ...current,
            tasks: [
              ...current.tasks,
              taskFromDraft({
                title: parsed.title,
                notes: '',
                category: filter === 'all' ? 'personal' : filter,
                dueDate: parsed.dueDate,
                dueTime: parsed.dueTime,
                estimateMinutes: 20,
                recurrence: 'none',
                priority: 2
              })
            ]
          }
        : current
    )
  }
  const start = (task: Task) => {
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
  const pause = () =>
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
  const timerTask = state.activeTimer
    ? state.tasks.find((task) => task.id === state.activeTimer?.taskId)
    : undefined
  const seconds = state.activeTimer
    ? (state.activeTimer.pausedRemainingSeconds ??
      Math.max(0, Math.ceil((state.activeTimer.endsAt - now) / 1000)))
    : 0
  const pin = () => {
    const value = !state.settings.alwaysOnTop
    settings({ alwaysOnTop: value })
    void window.dashboard.setAlwaysOnTop(value)
  }
  const overlay = () => {
    const value = !state.settings.overlayMode
    settings({ overlayMode: value })
    void window.dashboard.setOpacity(value ? state.settings.overlayOpacity : state.settings.opacity)
  }

  return (
    <main className="app-shell">
      <TitleBar
        pinned={state.settings.alwaysOnTop}
        overlay={state.settings.overlayMode}
        sync={sync}
        onPin={pin}
        onOverlay={overlay}
      />
      <div className="app-body">
        {view === 'today' && (
          <Today
            state={state}
            filter={filter}
            sync={sync}
            goalOpen={goalOpen}
            onFilter={setFilter}
            onGoal={() => setGoalOpen(!goalOpen)}
            onToggle={toggle}
            onEdit={(task) => setComposer({ date: task.dueDate, task })}
            onDelete={remove}
            onTimer={start}
            onQuick={quickAdd}
            onAdd={() => setComposer({ date: todayKey() })}
          />
        )}
        {view === 'calendar' && (
          <Calendar
            tasks={state.tasks}
            filter={filter}
            selected={selected}
            month={month}
            onFilter={setFilter}
            onSelected={setSelected}
            onMonth={setMonth}
            onToggle={toggle}
            onEdit={(task) => setComposer({ date: task.dueDate, task })}
            onDelete={remove}
            onTimer={start}
            onAdd={() => setComposer({ date: selected })}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            settings={state.settings}
            sync={sync}
            onSync={setSync}
            onSettings={settings}
          />
        )}
      </div>
      {state.activeTimer && timerTask && (
        <Timer
          task={timerTask}
          seconds={seconds}
          paused={state.activeTimer.pausedRemainingSeconds !== undefined}
          onPause={pause}
          onReset={() => start(timerTask)}
          onClose={() => setState({ ...state, activeTimer: null })}
        />
      )}
      <GooeyNav<View>
        className="bottom-nav"
        value={view}
        onChange={setView}
        items={[
          { value: 'today', label: 'Today', icon: <LayoutList size={17} /> },
          {
            value: 'calendar',
            label: 'Calendar',
            icon: <CalendarDays size={17} />
          },
          {
            value: 'settings',
            label: 'Settings',
            icon: <Settings size={17} />
          }
        ]}
      />
      {composer && (
        <Composer
          initial={composer.task ? draftFor(composer.task) : undefined}
          defaultDate={composer.date}
          goals={state.goals}
          onCancel={() => setComposer(null)}
          onSave={save}
        />
      )}
    </main>
  )
}

function SyncPill({ status }: { status: SyncStatus }) {
  const Icon =
    status.phase === 'offline'
      ? WifiOff
      : status.phase === 'error' || status.phase === 'unavailable'
        ? CloudOff
        : status.phase === 'syncing'
          ? LoaderCircle
          : Cloud
  const text =
    status.phase === 'synced'
      ? 'Synced'
      : status.phase === 'syncing'
        ? 'Syncing'
        : status.phase === 'offline'
          ? 'Offline'
          : status.signedIn
            ? 'Issue'
            : 'Local'
  return (
    <span className={`sync-pill ${status.phase}`} title={status.message ?? text}>
      <Icon className={status.phase === 'syncing' ? 'spin' : ''} size={12} />
      {text}
    </span>
  )
}
function TitleBar({
  pinned,
  overlay,
  sync,
  onPin,
  onOverlay
}: {
  pinned: boolean
  overlay: boolean
  sync: SyncStatus
  onPin: () => void
  onOverlay: () => void
}) {
  const mac = window.dashboard.platform === 'darwin'
  return (
    <header className="title-bar">
      <div className="brand-mark">
        <i />
        <i />
        <i />
      </div>
      <b>Dashboard</b>
      <SyncPill status={sync} />
      <div className="window-actions">
        <button
          aria-label="Toggle overlay opacity"
          className={overlay ? 'active' : ''}
          onClick={onOverlay}
        >
          <Blend size={14} />
        </button>
        <button
          aria-label="Toggle always on top"
          className={pinned ? 'active' : ''}
          onClick={onPin}
        >
          {pinned ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        {!mac && (
          <button aria-label="Minimize" onClick={() => window.dashboard.minimize()}>
            <Minus size={14} />
          </button>
        )}
        {!mac && (
          <button aria-label="Hide to tray" onClick={() => window.dashboard.hide()}>
            <X size={14} />
          </button>
        )}
      </div>
    </header>
  )
}

function Today({
  state,
  filter,
  sync,
  goalOpen,
  onFilter,
  onGoal,
  onToggle,
  onEdit,
  onDelete,
  onTimer,
  onQuick,
  onAdd
}: {
  state: DashboardState
  filter: Filter
  sync: SyncStatus
  goalOpen: boolean
  onFilter: (v: Filter) => void
  onGoal: () => void
  onToggle: (t: Task) => void
  onEdit: (t: Task) => void
  onDelete: (id: string) => void
  onTimer: (t: Task) => void
  onQuick: (v: string) => void
  onAdd: () => void
}) {
  const today = todayKey()
  const tasks = state.tasks
    .filter((t) => taskMatchesDate(t, today) && (filter === 'all' || t.category === filter))
    .sort(
      (a, b) =>
        Number(taskIsCompleteOn(a, today)) - Number(taskIsCompleteOn(b, today)) ||
        a.priority - b.priority ||
        (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99')
    )
  const done = tasks.filter((t) => taskIsCompleteOn(t, today)).length
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  return (
    <section className="view-panel">
      <div className="today-heading">
        <div>
          <p className="eyebrow">{formatLongDate(today)}</p>
          <h1>Make today lighter.</h1>
        </div>
        <div
          className="progress-orbit"
          style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}
        >
          <span>{progress}%</span>
        </div>
      </div>
      <QuickAdd onAdd={onQuick} onMore={onAdd} />
      {sync.phase === 'offline' && (
        <div className="inline-notice">
          <WifiOff size={14} />
          Changes are safe and will sync later.
        </div>
      )}
      {state.goals[0] && (
        <GoalCard goal={state.goals[0]} tasks={state.tasks} open={goalOpen} onToggle={onGoal} />
      )}
      <Filters value={filter} onChange={onFilter} />
      <div className="task-section-heading">
        <span>{tasks.length - done} left</span>
        <span>
          {tasks.reduce((sum, t) => sum + (taskIsCompleteOn(t, today) ? 0 : t.estimateMinutes), 0)}{' '}
          min
        </span>
      </div>
      <div className="task-list">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            date={today}
            onToggle={() => onToggle(task)}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task.id)}
            onTimer={() => onTimer(task)}
          />
        ))}
        {!tasks.length && (
          <Empty
            title="A clean slate"
            body="Type one thing above. Natural dates and times work too."
          />
        )}
      </div>
    </section>
  )
}
function QuickAdd({ onAdd, onMore }: { onAdd: (v: string) => void; onMore: () => void }) {
  const [value, setValue] = useState('')
  const parsed = useMemo(() => (value.trim() ? parseQuickTask(value) : null), [value])
  const submit = () => {
    if (!value.trim()) return
    onAdd(value)
    setValue('')
  }
  return (
    <div className="quick-capture">
      <div>
        <Sparkles size={17} />
        <input
          aria-label="Quick add a task"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Try “Call Maya tomorrow at 6”"
        />
        <button aria-label="Add task" disabled={!value.trim()} onClick={submit}>
          <Plus size={17} />
        </button>
      </div>
      <footer>
        <span>
          {parsed
            ? `${parsed.dueDate === todayKey() ? 'Today' : formatShortDate(parsed.dueDate)}${parsed.dueTime ? ` · ${timeLabel(parsed.dueTime)}` : ''}`
            : 'Press Enter to add'}
        </span>
        <button onClick={onMore}>
          More options <MoreHorizontal size={13} />
        </button>
      </footer>
    </div>
  )
}
function Filters({ value, onChange }: { value: Filter; onChange: (v: Filter) => void }) {
  return (
    <div className="category-tabs">
      {(['all', 'personal', 'work', 'school'] as Filter[]).map((item) => (
        <button
          key={item}
          className={`${item} ${value === item ? 'active' : ''}`}
          onClick={() => onChange(item)}
        >
          {item === 'all' ? 'All' : areas[item].label}
        </button>
      ))}
    </div>
  )
}
function GoalCard({
  goal,
  tasks,
  open,
  onToggle
}: {
  goal: Goal
  tasks: Task[]
  open: boolean
  onToggle: () => void
}) {
  const day = goalDay(goal)
  const phase = day <= 56 ? 0 : day <= 140 ? 1 : day <= 252 ? 2 : 3
  return (
    <article className={`goal-card ${open ? 'open' : ''}`}>
      <button className="goal-summary" onClick={onToggle}>
        <span className="goal-icon">
          <Target size={18} />
        </span>
        <span className="goal-copy">
          <small>DAY {day} · LONG VIEW</small>
          <strong>{goal.title}</strong>
          <i>
            {tasks
              .filter((t) => t.goalId === goal.id)
              .reduce((n, t) => n + t.completedDates.length, 0)}{' '}
            sessions
          </i>
        </span>
        <ChevronDown size={17} />
      </button>
      {open && (
        <div className="goal-plan">
          <div className="goal-progress">
            <i style={{ width: `${(day / 365) * 100}%` }} />
          </div>
          {goal.phases.map((p, i) => (
            <div className={`phase-row ${i === phase ? 'current' : ''}`} key={p.title}>
              <span>{i < phase ? <Check size={11} /> : i + 1}</span>
              <div>
                <strong>{p.title}</strong>
                <small>{p.range}</small>
                <p>{p.outcome}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
function TaskCard({
  task,
  date,
  onToggle,
  onEdit,
  onDelete,
  onTimer
}: {
  task: Task
  date: string
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onTimer: () => void
}) {
  const done = taskIsCompleteOn(task, date)
  const Icon = areas[task.category].icon
  return (
    <article className={`task-card ${task.category} ${done ? 'complete' : ''}`}>
      <button
        aria-label={done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
        className="task-check"
        onClick={onToggle}
      >
        {done && <Check size={14} />}
      </button>
      <div className="task-main">
        <button className="task-title" onClick={onEdit}>
          {task.title}
        </button>
        <div className="task-meta">
          <span className={task.category}>
            <Icon size={11} />
            {areas[task.category].label}
          </span>
          {task.dueTime && (
            <span>
              <Clock3 size={11} />
              {timeLabel(task.dueTime)}
            </span>
          )}
          <span>{task.estimateMinutes}m</span>
          {task.recurrence && (
            <span>
              <RotateCcw size={10} />
              {task.recurrence.kind}
            </span>
          )}
        </div>
      </div>
      {!done && (
        <button
          aria-label={`Start ${task.estimateMinutes} minute timer`}
          className="task-timer"
          onClick={onTimer}
        >
          <Play size={14} />
        </button>
      )}
      <div className="task-actions">
        <button aria-label={`Edit ${task.title}`} onClick={onEdit}>
          <Pencil size={14} />
        </button>
        <button aria-label={`Delete ${task.title}`} onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  )
}

function Calendar({
  tasks,
  filter,
  selected,
  month,
  onFilter,
  onSelected,
  onMonth,
  onToggle,
  onEdit,
  onDelete,
  onTimer,
  onAdd
}: {
  tasks: Task[]
  filter: Filter
  selected: string
  month: string
  onFilter: (v: Filter) => void
  onSelected: (v: string) => void
  onMonth: (v: string) => void
  onToggle: (t: Task, d: string) => void
  onEdit: (t: Task) => void
  onDelete: (id: string) => void
  onTimer: (t: Task) => void
  onAdd: () => void
}) {
  const filtered = tasks.filter((t) => filter === 'all' || t.category === filter)
  const agenda = filtered.filter((t) => taskMatchesDate(t, selected))
  return (
    <section className="view-panel">
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">THE SHAPE OF YOUR MONTH</p>
          <h1>Calendar</h1>
        </div>
        <div className="month-controls">
          <button onClick={() => onMonth(changeMonth(month, -1))}>
            <ChevronLeft />
          </button>
          <strong>{monthTitle(month)}</strong>
          <button onClick={() => onMonth(changeMonth(month, 1))}>
            <ChevronRight />
          </button>
        </div>
      </div>
      <Filters value={filter} onChange={onFilter} />
      <div className="calendar-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <small key={i}>{d}</small>
        ))}
        {calendarDays(month).map((date) => {
          const dayTasks = filtered.filter((t) => taskMatchesDate(t, date))
          return (
            <button
              key={date}
              className={`calendar-day ${date === selected ? 'selected' : ''} ${date === todayKey() ? 'today' : ''} ${!isSameMonth(date, month) ? 'outside' : ''}`}
              onClick={() => onSelected(date)}
            >
              <span>{fromDateKey(date).getDate()}</span>
              <i>
                {dayTasks.slice(0, 3).map((t) => (
                  <b className={t.category} key={t.id} />
                ))}
              </i>
            </button>
          )
        })}
      </div>
      <div className="agenda-heading">
        <div>
          <strong>{selected === todayKey() ? 'Today' : formatLongDate(selected)}</strong>
          <small>{agenda.length} tasks</small>
        </div>
        <button onClick={onAdd}>
          <Plus size={15} />
          Add
        </button>
      </div>
      <div className="task-list">
        {agenda.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            date={selected}
            onToggle={() => onToggle(task, selected)}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task.id)}
            onTimer={() => onTimer(task)}
          />
        ))}
        {!agenda.length && <Empty title="Open day" body="Nothing needs your attention here." />}
      </div>
    </section>
  )
}

function SettingsView({
  settings,
  sync,
  onSync,
  onSettings
}: {
  settings: DashboardSettings
  sync: SyncStatus
  onSync: (s: SyncStatus) => void
  onSettings: (p: Partial<DashboardSettings>) => void
}) {
  const opacity = settings.overlayMode ? settings.overlayOpacity : settings.opacity
  return (
    <section className="view-panel settings-view">
      <div className="settings-heading">
        <p className="eyebrow">QUIETLY YOURS</p>
        <h1>Settings</h1>
      </div>
      <SyncCard status={sync} onStatus={onSync} />
      <span className="settings-label">WINDOW</span>
      <div className="settings-group">
        <Setting
          icon={settings.alwaysOnTop ? Pin : PinOff}
          title="Always on top"
          detail="Keep the next action within reach."
          control={
            <Switch
              checked={settings.alwaysOnTop}
              onChange={(v) => {
                onSettings({ alwaysOnTop: v })
                void window.dashboard.setAlwaysOnTop(v)
              }}
            />
          }
        />
        <Setting
          icon={Blend}
          title="Window opacity"
          detail={`${Math.round(opacity * 100)}%`}
          control={
            <input
              type="range"
              min="40"
              max="100"
              value={opacity * 100}
              onChange={(e) => {
                const v = +e.target.value / 100
                onSettings({
                  [settings.overlayMode ? 'overlayOpacity' : 'opacity']: v
                })
                void window.dashboard.setOpacity(v)
              }}
            />
          }
        />
        <Setting
          icon={Blend}
          title="Overlay mode"
          detail="A softer half-opacity view."
          control={
            <Switch
              checked={settings.overlayMode}
              onChange={(v) => {
                onSettings({ overlayMode: v })
                void window.dashboard.setOpacity(v ? settings.overlayOpacity : settings.opacity)
              }}
            />
          }
        />
      </div>
      <span className="settings-label">SYSTEM</span>
      <div className="settings-group">
        <Setting
          icon={RotateCcw}
          title="Open at login"
          detail={`Start quietly with ${window.dashboard.platform === 'darwin' ? 'your Mac' : 'Windows'}.`}
          control={
            <Switch
              checked={settings.launchAtLogin}
              onChange={(v) => {
                onSettings({ launchAtLogin: v })
                void window.dashboard.setLaunchAtLogin(v)
              }}
            />
          }
        />
        <Setting
          icon={Bell}
          title="Timer notifications"
          detail="Know when focus time ends."
          control={
            <Switch
              checked={settings.notifications}
              onChange={(v) => onSettings({ notifications: v })}
            />
          }
        />
      </div>
      <div className="privacy-note">
        <Cloud />
        <p>
          <strong>Offline first.</strong>
          <span>
            Your dashboard always stays on this computer, with optional account sync across Macs and
            PCs.
          </span>
        </p>
      </div>
    </section>
  )
}
function SyncCard({ status, onStatus }: { status: SyncStatus; onStatus: (s: SyncStatus) => void }) {
  const [email, setEmail] = useState(status.email ?? '')
  const [code, setCode] = useState('')
  const [otp, setOtp] = useState<OtpStatus>('idle')
  const send = () => void window.dashboard.requestSyncCode(email).then(onStatus)
  const verify = (value = code) =>
    value.length === 6 &&
    void window.dashboard.verifySyncCode(email, value).then((next) => {
      setOtp(next.signedIn ? 'success' : 'error')
      onStatus(next)
    })
  return (
    <section className="sync-card">
      <header>
        <span>
          <Cloud />
        </span>
        <div>
          <small>ACROSS YOUR COMPUTERS</small>
          <h2>{status.signedIn ? 'Cloud sync is on' : 'Connect your dashboard'}</h2>
        </div>
        {status.signedIn && <SyncPill status={status} />}
      </header>
      {!status.configured && (
        <div className="sync-message">
          <CircleAlert />
          <p>This build needs its cloud project connected before sign-in can be enabled.</p>
        </div>
      )}
      {status.configured && !status.signedIn && status.phase !== 'code-sent' && (
        <div className="email-entry">
          <p>Use the same email on every computer. No password needed.</p>
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button onClick={send}>Send code</button>
          </div>
        </div>
      )}
      {status.phase === 'code-sent' && (
        <div className="otp-panel">
          <p>{status.message}</p>
          <OtpInput value={code} onChange={setCode} onComplete={verify} status={otp} autoFocus />
        </div>
      )}
      {status.signedIn && (
        <div className="sync-account">
          <p>
            <strong>{status.email}</strong>
            <span>{status.message ?? 'Your changes are connected.'}</span>
          </p>
          <div>
            <button onClick={() => void window.dashboard.syncNow().then(onStatus)}>
              <RefreshCw />
              Sync now
            </button>
            <button onClick={() => void window.dashboard.signOutSync().then(onStatus)}>
              Sign out
            </button>
          </div>
        </div>
      )}
      {status.phase === 'error' && <div className="sync-error">{status.message}</div>}
    </section>
  )
}
function Setting({
  icon: Icon,
  title,
  detail,
  control
}: {
  icon: typeof Pin
  title: string
  detail: string
  control: React.ReactNode
}) {
  return (
    <div className="setting-row">
      <span>
        <Icon />
      </span>
      <p>
        <strong>{title}</strong>
        <small>{detail}</small>
      </p>
      {control}
    </div>
  )
}
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`switch ${checked ? 'on' : ''}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  )
}
function Timer({
  task,
  seconds,
  paused,
  onPause,
  onReset,
  onClose
}: {
  task: Task
  seconds: number
  paused: boolean
  onPause: () => void
  onReset: () => void
  onClose: () => void
}) {
  return (
    <aside className="timer-bar">
      <i />
      <p>
        <small>{paused ? 'PAUSED' : 'FOCUS'}</small>
        <strong>{task.title}</strong>
      </p>
      <time>{countdown(seconds)}</time>
      <button aria-label={paused ? 'Resume timer' : 'Pause timer'} onClick={onPause}>
        {paused ? <Play /> : <Pause />}
      </button>
      <button aria-label="Reset timer" onClick={onReset}>
        <RotateCcw />
      </button>
      <button aria-label="Close timer" onClick={onClose}>
        <X />
      </button>
    </aside>
  )
}

function Composer({
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
  onSave: (d: TaskDraft) => void
}) {
  const [draft, setDraft] = useState<TaskDraft>(
    initial ?? {
      title: '',
      notes: '',
      category: 'personal',
      dueDate: defaultDate,
      dueTime: '',
      estimateMinutes: 20,
      recurrence: 'none',
      priority: 2
    }
  )
  const [more, setMore] = useState(Boolean(initial))
  const [customDate, setCustomDate] = useState(
    ![todayKey(), addDays(todayKey(), 1), nextWeekend()].includes(draft.dueDate)
  )
  const [customTime, setCustomTime] = useState(
    Boolean(draft.dueTime && !['09:00', '13:00', '18:00'].includes(draft.dueTime))
  )
  const [time, setTime] = useState(timeLabel(draft.dueTime))
  const [badTime, setBadTime] = useState(false)
  const patch = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))
  const commitTime = () => {
    const parsed = parseFlexibleTime(time)
    if (parsed === null) {
      setBadTime(true)
      return false
    }
    patch('dueTime', parsed)
    setBadTime(false)
    return true
  }
  const dates = [
    [todayKey(), 'Today'],
    [addDays(todayKey(), 1), 'Tomorrow'],
    [nextWeekend(), 'Weekend']
  ]
  const times = [
    ['', 'Anytime'],
    ['09:00', 'Morning'],
    ['13:00', 'Afternoon'],
    ['18:00', 'Evening']
  ]
  return (
    <div
      className="composer-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <form
        className="task-composer"
        onSubmit={(e) => {
          e.preventDefault()
          if ((!customTime || commitTime()) && draft.title.trim()) onSave(draft)
        }}
      >
        <header>
          <div>
            <p className="eyebrow">ONE CLEAR NEXT ACTION</p>
            <h2>{initial ? 'Edit task' : 'Add a task'}</h2>
          </div>
          <button type="button" onClick={onCancel}>
            <X />
          </button>
        </header>
        <label className="field">
          <span>What needs doing?</span>
          <input
            autoFocus
            value={draft.title}
            onChange={(e) => patch('title', e.target.value)}
            placeholder="Keep it concrete"
          />
        </label>
        <div className="schedule">
          <span>When?</span>
          <div className="choice-row">
            {dates.map(([date, label]) => (
              <button
                type="button"
                className={!customDate && draft.dueDate === date ? 'active' : ''}
                key={label}
                onClick={() => {
                  patch('dueDate', date)
                  setCustomDate(false)
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={customDate ? 'active' : ''}
              onClick={() => setCustomDate(true)}
            >
              Pick date
            </button>
          </div>
          {customDate && (
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => patch('dueDate', e.target.value)}
            />
          )}
        </div>
        <div className="schedule">
          <span>What time?</span>
          <div className="choice-row time-choices">
            {times.map(([value, label]) => (
              <button
                type="button"
                className={!customTime && draft.dueTime === value ? 'active' : ''}
                key={label}
                onClick={() => {
                  patch('dueTime', value)
                  setCustomTime(false)
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={customTime ? 'active' : ''}
              onClick={() => setCustomTime(true)}
            >
              Custom
            </button>
          </div>
          {customTime && (
            <label className={`custom-time ${badTime ? 'error' : ''}`}>
              <input
                value={time}
                onChange={(e) => setTime(e.target.value)}
                onBlur={commitTime}
                placeholder="9, 9am, or 14:30"
              />
              {badTime && <small>Try “9am” or “14:30”.</small>}
            </label>
          )}
        </div>
        <button type="button" className="more-toggle" onClick={() => setMore(!more)}>
          More options <ChevronDown className={more ? 'open' : ''} />
        </button>
        {more && (
          <div className="advanced-fields">
            <fieldset>
              <legend>Area</legend>
              {(Object.keys(areas) as Category[]).map((key) => {
                const Icon = areas[key].icon
                return (
                  <button
                    type="button"
                    className={draft.category === key ? `active ${key}` : key}
                    onClick={() => patch('category', key)}
                    key={key}
                  >
                    <Icon />
                    {areas[key].label}
                  </button>
                )
              })}
            </fieldset>
            <div className="duration-row">
              <p>
                <strong>Focus estimate</strong>
                <small>Tap the pencil to adjust</small>
              </p>
              <DurationPicker
                value={{
                  hours: Math.floor(draft.estimateMinutes / 60),
                  minutes: draft.estimateMinutes % 60
                }}
                maxHours={8}
                maxMinutes={59}
                onChange={({ hours, minutes }) =>
                  patch('estimateMinutes', Math.max(1, hours * 60 + minutes))
                }
              />
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Repeat</span>
                <select
                  value={draft.recurrence}
                  onChange={(e) => patch('recurrence', e.target.value as TaskDraft['recurrence'])}
                >
                  <option value="none">Never</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <label className="field">
                <span>Priority</span>
                <select
                  value={draft.priority}
                  onChange={(e) => patch('priority', +e.target.value as 1 | 2 | 3)}
                >
                  <option value="1">High</option>
                  <option value="2">Normal</option>
                  <option value="3">Low</option>
                </select>
              </label>
            </div>
            {goals.length > 0 && (
              <label className="field">
                <span>Goal</span>
                <select
                  value={draft.goalId ?? ''}
                  onChange={(e) => patch('goalId', e.target.value || undefined)}
                >
                  <option value="">No goal</option>
                  {goals.map((g) => (
                    <option value={g.id} key={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Notes</span>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => patch('notes', e.target.value)}
              />
            </label>
          </div>
        )}
        <footer className="composer-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button disabled={!draft.title.trim()}>{initial ? 'Save changes' : 'Add task'}</button>
        </footer>
      </form>
    </div>
  )
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Sparkles />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}
