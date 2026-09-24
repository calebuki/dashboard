import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Bell,
  CalendarClock,
  Minus,
  Plus,
  Repeat2,
  Sparkles,
  Star,
  Trash2,
  X
} from 'lucide-react'
import type { Category, Goal, TaskDraft } from '../types'
import { formatLongDate, formatShortDate } from '../lib/date'
import {
  durationLabel,
  relativeDayLabel,
  reminderLabel,
  timeLabel,
  timeRangeLabel
} from '../lib/format'
import { parseQuickTask } from '../lib/quick-add'
import { areaKeys, areas } from './areas'
import { DayStrip, MiniCalendar, TimeWheel, nextHalfHour } from './pickers'
import { Chip, Collapse, Segmented, Sheet, spring } from './primitives'
import { cn } from '@/lib/utils'

const durations = [15, 30, 45, 60, 90, 120]
const reminders: (number | null)[] = [null, 0, 10, 30, 60, 1440]
const quickTimes = [
  ['09:00', 'Morning'],
  ['12:00', 'Noon'],
  ['15:00', 'Afternoon'],
  ['18:00', 'Evening'],
  ['20:00', 'Night']
] as const

export interface ComposerRequest {
  date: string
  draft?: TaskDraft
  /** Present when editing an existing task. */
  taskId?: string
  /** Free text from the quick-add bar, parsed the same way the title is. */
  text?: string
  category?: Category
}

export function blankDraft(date: string, category: Category = 'personal'): TaskDraft {
  return {
    title: '',
    notes: '',
    category,
    dueDate: date,
    dueTime: '',
    estimateMinutes: 30,
    recurrence: 'none',
    priority: 2,
    remindBefore: 10
  }
}

export function Composer({
  request,
  goals,
  onClose,
  onSave,
  onDelete
}: {
  request: ComposerRequest | null
  goals: Goal[]
  onClose: () => void
  onSave: (draft: TaskDraft, taskId?: string) => void
  onDelete: (taskId: string) => void
}) {
  return (
    <Sheet open={Boolean(request)} onClose={onClose} label="Task details" className="composer">
      {request && (
        <ComposerForm
          key={request.taskId ?? `new-${request.date}-${request.text ?? ''}`}
          request={request}
          goals={goals}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </Sheet>
  )
}

function ComposerForm({
  request,
  goals,
  onClose,
  onSave,
  onDelete
}: {
  request: ComposerRequest
  goals: Goal[]
  onClose: () => void
  onSave: (draft: TaskDraft, taskId?: string) => void
  onDelete: (taskId: string) => void
}) {
  const editing = Boolean(request.taskId)
  const base = useMemo(
    () => request.draft ?? blankDraft(request.date, request.category),
    [request]
  )
  const [draft, setDraft] = useState<TaskDraft>(() => ({ ...base, title: request.text ?? base.title }))
  // Fields the person set by hand; natural-language detection never overrides these.
  const touched = useRef(new Set<keyof TaskDraft>())
  const [detect, setDetect] = useState(!editing)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(Boolean(base.notes))
  const titleRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(
    () => (detect && draft.title.trim() ? parseQuickTask(draft.title) : null),
    [detect, draft.title]
  )
  const detected = parsed && parsed.tokens.length > 0 ? parsed : null

  useEffect(() => {
    if (!detect) return
    setDraft((current) => {
      const next = { ...current }
      const keep = (key: keyof TaskDraft) => touched.current.has(key)
      if (!keep('dueDate')) next.dueDate = parsed?.when ? parsed.dueDate : base.dueDate
      if (!keep('dueTime')) next.dueTime = parsed?.when ? parsed.dueTime : base.dueTime
      if (!keep('category')) next.category = parsed?.category ?? base.category
      if (!keep('recurrence')) next.recurrence = parsed?.recurrence ?? base.recurrence
      if (!keep('priority')) next.priority = parsed?.important ? 1 : base.priority
      return next
    })
  }, [parsed, detect, base])

  const patch = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    touched.current.add(key)
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const finalTitle = (detected?.title ?? draft.title).trim()
  const canSave = finalTitle.length > 0
  const save = () => {
    if (!canSave) {
      titleRef.current?.focus()
      return
    }
    onSave({ ...draft, title: finalTitle }, request.taskId)
  }

  const hasTime = Boolean(draft.dueTime)
  const relative = relativeDayLabel(draft.dueDate)
  const summaryDay =
    relative === 'Today' || relative === 'Tomorrow'
      ? `${relative}, ${formatShortDate(draft.dueDate)}`
      : formatLongDate(draft.dueDate)

  return (
    <form
      className="composer-form"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          save()
        }
      }}
    >
      <header className="composer-head">
        <p className="eyebrow">{editing ? 'Edit task' : 'New task'}</p>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </header>

      <div className="composer-title">
        <input
          ref={titleRef}
          autoFocus
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              save()
            }
          }}
          placeholder="What’s happening?"
          aria-label="Title"
        />
        <AnimatePresence initial={false}>
          {detected && (
            <motion.div
              className="detected"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
            >
              <Sparkles size={12} />
              <span className="detected-tokens">
                <AnimatePresence mode="popLayout" initial={false}>
                  {detected.tokens.map((token) => (
                    <motion.b
                      key={token}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={spring}
                    >
                      {token}
                    </motion.b>
                  ))}
                </AnimatePresence>
              </span>
              <button
                type="button"
                onClick={() => {
                  setDetect(false)
                  setDraft((current) => {
                    const next = { ...current }
                    for (const key of ['dueDate', 'dueTime', 'category', 'recurrence', 'priority'] as const)
                      if (!touched.current.has(key)) Object.assign(next, { [key]: base[key] })
                    return next
                  })
                }}
              >
                Keep as text
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div className="composer-summary" layout transition={spring}>
        <span className="summary-icon">
          <CalendarClock size={18} />
        </span>
        <div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.strong
              key={summaryDay}
              initial={{ y: 10, opacity: 0, filter: 'blur(4px)' }}
              animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: -10, opacity: 0, filter: 'blur(4px)' }}
              transition={spring}
            >
              {summaryDay}
            </motion.strong>
          </AnimatePresence>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.small
              key={`${draft.dueTime}-${draft.estimateMinutes}-${draft.recurrence}`}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={spring}
            >
              {hasTime
                ? timeRangeLabel(draft.dueTime, draft.estimateMinutes)
                : `Anytime · ${durationLabel(draft.estimateMinutes)}`}
              {draft.recurrence !== 'none' && (
                <>
                  {' · '}
                  <Repeat2 size={11} /> {draft.recurrence}
                </>
              )}
            </motion.small>
          </AnimatePresence>
        </div>
      </motion.div>

      <section className="field-block">
        <span className="field-label">Day</span>
        <DayStrip
          value={draft.dueDate}
          onChange={(date) => {
            patch('dueDate', date)
            setCalendarOpen(false)
          }}
          calendarOpen={calendarOpen}
          onCalendar={() => setCalendarOpen(!calendarOpen)}
        />
        <Collapse open={calendarOpen}>
          <MiniCalendar
            value={draft.dueDate}
            onChange={(date) => {
              patch('dueDate', date)
              setCalendarOpen(false)
            }}
          />
        </Collapse>
      </section>

      <section className="field-block">
        <div className="field-row">
          <span className="field-label">Time</span>
          <Segmented
            size="sm"
            label="Time of day"
            value={hasTime ? 'time' : 'any'}
            onChange={(mode) => patch('dueTime', mode === 'time' ? draft.dueTime || nextHalfHour() : '')}
            options={[
              { value: 'any', label: 'Anytime' },
              { value: 'time', label: 'Set a time' }
            ]}
          />
        </div>
        <Collapse open={hasTime}>
          <div className="time-panel">
            <div className="chip-row">
              {quickTimes.map(([time, label]) => (
                <Chip
                  key={time}
                  active={draft.dueTime === time}
                  onClick={() => patch('dueTime', time)}
                  title={timeLabel(time)}
                >
                  {label}
                  <small>{timeLabel(time)}</small>
                </Chip>
              ))}
            </div>
            {hasTime && <TimeWheel value={draft.dueTime} onChange={(time) => patch('dueTime', time)} />}
          </div>
        </Collapse>
      </section>

      <section className="field-block">
        <div className="field-row">
          <span className="field-label">{hasTime ? 'Duration' : 'Focus time'}</span>
          <div className="stepper">
            <button
              type="button"
              aria-label="Five minutes shorter"
              onClick={() => patch('estimateMinutes', Math.max(5, draft.estimateMinutes - 5))}
            >
              <Minus size={13} />
            </button>
            <span>{durationLabel(draft.estimateMinutes)}</span>
            <button
              type="button"
              aria-label="Five minutes longer"
              onClick={() => patch('estimateMinutes', Math.min(480, draft.estimateMinutes + 5))}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
        <div className="chip-row">
          {durations.map((minutes) => (
            <Chip
              key={minutes}
              active={draft.estimateMinutes === minutes}
              onClick={() => patch('estimateMinutes', minutes)}
            >
              {durationLabel(minutes)}
            </Chip>
          ))}
        </div>
      </section>

      <Collapse open={hasTime}>
        <section className="field-block">
          <span className="field-label">
            <Bell size={11} /> Remind me
          </span>
          <div className="chip-row">
            {reminders.map((minutes) => (
              <Chip
                key={String(minutes)}
                active={draft.remindBefore === minutes}
                onClick={() => patch('remindBefore', minutes)}
              >
                {minutes === null ? 'Off' : reminderLabel(minutes).replace(' before', '')}
              </Chip>
            ))}
          </div>
        </section>
      </Collapse>

      <section className="field-block">
        <span className="field-label">Repeat</span>
        <Segmented
          label="Repeat"
          value={draft.recurrence}
          onChange={(value) => patch('recurrence', value)}
          options={[
            { value: 'none', label: 'Never' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekdays', label: 'Weekdays' },
            { value: 'weekly', label: 'Weekly' }
          ]}
        />
      </section>

      <section className="field-block">
        <span className="field-label">Details</span>
        <div className="chip-row">
          {areaKeys.map((key) => {
            const Icon = areas[key].icon
            return (
              <Chip
                key={key}
                className={cn('area-chip', key)}
                active={draft.category === key}
                onClick={() => patch('category', key)}
              >
                <Icon size={13} />
                {areas[key].label}
              </Chip>
            )
          })}
          <Chip
            className="important-chip"
            active={draft.priority === 1}
            onClick={() => patch('priority', draft.priority === 1 ? 2 : 1)}
          >
            <Star size={13} />
            Important
          </Chip>
        </div>
        {goals.length > 0 && (
          <div className="chip-row goal-chips">
            {goals.map((goal) => (
              <Chip
                key={goal.id}
                className={`goal-chip ${goal.color}`}
                active={draft.goalId === goal.id}
                onClick={() => patch('goalId', draft.goalId === goal.id ? undefined : goal.id)}
                title={`Counts toward “${goal.title}”`}
              >
                <span>{goal.emoji}</span>
                {goal.title}
              </Chip>
            ))}
          </div>
        )}
        {notesOpen ? (
          <textarea
            className="notes"
            rows={3}
            autoFocus={!base.notes}
            value={draft.notes}
            onChange={(event) => patch('notes', event.target.value)}
            placeholder="Notes, links, anything useful"
          />
        ) : (
          <button type="button" className="add-note" onClick={() => setNotesOpen(true)}>
            <Plus size={12} /> Add a note
          </button>
        )}
      </section>

      <footer className="composer-actions">
        {editing && request.taskId && (
          <button
            type="button"
            className="icon-button danger"
            aria-label="Delete task"
            onClick={() => onDelete(request.taskId!)}
          >
            <Trash2 size={15} />
          </button>
        )}
        <button type="button" className="ghost-button" onClick={onClose}>
          Cancel
        </button>
        <motion.button
          type="submit"
          className="primary-button"
          disabled={!canSave}
          whileTap={{ scale: 0.97 }}
        >
          {editing ? 'Save' : 'Add task'}
          <kbd>{window.dashboard.platform === 'darwin' ? '⌘↵' : 'Ctrl+Enter'}</kbd>
        </motion.button>
      </footer>
    </form>
  )
}
