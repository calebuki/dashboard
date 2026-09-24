import { forwardRef, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, ChevronDown, CornerDownLeft, SlidersHorizontal, Sparkles, WifiOff } from 'lucide-react'
import type { Category, DashboardState, Goal, SyncStatus, Task } from '../types'
import { addDays, formatLongDate, todayKey } from '../lib/date'
import { durationLabel, greeting, relativeDayLabel, timeLabel } from '../lib/format'
import { goalProgress } from '../lib/goals'
import { parseQuickTask } from '../lib/quick-add'
import { taskIsCompleteOn, taskMatchesDate } from '../lib/state'
import { areas } from './areas'
import { Burst, ProgressRing, RollingNumber, Segmented, spring } from './primitives'
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
  const progress = todays.length ? done.length / todays.length : 0

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
        <div>
          <p className="eyebrow">{formatLongDate(today)}</p>
          <AnimatedHeading text={open.length === 0 && todays.length > 0 ? 'All clear.' : greeting()} />
          <p className="view-sub">
            {open.length === 0
              ? todays.length
                ? 'Everything for today is done. Nice.'
                : 'Nothing planned yet — add one small thing.'
              : `${open.length} to go · about ${durationLabel(minutesLeft)}`}
          </p>
        </div>
        <ProgressRing value={progress} size={58} stroke={5} className={cn(progress === 1 && 'complete')}>
          <RollingNumber value={`${done.length}/${todays.length}`} />
        </ProgressRing>
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
            <WifiOff size={13} /> Offline — changes are safe and will sync later.
          </motion.div>
        )}
      </AnimatePresence>

      {state.goals.length > 0 && (
        <GoalStrip goals={state.goals} tasks={state.tasks} onCheckin={onCheckin} onOpen={onGoals} />
      )}

      <FilterBar value={filter} onChange={onFilter} />

      <div className="task-list">
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
        {todays.length === 0 && (
          <Empty
            title={filter === 'all' ? 'A clean slate' : `No ${areas[filter].label.toLowerCase()} tasks today`}
            body="Type above — try “Call Sam tomorrow 6pm” or “Gym every weekday 7am”."
          />
        )}
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
        {row.meta && <small>{row.meta}</small>}
        {row.toggle && (
          <ChevronDown size={13} className={cn('section-chevron', row.open && 'open')} />
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
        transition={spring}
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

export function AnimatedHeading({ text }: { text: string }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.h1 key={text} aria-label={text}>
        {text.split(' ').map((word, index) => (
          <motion.span
            key={`${word}-${index}`}
            className="heading-word"
            initial={reduce ? false : { opacity: 0, y: 10, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduce ? undefined : { opacity: 0, y: -8, filter: 'blur(6px)' }}
            transition={{ ...spring, delay: index * 0.06 }}
            aria-hidden
          >
            {word}
          </motion.span>
        ))}
      </motion.h1>
    </AnimatePresence>
  )
}

const examples = [
  'Call mom tomorrow 6pm',
  'Gym every weekday 7am',
  'Essay due friday #school !',
  'Standup weekdays 9:15 #work',
  'Water plants every sunday'
]

function QuickAdd({
  onAdd,
  onDetails
}: {
  onAdd: (text: string) => void
  onDetails: (text: string) => void
}) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [example, setExample] = useState(0)
  const parsed = useMemo(() => (value.trim() ? parseQuickTask(value) : null), [value])

  useEffect(() => {
    if (value || focused) return
    const id = setInterval(() => setExample((n) => (n + 1) % examples.length), 3200)
    return () => clearInterval(id)
  }, [value, focused])

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
          <b key="cat" className={parsed.category}>
            {areas[parsed.category].label}
          </b>
        ) : null,
        parsed.important ? <b key="imp">Important</b> : null
      ].filter(Boolean)
    : []

  return (
    <div className={cn('quick-add', focused && 'focused', value && 'filled')}>
      <div className="quick-add-row">
        <Sparkles size={16} className="quick-add-icon" />
        <div className="quick-add-field">
          <input
            id="quick-add"
            aria-label="Quick add a task"
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
          {!value && (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={example}
                className="quick-add-placeholder"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                Try “{examples[example]}”
              </motion.span>
            </AnimatePresence>
          )}
        </div>
        <button
          type="button"
          className="quick-add-details"
          title="Open all options (Shift+Enter)"
          aria-label="Open all options"
          onClick={() => {
            onDetails(value)
            setValue('')
          }}
        >
          <SlidersHorizontal size={15} />
        </button>
        <motion.button
          type="button"
          className="quick-add-submit"
          aria-label="Add task"
          disabled={!value.trim()}
          onClick={submit}
          whileTap={{ scale: 0.9 }}
        >
          <CornerDownLeft size={15} />
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {parsed && (
          <motion.div
            className="quick-add-preview"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
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
  onCheckin,
  onOpen
}: {
  goals: Goal[]
  tasks: Task[]
  onCheckin: (goal: Goal) => void
  onOpen: () => void
}) {
  return (
    <div className="goal-strip">
      <div className="goal-strip-head">
        <span>This week</span>
        <button type="button" onClick={onOpen}>
          Goals <ArrowUpRight size={12} />
        </button>
      </div>
      <div className="goal-strip-row">
        {goals.map((goal) => (
          <GoalPill key={goal.id} goal={goal} tasks={tasks} onCheckin={() => onCheckin(goal)} />
        ))}
      </div>
    </div>
  )
}

function GoalPill({ goal, tasks, onCheckin }: { goal: Goal; tasks: Task[]; onCheckin: () => void }) {
  const progress = goalProgress(goal, tasks)
  const [pop, setPop] = useState(0)
  return (
    <motion.button
      type="button"
      className={cn('goal-pill', goal.color, progress.checkedToday && 'checked')}
      whileTap={{ scale: 0.95 }}
      onClick={() => {
        if (progress.lockedToday) return
        if (!progress.checkedToday) setPop((n) => n + 1)
        onCheckin()
      }}
      title={
        progress.lockedToday
          ? 'Counted today from a linked task'
          : progress.checkedToday
            ? 'Checked in today — tap to undo'
            : 'Tap to check in for today'
      }
    >
      <ProgressRing value={progress.done / progress.target} size={34} stroke={3.5}>
        <span className="goal-pill-emoji">{goal.emoji}</span>
      </ProgressRing>
      <Burst key={pop} show={pop > 0} color={`var(--goal-${goal.color})`} />
      <span className="goal-pill-text">
        <strong>{goal.title}</strong>
        <small>
          <RollingNumber value={progress.done} />/{progress.target}
          {progress.checkedToday && ' · today ✓'}
        </small>
      </span>
    </motion.button>
  )
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <motion.div
      className="empty"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <div className="empty-art" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <strong>{title}</strong>
      <span>{body}</span>
    </motion.div>
  )
}
