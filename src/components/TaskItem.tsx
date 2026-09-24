import { forwardRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Bell, CornerDownRight, Pencil, Play, Repeat2, Star, Trash2 } from 'lucide-react'
import type { Goal, Task } from '../types'
import { durationLabel, relativeDayLabel, timeRangeLabel } from '../lib/format'
import { taskIsCompleteOn } from '../lib/state'
import { formatShortDate } from '../lib/date'
import { areas } from './areas'
import { Burst, spring } from './primitives'
import { cn } from '@/lib/utils'

const repeatLabel = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly' }

export const TaskItem = forwardRef<
  HTMLDivElement,
  {
    task: Task
    date: string
    goal?: Goal
    showDay?: boolean
    timing?: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
    onTimer: () => void
  }
>(function TaskItem({ task, date, goal, showDay, timing, onToggle, onEdit, onDelete, onTimer }, ref) {
  const done = taskIsCompleteOn(task, date)
  const [burst, setBurst] = useState(0)
  const reduce = useReducedMotion()

  const toggle = () => {
    if (!done) setBurst((n) => n + 1)
    onToggle()
  }

  return (
    <motion.div
      ref={ref}
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? undefined : { opacity: 0, x: -24, scale: 0.96, transition: { duration: 0.18 } }}
      transition={spring}
      className={cn('task', task.category, done && 'done', timing && 'timing')}
    >
      <button
        type="button"
        aria-label={done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
        className="task-check"
        onClick={toggle}
      >
        <motion.span
          className="task-check-fill"
          initial={false}
          animate={{ scale: done ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 600, damping: 26 }}
        />
        <svg viewBox="0 0 16 16" aria-hidden>
          <motion.path
            d="M3.5 8.4 6.6 11.3 12.5 4.9"
            fill="none"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
            transition={{ duration: 0.28, delay: done ? 0.06 : 0 }}
          />
        </svg>
        <Burst key={burst} show={burst > 0} color={`var(--${task.category})`} />
      </button>

      <button type="button" className="task-body" onClick={onEdit}>
        <span className="task-title">
          {task.priority === 1 && !done && <Star className="task-star" size={12} />}
          <span className="task-title-text">{task.title}</span>
        </span>
        <span className="task-meta">
          <i className={`area-dot ${task.category}`} title={areas[task.category].label} />
          {showDay && <span>{relativeDayLabel(task.dueDate)}</span>}
          {task.dueTime ? (
            <span className="task-time">{timeRangeLabel(task.dueTime, task.estimateMinutes)}</span>
          ) : (
            <span>{durationLabel(task.estimateMinutes)}</span>
          )}
          {task.recurrence && (
            <span title={repeatLabel[task.recurrence.kind]}>
              <Repeat2 size={11} />
              {repeatLabel[task.recurrence.kind]}
            </span>
          )}
          {task.dueTime && task.remindBefore !== null && task.remindBefore !== undefined && (
            <span title="Reminder set">
              <Bell size={10} />
            </span>
          )}
          {goal && (
            <span className="task-goal" title={goal.title}>
              {goal.emoji}
            </span>
          )}
          {task.rolledOverFrom && !done && (
            <span className="carried" title={`Carried over from ${formatShortDate(task.rolledOverFrom)}`}>
              <CornerDownRight size={10} />
              {relativeDayLabel(task.rolledOverFrom)}
            </span>
          )}
        </span>
      </button>

      <div className="task-actions">
        {!done && (
          <button
            type="button"
            aria-label={`Start ${task.estimateMinutes} minute focus timer`}
            title={`Focus ${durationLabel(task.estimateMinutes)}`}
            onClick={onTimer}
          >
            <Play size={13} />
          </button>
        )}
        <button type="button" aria-label={`Edit ${task.title}`} title="Edit" onClick={onEdit}>
          <Pencil size={13} />
        </button>
        <button
          type="button"
          className="danger"
          aria-label={`Delete ${task.title}`}
          title="Delete"
          onClick={onDelete}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </motion.div>
  )
})
