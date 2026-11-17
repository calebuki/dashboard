import { Fragment, forwardRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Flame, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DailyLog, Goal, GoalColor, GoalDraft, LogConfig, Task } from '../types'
import { fromDateKey, todayKey } from '../lib/date'
import { logGoalDays } from '../lib/daily-log'
import { goalProgress } from '../lib/goals'
import { goalColors } from '../lib/state'
import { DailyLogCard } from './DailyLog'
import { Chip, EmptyNote, Sheet, SheetHead, StopLine, arrive, spring } from './primitives'
import { cn } from '@/lib/utils'

const dayLetter = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' })

const suggestions: GoalDraft[] = [
  { title: 'Read', emoji: '📚', color: 'sky', weeklyTarget: 4 },
  { title: 'Work out', emoji: '💪', color: 'coral', weeklyTarget: 3 },
  { title: 'Meditate', emoji: '🧘', color: 'violet', weeklyTarget: 5 },
  { title: 'Practice a language', emoji: '🗣️', color: 'lime', weeklyTarget: 5 },
  { title: 'Call family', emoji: '📞', color: 'amber', weeklyTarget: 1 },
  { title: 'Cook at home', emoji: '🍳', color: 'mint', weeklyTarget: 3 }
]

const emojis = ['🎯', '🏃', '💪', '📚', '🧘', '🗣️', '🎸', '🎨', '✍️', '💧', '🥗', '😴', '📞', '🧹', '💰', '🌱', '🍳', '🧠']

export const targetLabel = (n: number) => (n === 7 ? 'Every day' : `${n}× a week`)

const colorNames: Record<GoalColor, string> = {
  lime: 'Green',
  sky: 'Blue',
  violet: 'Purple',
  coral: 'Red',
  amber: 'Orange',
  mint: 'Sky'
}

export function GoalsView({
  goals,
  tasks,
  logs,
  logConfig,
  logToday,
  onCheckin,
  onCreate,
  onEdit,
  onOpenLog
}: {
  goals: Goal[]
  tasks: Task[]
  logs: DailyLog[]
  logConfig: LogConfig
  logToday: string
  onCheckin: (goal: Goal, date: string) => void
  onCreate: (draft?: GoalDraft) => void
  onEdit: (goal: Goal) => void
  onOpenLog: (date: string) => void
}) {
  const logDays = (goal: Goal) => logGoalDays(logs, logConfig.fields, goal.id)
  const progress = goals.map((goal) => goalProgress(goal, tasks, undefined, logDays(goal)))
  const onTrack = progress.filter((p) => p.done >= p.target).length
  const ideas = suggestions.filter((s) => !goals.some((g) => g.title.toLowerCase() === s.title.toLowerCase()))

  return (
    <section className="view goals-view">
      <header className="view-head with-action">
        <div>
          <h1>Goals</h1>
          {goals.length > 0 && (
            <p className="view-meta tabular">
              {onTrack} of {goals.length} met this week
            </p>
          )}
        </div>
        <button type="button" className="soft-button" onClick={() => onCreate()}>
          <Plus size={16} /> New goal
        </button>
      </header>

      <DailyLogCard logs={logs} config={logConfig} today={logToday} onOpen={onOpenLog} />

      <section className="page-section" aria-labelledby="goals-week">
        <h2 className="section-title" id="goals-week">
          This week
        </h2>
        {goals.length ? (
          <div className="goal-list">
            <AnimatePresence initial={false} mode="popLayout">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  tasks={tasks}
                  logDays={logDays(goal)}
                  onCheckin={(date) => onCheckin(goal, date)}
                  onEdit={() => onEdit(goal)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <EmptyNote>No goals yet. Pick a suggestion below or make your own.</EmptyNote>
        )}
      </section>

      {ideas.length > 0 && (
        <section className="page-section goal-suggestions" aria-labelledby="goal-ideas">
          <h2 className="section-title" id="goal-ideas">
            Suggestions
          </h2>
          <div className="chip-row">
            {ideas.map((s) => (
              <Chip key={s.title} className={`goal-chip ${s.color}`} onClick={() => onCreate(s)}>
                <span aria-hidden>{s.emoji}</span>
                {s.title}
                <small>{targetLabel(s.weeklyTarget)}</small>
              </Chip>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

const GoalCard = forwardRef<
  HTMLElement,
  { goal: Goal; tasks: Task[]; logDays: string[]; onCheckin: (date: string) => void; onEdit: () => void }
>(function GoalCard({ goal, tasks, logDays, onCheckin, onEdit }, ref) {
  const today = todayKey()
  const progress = goalProgress(goal, tasks, today, logDays)
  const linked = tasks.filter((t) => t.goalId === goal.id).length
  const met = progress.done >= progress.target
  const meta: ReactNode[] = [
    `${progress.done} of ${progress.target}${met ? ', met' : ''}`,
    progress.streak > 0 && (
      <span className="streak" title="Weeks in a row you met this goal">
        <Flame size={13} /> {progress.streak} wk
      </span>
    ),
    linked > 0 && `${linked} linked ${linked === 1 ? 'task' : 'tasks'}`
  ].filter(Boolean)

  const checkToday = () => {
    if (!progress.lockedToday) onCheckin(today)
  }

  return (
    <motion.article
      ref={ref}
      layout
      className={cn('goal-card', goal.color, met && 'met')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
      transition={arrive}
    >
      <div className="goal-card-top">
        <span className="goal-emoji" aria-hidden>
          {goal.emoji}
        </span>
        <div className="goal-card-copy">
          <strong>{goal.title}</strong>
          <small className="tabular">
            {meta.map((part, index) => (
              <Fragment key={index}>
                {index > 0 && ' · '}
                {part}
              </Fragment>
            ))}
          </small>
        </div>
        <button type="button" className="icon-button subtle" onClick={onEdit} aria-label={`Edit ${goal.title}`} title="Edit">
          <Pencil size={15} />
        </button>
        <button
          type="button"
          className={cn('goal-check', progress.checkedToday && 'on')}
          onClick={checkToday}
          aria-pressed={progress.checkedToday}
          aria-label={progress.checkedToday ? 'Undo today' : 'Done today'}
          title={
            progress.lockedToday
              ? 'Counted from a linked task or your daily log'
              : progress.checkedToday
                ? 'Done today. Click to undo.'
                : 'Done today'
          }
        >
          <motion.span
            className="goal-check-fill"
            initial={false}
            animate={{ scale: progress.checkedToday ? 1 : 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          />
          <Check size={18} strokeWidth={2.8} />
        </button>
      </div>

      <StopLine
        className="goal-week"
        color={`var(--goal-${goal.color})`}
        label={`${goal.title} this week`}
        onSelect={onCheckin}
        stops={progress.week.map(({ date, hit }) => {
          const future = date > today
          const locked = hit && !goal.checkins.includes(date)
          return {
            key: date,
            on: hit,
            current: date === today,
            dim: future,
            disabled: future || locked,
            title: locked ? 'Counted from a linked task or your daily log' : undefined,
            label: dayLetter.format(fromDateKey(date)),
            ariaLabel: `${fromDateKey(date).toDateString()}${hit ? ', done' : ''}`
          }
        })}
      />
    </motion.article>
  )
})

export function GoalSheet({
  goal,
  draft: initialDraft,
  open,
  onClose,
  onSave,
  onDelete
}: {
  goal?: Goal
  draft?: GoalDraft
  open: boolean
  onClose: () => void
  onSave: (draft: GoalDraft, goalId?: string) => void
  onDelete: (goalId: string) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label="Goal" className="goal-sheet">
      {open && (
        <GoalForm
          key={goal?.id ?? initialDraft?.title ?? 'new'}
          goal={goal}
          initial={initialDraft}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </Sheet>
  )
}

function GoalForm({
  goal,
  initial,
  onClose,
  onSave,
  onDelete
}: {
  goal?: Goal
  initial?: GoalDraft
  onClose: () => void
  onSave: (draft: GoalDraft, goalId?: string) => void
  onDelete: (goalId: string) => void
}) {
  const [draft, setDraft] = useState<GoalDraft>(
    goal
      ? { title: goal.title, emoji: goal.emoji, color: goal.color, weeklyTarget: goal.weeklyTarget }
      : (initial ?? { title: '', emoji: '🎯', color: 'lime', weeklyTarget: 3 })
  )
  const patch = (value: Partial<GoalDraft>) => setDraft((d) => ({ ...d, ...value }))
  const canSave = draft.title.trim().length > 0

  return (
    <form
      className="goal-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) onSave(draft, goal?.id)
      }}
    >
      <SheetHead title={goal ? 'Edit goal' : 'New goal'} onClose={onClose} />

      <div className={cn('goal-preview', draft.color)}>
        <span className="goal-emoji large" aria-hidden>
          {draft.emoji}
        </span>
        <input
          className="field-input"
          autoFocus
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="Goal name, like “Read”"
          aria-label="Goal name"
        />
      </div>

      <section className="field-block">
        <div className="field-row">
          <span className="field-label">How often</span>
          <strong className="target-label">{targetLabel(draft.weeklyTarget)}</strong>
        </div>
        <div
          className="stop-line target-picker"
          style={{ '--route': `var(--goal-${draft.color})` } as React.CSSProperties}
          role="radiogroup"
          aria-label="Times per week"
        >
          {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
            <button
              type="button"
              role="radio"
              aria-checked={draft.weeklyTarget === n}
              aria-label={targetLabel(n)}
              key={n}
              className={cn(
                'stop',
                n <= draft.weeklyTarget && 'on',
                n > 1 && n <= draft.weeklyTarget && 'join-prev',
                n < draft.weeklyTarget && 'join-next',
                n === draft.weeklyTarget && 'current'
              )}
              onClick={() => patch({ weeklyTarget: n })}
            >
              <i />
              <small>{n}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="field-block">
        <span className="field-label">Icon</span>
        <div className="emoji-grid">
          {emojis.map((emoji) => (
            <button
              type="button"
              key={emoji}
              aria-pressed={draft.emoji === emoji}
              className={cn(draft.emoji === emoji && 'active')}
              onClick={() => patch({ emoji })}
            >
              {emoji}
            </button>
          ))}
        </div>
      </section>

      <section className="field-block">
        <span className="field-label">Color</span>
        <div className="swatches">
          {goalColors.map((color: GoalColor) => (
            <button
              type="button"
              key={color}
              className={cn('swatch', color, draft.color === color && 'active')}
              onClick={() => patch({ color })}
              aria-label={colorNames[color]}
              aria-pressed={draft.color === color}
              title={colorNames[color]}
            >
              {draft.color === color && (
                <motion.span className="swatch-ring" layoutId="swatch-ring" transition={spring} />
              )}
            </button>
          ))}
        </div>
      </section>

      <footer className="composer-actions">
        {goal && (
          <button
            type="button"
            className="icon-button danger"
            aria-label="Delete goal"
            title="Delete goal"
            onClick={() => onDelete(goal.id)}
          >
            <Trash2 size={16} />
          </button>
        )}
        <button type="button" className="ghost-button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={!canSave}>
          {goal ? 'Save' : 'Add goal'}
        </button>
      </footer>
    </form>
  )
}
