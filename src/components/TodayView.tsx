import { forwardRef, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, ChevronDown, CornerDownLeft, Plus, SlidersHorizontal, WifiOff } from 'lucide-react'
import type { Category, DashboardState, Goal, SyncStatus, Task } from '../types'
import { addDays, formatLongDate, todayKey } from '../lib/date'
import { durationLabel, relativeDayLabel, timeLabel } from '../lib/format'
import { logGoalDays } from '../lib/daily-log'
import { goalProgress } from '../lib/goals'
import { parseQuickTask } from '../lib/quick-add'
import { taskIsCompleteOn, taskMatchesDate } from '../lib/state'
import { areas } from './areas'
import { EmptyNote, Segmented, StationLine, arrive } from './primitives'
import { TaskItem } from './TaskItem'
import { cn } from '@/lib/utils'

export type Filter = 'all' | Category

export interface TaskHandlers {
  onToggle: (task: Task, date: string) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
  onTimer: (task: Task) => void
}

export function FilterBar({ value, onChange }: { value: Filter; onChange: (v: Filter) => void }) {
  return (
    <Segmented
      className="filter-bar"
      label="Filter by area"
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'All' },
        ...(Object.keys(areas) as Category[]).map((key) => ({
          value: key,
          className: key,
          label: (
            <>
              <i className={`area-dot ${key}`} />
              {areas[key].label}
            </>
          )
        }))
      ]}
    />
  )
}

type Row =
  | { kind: 'header'; key: string; label: string; meta?: string; toggle?: () => void; open?: boolean }
  | { kind: 'task'; key: string; task: Task; date: string; showDay?: boolean }

export function TodayView({
  state,
  sync,
  filter,
  timerTaskId,
  onFilter,
  onQuickAdd,
  onDetails,
  onCheckin,
  onGoals,
  handlers
}: {
  state: DashboardState
  sync: SyncStatus
  filter: Filter
  timerTaskId?: string
  onFilter: (v: Filter) => void
  onQuickAdd: (text: string) => void
  onDetails: (text: string) => void
  onCheckin: (goal: Goal) => void
  onGoals: () => void
  handlers: TaskHandlers
}) {
  const today = todayKey()
  const [doneOpen, setDoneOpen] = useState(false)
  const [upcomingOpen, setUpcomingOpen] = useState(true)
  const goalsById = useMemo(() => new Map(state.goals.map((g) => [g.id, g])), [state.goals])
  const inFilter = (task: Task) => filter === 'all' || task.category === filter

  const todays = state.tasks.filter((t) => taskMatchesDate(t, today) && inFilter(t))
  const done = todays.filter((t) => taskIsCompleteOn(t, today))
  const open = todays.filter((t) => !taskIsCompleteOn(t, today))
  const scheduled = open
    .filter((t) => t.dueTime)
    .sort((a, b) => a.dueTime!.localeCompare(b.dueTime!))
  const anytime = open
    .filter((t) => !t.dueTime)
    .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))
  const upcoming = state.tasks
    .filter(
      (t) =>
        inFilter(t) &&
        t.dueDate > today &&
        t.dueDate <= addDays(today, 7) &&
        !taskIsCompleteOn(t, t.dueDate)
    )
    .sort((a, b) => (a.dueDate + (a.dueTime ?? '99')).localeCompare(b.dueDate + (b.dueTime ?? '99')))
    .slice(0, 8)

  const minutesLeft = open.reduce((sum, t) => sum + t.estimateMinutes, 0)
  const summary = !todays.length
    ? 'Nothing planned'
    : !open.length
      ? `All ${todays.length} done`
      : `${done.length} of ${todays.length} done · ${durationLabel(minutesLeft)} left`

  const rows: Row[] = []
  if (scheduled.length) {
    rows.push({ kind: 'header', key: 'h-scheduled', label: 'Scheduled', meta: nextUp(scheduled) })
    scheduled.forEach((task) => rows.push({ kind: 'task', key: task.id, task, date: today }))
  }
  if (anytime.length) {
    rows.push({ kind: 'header', key: 'h-anytime', label: 'Anytime', meta: `${anytime.length}` })
    anytime.forEach((task) => rows.push({ kind: 'task', key: task.id, task, date: today }))
  }
  if (done.length) {
    rows.push({
      kind: 'header',
      key: 'h-done',
      label: 'Done',
      meta: `${done.length}`,
      toggle: () => setDoneOpen(!doneOpen),
      open: doneOpen
    })
    if (doneOpen) done.forEach((task) => rows.push({ kind: 'task', key: task.id, task, date: today }))
  }
  if (upcoming.length) {
    rows.push({
      kind: 'header',
      key: 'h-upcoming',
      label: 'Coming up',
      meta: `${upcoming.length}`,
      toggle: () => setUpcomingOpen(!upcomingOpen),
      open: upcomingOpen
    })
    if (upcomingOpen)
      upcoming.forEach((task) =>
        rows.push({ kind: 'task', key: `up-${task.id}`, task, date: task.dueDate, showDay: true })
      )
  }

  return (
    <section className="view today-view">
      <header className="view-head">
        <h1>Today</h1>
        <p className="view-meta">
          {formatLongDate(today)} · <span className="tabular">{summary}</span>
        </p>
        {todays.length > 0 && (
          <StationLine
            className="today-line"
            total={todays.length}
            filled={done.length}
            color="var(--route-tomato)"
            label={`${done.length} of ${todays.length} tasks done`}
          />
        )}
      </header>

      <QuickAdd onAdd={onQuickAdd} onDetails={onDetails} />

      <AnimatePresence>
        {sync.phase === 'offline' && (
          <motion.div
            className="inline-notice"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <WifiOff size={15} /> Offline. Changes will sync when you reconnect.
          </motion.div>
        )}
      </AnimatePresence>

      {state.goals.length > 0 && (
        <GoalStrip
          goals={state.goals}
          tasks={state.tasks}
          logDays={(goal) => logGoalDays(state.logs, state.logConfig.fields, goal.id)}
          onCheckin={onCheckin}
          onOpen={onGoals}
        />
      )}

      <FilterBar value={filter} onChange={onFilter} />

      <div className="task-list">
        {todays.length === 0 && (
          <EmptyNote>
            {filter === 'all'
              ? 'Nothing due today. Type a task above, like “gym fri 7am #work”.'
              : `No ${areas[filter].label.toLowerCase()} tasks today.`}
          </EmptyNote>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row) =>
            row.kind === 'header' ? (
              <SectionHeader key={row.key} row={row} />
            ) : (
              <TaskItem
                key={row.key}
                task={row.task}
                date={row.date}
                showDay={row.showDay}
                goal={row.task.goalId ? goalsById.get(row.task.goalId) : undefined}
                timing={timerTaskId === row.task.id}
                onToggle={() => handlers.onToggle(row.task, row.date)}
                onEdit={() => handlers.onEdit(row.task)}
                onDelete={() => handlers.onDelete(row.task)}
                onTimer={() => handlers.onTimer(row.task)}
              />
            )
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

function nextUp(scheduled: Task[]): string | undefined {
  const now = new Date()
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const next = scheduled.find((t) => t.dueTime! >= current)
  return next ? `Next ${timeLabel(next.dueTime)}` : `${scheduled.length} overdue`
}

const SectionHeader = forwardRef<HTMLDivElement, { row: Extract<Row, { kind: 'header' }> }>(
  function SectionHeader({ row }, ref) {
    const content = (
      <>
        <span>{row.label}</span>
        {row.meta && <small className="tabular">{row.meta}</small>}
        {row.toggle && (
          <ChevronDown size={16} className={cn('section-chevron', row.open && 'open')} />
        )}
      </>
    )
    return (
      <motion.div
        ref={ref}
        layout
        className="section-header"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={arrive}
      >
        {row.toggle ? (
          <button type="button" onClick={row.toggle} aria-expanded={row.open}>
            {content}
          </button>
        ) : (
          content
        )}
      </motion.div>
    )
  }
)

function QuickAdd({
  onAdd,
  onDetails
}: {
  onAdd: (text: string) => void
  onDetails: (text: string) => void
}) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const parsed = useMemo(() => (value.trim() ? parseQuickTask(value) : null), [value])

  const submit = () => {
    if (!value.trim()) return
    onAdd(value)
    setValue('')
  }
  const chips: ReactNode[] = parsed
    ? [
        <b key="day">{relativeDayLabel(parsed.dueDate)}</b>,
        parsed.dueTime ? <b key="time">{timeLabel(parsed.dueTime)}</b> : null,
        parsed.recurrence ? <b key="rep">{parsed.recurrence}</b> : null,
        parsed.category ? (
          <b key="cat">
            <i className={`area-dot ${parsed.category}`} />
            {areas[parsed.category].label}
          </b>
        ) : null,
        parsed.important ? <b key="imp">Important</b> : null
      ].filter(Boolean)
    : []

  return (
    <div className={cn('quick-add', focused && 'focused', value && 'filled')}>
      <div className="quick-add-row">
        <Plus size={18} className="quick-add-icon" aria-hidden />
        <div className="quick-add-field">
          <input
            id="quick-add"
            aria-label="Add a task"
            placeholder="Add a task"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.shiftKey || event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                onDetails(value)
                setValue('')
              } else if (event.key === 'Enter') submit()
              else if (event.key === 'Escape') event.currentTarget.blur()
            }}
          />
        </div>
        <button
          type="button"
          className="quick-add-details"
          title="More options (Shift+Enter)"
          aria-label="More options"
          onClick={() => {
            onDetails(value)
            setValue('')
          }}
        >
          <SlidersHorizontal size={17} />
        </button>
        <button
          type="button"
          className="quick-add-submit"
          aria-label="Add task"
          title="Add (Enter)"
          disabled={!value.trim()}
          onClick={submit}
        >
          <CornerDownLeft size={17} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {parsed && (
          <motion.div
            className="quick-add-preview"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={arrive}
          >
            <span className="preview-title">{parsed.title}</span>
            <span className="preview-chips">{chips}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function GoalStrip({
  goals,
  tasks,
  logDays,
  onCheckin,
  onOpen
}: {
  goals: Goal[]
  tasks: Task[]
  logDays: (goal: Goal) => string[]
  onCheckin: (goal: Goal) => void
  onOpen: () => void
}) {
  return (
    <section className="goal-strip" aria-labelledby="goal-strip-title">
      <div className="goal-strip-head">
        <h2 id="goal-strip-title">This week</h2>
        <button type="button" onClick={onOpen}>
          All goals <ArrowRight size={14} />
        </button>
      </div>
      <div className="goal-strip-row">
        {goals.map((goal) => (
          <GoalPill
            key={goal.id}
            goal={goal}
            tasks={tasks}
            logDays={logDays(goal)}
            onCheckin={() => onCheckin(goal)}
          />
        ))}
      </div>
    </section>
  )
}

function GoalPill({
  goal,
  tasks,
  logDays,
  onCheckin
}: {
  goal: Goal
  tasks: Task[]
  logDays: string[]
  onCheckin: () => void
}) {
  const progress = goalProgress(goal, tasks, undefined, logDays)
  return (
    <button
      type="button"
      className={cn('goal-pill', goal.color, progress.checkedToday && 'checked')}
      aria-pressed={progress.checkedToday}
      onClick={() => {
        if (!progress.lockedToday) onCheckin()
      }}
      title={
        progress.lockedToday
          ? 'Counted today from a linked task or your daily log'
          : progress.checkedToday
            ? 'Done today. Click to undo.'
            : 'Mark done for today'
      }
    >
      <span className="goal-pill-emoji" aria-hidden>
        {goal.emoji}
      </span>
      <span className="goal-pill-text">
        <strong>
          {goal.title}
          {progress.checkedToday && <Check size={14} strokeWidth={3} aria-label="Done today" />}
        </strong>
        <span className="goal-pill-progress">
          <StationLine
            total={progress.target}
            filled={progress.done}
            color={`var(--goal-${goal.color})`}
            label={`${progress.done} of ${progress.target} this week`}
          />
          <small className="tabular">
            {progress.done}/{progress.target}
          </small>
        </span>
      </span>
    </button>
  )
}
