import { forwardRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Flame, Link2, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Goal, GoalColor, GoalDraft, Task } from '../types'
import { fromDateKey, todayKey } from '../lib/date'
import { goalProgress } from '../lib/goals'
import { goalColors } from '../lib/state'
import { Burst, Chip, RollingNumber, Sheet, spring } from './primitives'
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

export function GoalsView({
  goals,
  tasks,
  onCheckin,
  onCreate,
  onEdit
}: {
  goals: Goal[]
  tasks: Task[]
  onCheckin: (goal: Goal, date: string) => void
  onCreate: (draft?: GoalDraft) => void
  onEdit: (goal: Goal) => void
}) {
  const progress = goals.map((goal) => goalProgress(goal, tasks))
  const onTrack = progress.filter((p) => p.done >= p.target).length

  return (
    <section className="view goals-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Weekly rhythms</p>
          <h1>Goals</h1>
          <p className="view-sub">
            {goals.length
              ? `${onTrack} of ${goals.length} hit this week. Linked tasks count automatically.`
              : 'Pick a few things you want to do regularly. Check in when you do them.'}
          </p>
        </div>
        <motion.button
          type="button"
          className="soft-button"
          onClick={() => onCreate()}
          whileTap={{ scale: 0.95 }}
        >
          <Plus size={14} /> New
        </motion.button>
      </header>

      <div className="goal-list">
        <AnimatePresence initial={false} mode="popLayout">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              tasks={tasks}
              onCheckin={(date) => onCheckin(goal, date)}
              onEdit={() => onEdit(goal)}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="goal-suggestions">
        <span className="field-label">{goals.length ? 'Ideas' : 'Start with one'}</span>
        <div className="chip-row">
          {suggestions
            .filter((s) => !goals.some((g) => g.title.toLowerCase() === s.title.toLowerCase()))
            .map((s) => (
              <Chip key={s.title} className={`goal-chip ${s.color}`} onClick={() => onCreate(s)}>
                <span>{s.emoji}</span>
                {s.title}
                <small>{s.weeklyTarget}×</small>
              </Chip>
            ))}
        </div>
      </div>
    </section>
  )
}

const GoalCard = forwardRef<
  HTMLElement,
  { goal: Goal; tasks: Task[]; onCheckin: (date: string) => void; onEdit: () => void }
>(function GoalCard({ goal, tasks, onCheckin, onEdit }, ref) {
  const today = todayKey()
  const progress = goalProgress(goal, tasks, today)
  const linked = tasks.filter((t) => t.goalId === goal.id).length
  const met = progress.done >= progress.target
  const [pop, setPop] = useState(0)

  const checkToday = () => {
    if (progress.lockedToday) return
    if (!progress.checkedToday) setPop((n) => n + 1)
    onCheckin(today)
  }

  return (
    <motion.article
      ref={ref}
      layout
      className={cn('goal-card', goal.color, met && 'met')}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={spring}
    >
      <div className="goal-card-top">
        <span className="goal-emoji">{goal.emoji}</span>
        <div className="goal-card-copy">
          <strong>{goal.title}</strong>
          <small>
            <RollingNumber value={progress.done} /> of {progress.target} this week
            {progress.streak > 0 && (
              <span className="streak">
                <Flame size={11} /> {progress.streak} wk
              </span>
            )}
          </small>
        </div>
        <button type="button" className="icon-button subtle" onClick={onEdit} aria-label={`Edit ${goal.title}`}>
          <Pencil size={13} />
        </button>
        <motion.button
          type="button"
          className={cn('goal-check', progress.checkedToday && 'on')}
          onClick={checkToday}
          whileTap={{ scale: 0.88 }}
          aria-pressed={progress.checkedToday}
          aria-label={progress.checkedToday ? 'Undo today’s check-in' : 'Check in for today'}
          title={
            progress.lockedToday
              ? 'Counted from a linked task'
              : progress.checkedToday
                ? 'Done today — tap to undo'
                : 'Did it today'
          }
        >
          <motion.span
            className="goal-check-fill"
            initial={false}
            animate={{ scale: progress.checkedToday ? 1 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
          />
          <Check size={18} strokeWidth={2.6} />
          <Burst key={pop} show={pop > 0} color={`var(--goal-${goal.color})`} />
        </motion.button>
      </div>

      <div className="goal-week">
        {progress.week.map(({ date, hit }) => {
          const future = date > today
          const locked = hit && !goal.checkins.includes(date)
          return (
            <button
              type="button"
              key={date}
              disabled={future || locked}
              className={cn('goal-day', hit && 'hit', date === today && 'today', future && 'future')}
              onClick={() => onCheckin(date)}
              title={locked ? 'Counted from a linked task' : undefined}
              aria-label={`${fromDateKey(date).toDateString()}${hit ? ', done' : ''}`}
            >
              <small>{dayLetter.format(fromDateKey(date))}</small>
              <motion.i
                initial={false}
                animate={{ scale: hit ? 1 : 0.55 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              />
            </button>
          )
        })}
      </div>

      <div className="goal-bar" aria-hidden>
        {Array.from({ length: progress.target }, (_, i) => (
          <span key={i}>
            <motion.i
              initial={false}
              animate={{ scaleX: i < progress.done ? 1 : 0 }}
              transition={{ ...spring, delay: i * 0.04 }}
            />
          </span>
        ))}
      </div>

      {linked > 0 && (
        <p className="goal-linked">
          <Link2 size={11} /> {linked} linked {linked === 1 ? 'task' : 'tasks'}
        </p>
      )}
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
      <header className="composer-head">
        <p className="eyebrow">{goal ? 'Edit goal' : 'New goal'}</p>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </header>

      <div className={cn('goal-preview', draft.color)}>
        <motion.span
          key={draft.emoji}
          className="goal-emoji large"
          initial={{ scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
        >
          {draft.emoji}
        </motion.span>
        <input
          autoFocus
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="What do you want to do regularly?"
          aria-label="Goal name"
        />
      </div>

      <section className="field-block">
        <div className="field-row">
          <span className="field-label">How often</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.strong
              key={draft.weeklyTarget}
              className="target-label"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
            >
              {targetLabel(draft.weeklyTarget)}
            </motion.strong>
          </AnimatePresence>
        </div>
        <div className={cn('target-picker', draft.color)} role="radiogroup" aria-label="Times per week">
          {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
            <button
              type="button"
              role="radio"
              aria-checked={draft.weeklyTarget === n}
              key={n}
              className={cn(n <= draft.weeklyTarget && 'filled', n === draft.weeklyTarget && 'active')}
              onClick={() => patch({ weeklyTarget: n })}
            >
              <motion.i
                initial={false}
                animate={{ scale: n <= draft.weeklyTarget ? 1 : 0.4 }}
                transition={{ type: 'spring', stiffness: 520, damping: 24, delay: n * 0.015 }}
              />
              <small>{n}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="field-block">
        <span className="field-label">Icon</span>
        <div className="emoji-grid">
          {emojis.map((emoji) => (
            <motion.button
              type="button"
              key={emoji}
              className={cn(draft.emoji === emoji && 'active')}
              onClick={() => patch({ emoji })}
              whileTap={{ scale: 0.85 }}
              whileHover={{ scale: 1.12 }}
            >
              {emoji}
            </motion.button>
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
              aria-label={color}
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
            onClick={() => onDelete(goal.id)}
          >
            <Trash2 size={15} />
          </button>
        )}
        <button type="button" className="ghost-button" onClick={onClose}>
          Cancel
        </button>
        <motion.button type="submit" className="primary-button" disabled={!canSave} whileTap={{ scale: 0.97 }}>
          {goal ? 'Save' : 'Add goal'}
        </motion.button>
      </footer>
    </form>
  )
}
