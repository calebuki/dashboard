import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addDays,
  calendarDays,
  changeMonth,
  fromDateKey,
  isSameMonth,
  monthTitle,
  startOfMonth,
  todayKey
} from '../lib/date'
import { parseFlexibleTime } from '../lib/quick-add'
import { addMinutesToTime } from '../lib/format'
import { spring } from './primitives'
import { cn } from '@/lib/utils'

const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

/** Two weeks of days as a horizontal strip, with a toggle for a full month picker. */
export function DayStrip({
  value,
  onChange,
  calendarOpen,
  onCalendar
}: {
  value: string
  onChange: (date: string) => void
  calendarOpen: boolean
  onCalendar: () => void
}) {
  const today = todayKey()
  const days = Array.from({ length: 14 }, (_, index) => addDays(today, index))
  const outside = !days.includes(value)
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('.day.active')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [value])

  return (
    <div className="day-strip-wrap">
      <div
        className="day-strip"
        ref={strip}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX))
            event.currentTarget.scrollLeft += event.deltaY
        }}
      >
        {days.map((date, index) => {
          const active = date === value
          const d = fromDateKey(date)
          return (
            <button
              type="button"
              key={date}
              className={cn('day', active && 'active', [0, 6].includes(d.getDay()) && 'weekend')}
              onClick={() => onChange(date)}
              aria-pressed={active}
            >
              {active && <motion.span className="day-pill" layoutId="day-pill" transition={spring} />}
              <small>{index === 0 ? 'Today' : index === 1 ? 'Tmrw' : weekday.format(d)}</small>
              <strong>{d.getDate()}</strong>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        className={cn('day-strip-more', (calendarOpen || outside) && 'active')}
        onClick={onCalendar}
        aria-label="Pick another date"
        title="Pick another date"
      >
        <CalendarDays size={16} />
        {outside && <small>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(fromDateKey(value))}</small>}
      </button>
    </div>
  )
}

export function MiniCalendar({
  value,
  onChange
}: {
  value: string
  onChange: (date: string) => void
}) {
  const [month, setMonth] = useState(startOfMonth(value))
  const [direction, setDirection] = useState(0)
  const today = todayKey()
  const go = (delta: number) => {
    setDirection(delta)
    setMonth(changeMonth(month, delta))
  }
  return (
    <div className="mini-calendar">
      <header>
        <button type="button" onClick={() => go(-1)} aria-label="Previous month">
          <ChevronLeft size={15} />
        </button>
        <strong>{monthTitle(month)}</strong>
        <button type="button" onClick={() => go(1)} aria-label="Next month">
          <ChevronRight size={15} />
        </button>
      </header>
      <div className="mini-weekdays">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <small key={i}>{d}</small>
        ))}
      </div>
      <div className="mini-grid-viewport">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={month}
            className="mini-grid"
            custom={direction}
            initial={{ x: direction * 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -40, opacity: 0 }}
            transition={spring}
          >
            {calendarDays(month).map((date) => (
              <button
                type="button"
                key={date}
                disabled={date < today}
                className={cn(
                  date === value && 'active',
                  date === today && 'today',
                  !isSameMonth(date, month) && 'outside'
                )}
                onClick={() => onChange(date)}
              >
                {fromDateKey(date).getDate()}
              </button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

const ITEM_HEIGHT = 34

function WheelColumn<T extends string | number>({
  items,
  value,
  onChange,
  format,
  label
}: {
  items: T[]
  value: T
  onChange: (value: T) => void
  format: (value: T) => string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const userScrolling = useRef(false)
  const settle = useRef<number | undefined>(undefined)
  const mounted = useRef(false)
  const index = Math.max(0, items.indexOf(value))

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || userScrolling.current) return
    const top = index * ITEM_HEIGHT
    if (Math.abs(el.scrollTop - top) > 1)
      el.scrollTo({ top, behavior: mounted.current ? 'smooth' : 'auto' })
    mounted.current = true
  }, [index])

  const onScroll = () => {
    userScrolling.current = true
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      userScrolling.current = false
      const el = ref.current
      if (!el) return
      const next = items[Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)))]
      if (next !== value) onChange(next)
    }, 110)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const step = event.key === 'ArrowUp' ? -1 : 1
    onChange(items[(index + step + items.length) % items.length])
  }

  return (
    <div
      className="wheel"
      ref={ref}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label={label}
    >
      <div className="wheel-pad" />
      {items.map((item) => (
        <button
          type="button"
          tabIndex={-1}
          role="option"
          aria-selected={item === value}
          key={String(item)}
          className={cn('wheel-item', item === value && 'active')}
          onClick={() => onChange(item)}
        >
          {format(item)}
        </button>
      ))}
      <div className="wheel-pad" />
    </div>
  )
}

const hours12 = Array.from({ length: 12 }, (_, i) => i + 1)

/** Scroll-wheel time picker (hour · minute · am/pm) plus forgiving typed entry. */
export function TimeWheel({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const [h24, minute] = value.split(':').map(Number)
  const period: 'am' | 'pm' = h24 >= 12 ? 'pm' : 'am'
  const hour = h24 % 12 || 12
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)
  if (!minutes.includes(minute)) {
    minutes.push(minute)
    minutes.sort((a, b) => a - b)
  }

  const set = (nextHour: number, nextMinute: number, nextPeriod: 'am' | 'pm') => {
    const h = (nextHour % 12) + (nextPeriod === 'pm' ? 12 : 0)
    onChange(`${String(h).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`)
  }

  const [typed, setTyped] = useState('')
  const [bad, setBad] = useState(false)
  const commitTyped = () => {
    if (!typed.trim()) return
    const parsed = parseFlexibleTime(typed)
    if (!parsed) {
      setBad(true)
      return
    }
    setBad(false)
    setTyped('')
    onChange(parsed)
  }

  return (
    <div className="time-wheel">
      <div className="wheel-group">
        <div className="wheel-band" aria-hidden />
        <WheelColumn
          label="Hour"
          items={hours12}
          value={hour}
          format={(v) => String(v)}
          onChange={(v) => set(v, minute, period)}
        />
        <span className="wheel-colon">:</span>
        <WheelColumn
          label="Minute"
          items={minutes}
          value={minute}
          format={(v) => String(v).padStart(2, '0')}
          onChange={(v) => set(hour, v, period)}
        />
        <WheelColumn
          label="AM or PM"
          items={['am', 'pm'] as ('am' | 'pm')[]}
          value={period}
          format={(v) => v.toUpperCase()}
          onChange={(v) => set(hour, minute, v)}
        />
      </div>
      <div className="time-side">
        <label className={cn('time-typed', bad && 'error')}>
          <input
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value)
              setBad(false)
            }}
            onBlur={commitTyped}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitTyped()
              }
            }}
            placeholder="Type 3:30p"
            aria-label="Type a time"
          />
        </label>
        <div className="time-nudge">
          <button type="button" onClick={() => onChange(addMinutesToTime(value, -15))} aria-label="15 minutes earlier">
            −15
          </button>
          <button type="button" onClick={() => onChange(addMinutesToTime(value, 15))} aria-label="15 minutes later">
            +15
          </button>
        </div>
        <small className="time-hint">{bad ? 'Try “9am” or “14:30”' : 'Scroll or use ↑ ↓'}</small>
      </div>
    </div>
  )
}

/** The next half hour from now, for a sensible default time. */
export function nextHalfHour(now = new Date()): string {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const next = Math.min(23 * 60 + 30, Math.ceil((minutes + 1) / 30) * 30)
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}
