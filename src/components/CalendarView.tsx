import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Goal, Task } from '../types'
import {
  calendarDays,
  changeMonth,
  formatLongDate,
  formatShortDate,
  fromDateKey,
  isSameMonth,
  startOfMonth,
  todayKey
} from '../lib/date'
import { durationLabel, relativeDayLabel } from '../lib/format'
import { taskIsCompleteOn, taskMatchesDate } from '../lib/state'
import { spring } from './primitives'
import { Empty, FilterBar, type Filter, type TaskHandlers } from './TodayView'
import { TaskItem } from './TaskItem'
import { cn } from '@/lib/utils'

const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' })

function agendaTitle(date: string): string {
  const relative = relativeDayLabel(date)
  return ['Today', 'Tomorrow', 'Yesterday'].includes(relative)
    ? `${relative} · ${formatShortDate(date)}`
    : formatLongDate(date)
}

export function CalendarView({
  tasks,
  goals,
  filter,
  selected,
  month,
  onFilter,
  onSelected,
  onMonth,
  onAdd,
  handlers
}: {
  tasks: Task[]
  goals: Goal[]
  filter: Filter
  selected: string
  month: string
  onFilter: (v: Filter) => void
  onSelected: (v: string) => void
  onMonth: (v: string) => void
  onAdd: () => void
  handlers: TaskHandlers
}) {
  const [direction, setDirection] = useState(0)
  const lastSwipe = useRef(0)
  const today = todayKey()
  const filtered = tasks.filter((t) => filter === 'all' || t.category === filter)
  const goalsById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals])
  const agenda = filtered
    .filter((t) => taskMatchesDate(t, selected))
    .sort(
      (a, b) =>
        Number(taskIsCompleteOn(a, selected)) - Number(taskIsCompleteOn(b, selected)) ||
        (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99')
    )
  const agendaMinutes = agenda
    .filter((t) => !taskIsCompleteOn(t, selected))
    .reduce((sum, t) => sum + t.estimateMinutes, 0)

  const go = (delta: number) => {
    setDirection(delta)
    onMonth(changeMonth(month, delta))
  }
  const jumpToday = () => {
    setDirection(today < month ? -1 : 1)
    onMonth(startOfMonth(today))
    onSelected(today)
  }
  const year = fromDateKey(month).getFullYear()

  return (
    <section className="view calendar-view">
      <header className="view-head calendar-head">
        <div>
          <p className="eyebrow">{year}</p>
          <div className="month-title">
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.h1
                key={month}
                initial={{ y: direction * 24, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: direction * -24, opacity: 0, filter: 'blur(4px)' }}
                transition={spring}
              >
                {monthName.format(fromDateKey(month))}
              </motion.h1>
            </AnimatePresence>
          </div>
        </div>
        <div className="month-controls">
          {(!isSameMonth(month, today) || selected !== today) && (
            <motion.button
              type="button"
              className="today-button"
              onClick={jumpToday}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              Today
            </motion.button>
          )}
          <button type="button" className="icon-button" onClick={() => go(-1)} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="icon-button" onClick={() => go(1)} aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <FilterBar value={filter} onChange={onFilter} />

      <div
        className="calendar"
        onWheel={(event) => {
          // Horizontal trackpad swipes page months, once per gesture.
          if (Math.abs(event.deltaX) < 30 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return
          if (event.timeStamp - lastSwipe.current < 600) return
          lastSwipe.current = event.timeStamp
          go(event.deltaX > 0 ? 1 : -1)
        }}
      >
        <div className="calendar-weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <small key={d}>{d}</small>
          ))}
        </div>
        <div className="calendar-viewport">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={month}
              className="calendar-grid"
              initial={{ x: `${direction * 30}%`, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: `${direction * -30}%`, opacity: 0 }}
              transition={spring}
            >
              {calendarDays(month).map((date) => {
                const dayTasks = filtered.filter((t) => taskMatchesDate(t, date))
                const open = dayTasks.filter((t) => !taskIsCompleteOn(t, date))
                const allDone = dayTasks.length > 0 && open.length === 0
                const isSelected = date === selected
                return (
                  <button
                    type="button"
                    key={date}
                    className={cn(
                      'calendar-day',
                      isSelected && 'selected',
                      date === today && 'today',
                      date < today && 'past',
                      !isSameMonth(date, month) && 'outside'
                    )}
                    onClick={() => onSelected(date)}
                    onDoubleClick={() => {
                      onSelected(date)
                      onAdd()
                    }}
                    aria-label={`${formatLongDate(date)}, ${dayTasks.length} tasks`}
                  >
                    {isSelected && (
                      <motion.span className="calendar-pill" layoutId="calendar-pill" transition={spring} />
                    )}
                    <span className="calendar-num">{fromDateKey(date).getDate()}</span>
                    <span className="calendar-dots">
                      {allDone ? (
                        <b className="all-done" />
                      ) : (
                        open.slice(0, 3).map((t) => <b className={t.category} key={t.id} />)
                      )}
                    </span>
                  </button>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="agenda-head">
        <div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.strong
              key={selected}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring}
            >
              {agendaTitle(selected)}
            </motion.strong>
          </AnimatePresence>
          <small>
            {agenda.length ? `${agenda.length} tasks · ${durationLabel(agendaMinutes)} left` : 'Free day'}
          </small>
        </div>
        <motion.button type="button" className="soft-button" onClick={onAdd} whileTap={{ scale: 0.95 }}>
          <Plus size={14} /> Add
        </motion.button>
      </div>

      <div className="task-list">
        <AnimatePresence initial={false} mode="popLayout">
          {agenda.map((task) => (
            <TaskItem
              key={`${selected}-${task.id}`}
              task={task}
              date={selected}
              goal={task.goalId ? goalsById.get(task.goalId) : undefined}
              onToggle={() => handlers.onToggle(task, selected)}
              onEdit={() => handlers.onEdit(task)}
              onDelete={() => handlers.onDelete(task)}
              onTimer={() => handlers.onTimer(task)}
            />
          ))}
        </AnimatePresence>
        {!agenda.length && <Empty title="Open day" body="Double-click any day to plan something." />}
      </div>
    </section>
  )
}
