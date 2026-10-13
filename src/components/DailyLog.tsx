import { useMemo, useState, type PointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  Flame,
  Minus,
  Plus,
  Settings2,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react'
import type {
  DailyLog,
  Goal,
  GymKind,
  LogConfig,
  LogField,
  LogFieldKind
} from '../types'
import { addDays, formatShortDate, fromDateKey } from '../lib/date'
import { durationLabel, timeLabel } from '../lib/format'
import {
  MIN_DAYS_FOR_INSIGHTS,
  builtInFields,
  caffeineIsLate,
  compareFactors,
  gymKinds,
  gymTrained,
  habitStreak,
  isLogged,
  logProgress,
  loggedDayCount,
  scoreValue,
  sleepHoursValue,
  sleepMinutes,
  trend,
  typicalBedtime,
  type Comparison,
  type SeriesValue
} from '../lib/daily-log'
import { createId } from '../lib/state'
import { Chip, Collapse, Segmented, Sheet, Switch, spring } from './primitives'
import { cn } from '@/lib/utils'

const dayLetter = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' })
const weekdayShort = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

const scoreAnchors: Record<string, [string, string]> = {
  clarity: ['foggy', 'crystal clear'],
  focus: ['scattered', 'locked in'],
  memory: ['forgetful', 'sharp recall'],
  connection: ['numb', 'deeply connected']
}
const anchorsFor = (field: LogField) => scoreAnchors[field.id] ?? ['low', 'high']

const qualityLabels = ['Rough', 'Poor', 'Okay', 'Good', 'Great']

const caffeinePresets = [
  { label: 'Coffee', mg: 95 },
  { label: 'Espresso', mg: 63 },
  { label: 'Tea', mg: 47 },
  { label: 'Energy drink', mg: 160 }
]

const fieldSuggestions: Omit<LogField, 'id'>[] = [
  { kind: 'habit', label: 'Morning sunlight', emoji: '☀️' },
  { kind: 'habit', label: 'Meditated', emoji: '🧘' },
  { kind: 'habit', label: 'Took supplements', emoji: '💊' },
  { kind: 'habit', label: 'Read 20 min', emoji: '📖' },
  { kind: 'number', label: 'Water', emoji: '💧', unit: 'glasses' },
  { kind: 'number', label: 'Screen time', emoji: '📱', unit: 'hours' }
]

const kindLabels: Record<LogFieldKind, string> = {
  habit: 'Yes / no',
  score: '1–10',
  number: 'Number',
  sleep: 'Sleep',
  caffeine: 'Caffeine',
  gym: 'Gym'
}

function brainScore(log: DailyLog | undefined, fields: LogField[]): number | null {
  if (!log) return null
  const values = fields.filter((field) => field.kind === 'score' && field.id in log.scores)
  if (!values.length) return null
  return values.reduce((sum, field) => sum + log.scores[field.id], 0) / values.length
}

const oneDecimal = (value: number) => (Math.round(value * 10) / 10).toFixed(1)

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
/** Typing into the icon box replaces the emoji; keep whole emoji like 🏋️ intact. */
const lastGrapheme = (text: string) => [...graphemes.segment(text)].at(-1)?.segment ?? ''

/* ───────────────────────── Card on the Goals tab ───────────────────────── */

export function DailyLogCard({
  logs,
  config,
  today,
  onOpen
}: {
  logs: DailyLog[]
  config: LogConfig
  today: string
  onOpen: (date: string) => void
}) {
  const [trendsOpen, setTrendsOpen] = useState(false)
  const byDate = new Map(logs.map((log) => [log.id, log]))
  const todayLog = byDate.get(today)
  const yesterday = addDays(today, -1)
  const progress = logProgress(todayLog, config.fields)
  const score = brainScore(todayLog, config.fields)
  const done = progress.total > 0 && progress.filled === progress.total
  const streaks = config.fields
    .filter((field) => field.kind === 'habit')
    .map((field) => ({ field, streak: habitStreak(logs, field.id, today) }))
    .filter(({ streak }) => streak.current > 0)
  const week = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6))

  return (
    <section className={cn('log-card', done && 'done')} aria-label="Daily log">
      <div className="log-card-top">
        <span className="goal-emoji log-emoji">🧠</span>
        <div className="goal-card-copy">
          <strong>Daily log</strong>
          <small>
            {done
              ? 'Logged for today'
              : progress.filled
                ? `${progress.filled} of ${progress.total} filled today`
                : 'Nothing logged yet today'}
            {score !== null && <span className="log-score-chip">Brain {oneDecimal(score)}</span>}
          </small>
        </div>
        <motion.button
          type="button"
          className={done ? 'soft-button' : 'primary-button'}
          onClick={() => onOpen(today)}
          whileTap={{ scale: 0.95 }}
        >
          {done ? 'Edit' : progress.filled ? 'Continue' : 'Log today'}
        </motion.button>
      </div>

      {!isLogged(byDate.get(yesterday)) && (
        <button type="button" className="log-nudge" onClick={() => onOpen(yesterday)}>
          Yesterday is empty — fill it in while you remember
        </button>
      )}

      <div className="log-week" aria-label="Last 7 days">
        {week.map((date) => {
          const logged = isLogged(byDate.get(date))
          const editable = date >= yesterday
          return (
            <button
              type="button"
              key={date}
              disabled={!editable}
              className={cn('goal-day', logged && 'hit', date === today && 'today')}
              onClick={() => onOpen(date)}
              aria-label={`${fromDateKey(date).toDateString()}${logged ? ', logged' : ''}`}
              title={editable ? undefined : 'Only today and yesterday can be edited'}
            >
              <small>{dayLetter.format(fromDateKey(date))}</small>
              <motion.i
                initial={false}
                animate={{ scale: logged ? 1 : 0.55 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              />
            </button>
          )
        })}
      </div>

      {streaks.length > 0 && (
        <div className="log-streaks">
          {streaks.map(({ field, streak }) => (
            <span key={field.id} className="streak" title={`Best: ${streak.best} days`}>
              <Flame size={11} /> {field.emoji} {streak.current}-day streak
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        className={cn('log-trends-toggle', trendsOpen && 'open')}
        onClick={() => setTrendsOpen((open) => !open)}
        aria-expanded={trendsOpen}
      >
        Trends & insights <ChevronDown size={13} />
      </button>
      <Collapse open={trendsOpen}>
        <LogInsights logs={logs} config={config} today={today} />
      </Collapse>
    </section>
  )
}

/* ───────────────────────── Trends, streaks, comparisons ───────────────────────── */

function LogInsights({ logs, config, today }: { logs: DailyLog[]; config: LogConfig; today: string }) {
  const [days, setDays] = useState<7 | 30>(7)
  const rows: { key: string; emoji: string; label: string; value: SeriesValue; unit: string; domain: [number, number] }[] =
    [
      ...config.fields
        .filter((field) => field.kind === 'score')
        .map((field) => ({
          key: field.id,
          emoji: field.emoji,
          label: field.label,
          value: scoreValue(field.id),
          unit: '',
          domain: [1, 10] as [number, number]
        })),
      ...(config.fields.some((field) => field.kind === 'sleep')
        ? [{ key: 'sleep', emoji: '😴', label: 'Sleep', value: sleepHoursValue, unit: 'h', domain: [4, 10] as [number, number] }]
        : [])
    ]
  const habits = config.fields.filter((field) => field.kind === 'habit')
  const logged = loggedDayCount(logs)
  const comparisons = useMemo(() => compareFactors(logs, config.fields), [logs, config.fields])

  return (
    <div className="log-insights">
      <div className="field-row">
        <span className="field-label">Trends</span>
        <Segmented
          size="sm"
          label="Trend range"
          value={days}
          onChange={setDays}
          options={[
            { value: 7, label: '7 days' },
            { value: 30, label: '30 days' }
          ]}
        />
      </div>
      <div className="trend-list">
        {rows.map(({ key, ...row }) => (
          <TrendRow key={key} {...row} trend={trend(logs, row.value, days, today)} />
        ))}
      </div>

      {habits.length > 0 && (
        <>
          <span className="field-label">Streaks</span>
          <div className="streak-list">
            {habits.map((field) => {
              const streak = habitStreak(logs, field.id, today)
              return (
                <div key={field.id} className="streak-row">
                  <span>{field.emoji}</span>
                  <strong>{field.label}</strong>
                  <span className={cn('streak', !streak.current && 'cold')}>
                    <Flame size={11} /> {streak.current}d
                  </span>
                  <small>best {streak.best}d</small>
                </div>
              )
            })}
          </div>
        </>
      )}

      <span className="field-label">What seems to help</span>
      {logged < MIN_DAYS_FOR_INSIGHTS ? (
        <div className="insight-locked">
          <p>
            Comparisons show up after {MIN_DAYS_FOR_INSIGHTS} logged days. {logged} so far.
          </p>
          <div className="goal-bar" aria-hidden>
            <span>
              <motion.i
                initial={false}
                animate={{ scaleX: logged / MIN_DAYS_FOR_INSIGHTS }}
                transition={spring}
              />
            </span>
          </div>
        </div>
      ) : comparisons.length ? (
        <>
          <ul className="insight-list">
            {comparisons.map((item) => (
              <InsightRow key={item.key} item={item} />
            ))}
          </ul>
          <p className="insight-footnote">These are patterns, not proof. Other things change from day to day too.</p>
        </>
      ) : (
        <p className="insight-locked">No clear differences yet. Keep logging and they’ll show up here.</p>
      )}
    </div>
  )
}

function InsightRow({ item }: { item: Comparison }) {
  const better = item.withAverage > item.withoutAverage
  const value = (n: number) => `${oneDecimal(n)}${item.unit}`
  return (
    <li className="insight-row">
      <span className="insight-emoji">{item.emoji}</span>
      <div>
        <strong>{item.factor}</strong>
        <span>
          {item.nextDay ? `The next night, ${item.outcome.toLowerCase()}` : item.outcome} averaged{' '}
          <b className={better ? 'up' : 'down'}>{value(item.withAverage)}</b> vs {value(item.withoutAverage)}
        </span>
        <small>
          {item.withDays} days vs {item.withoutDays} days
        </small>
      </div>
    </li>
  )
}

function TrendRow({
  emoji,
  label,
  unit,
  domain,
  trend: data
}: {
  emoji: string
  label: string
  unit: string
  domain: [number, number]
  trend: ReturnType<typeof trend>
}) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 120
  const height = 30
  const pad = 4
  const count = data.points.length
  const x = (index: number) => (count === 1 ? width / 2 : (index / (count - 1)) * width)
  const y = (value: number) => {
    const [min, max] = domain
    const clamped = Math.min(max, Math.max(min, value))
    return pad + (1 - (clamped - min) / (max - min)) * (height - pad * 2)
  }
  // Break the line wherever a day is missing.
  const segments: string[] = []
  let current: string[] = []
  data.points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length) segments.push(current.join(' '))
      current = []
    } else current.push(`${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
  })
  if (current.length) segments.push(current.join(' '))
  // Dots for the latest day and for any day with no neighbours (a line needs two points).
  const lastIndex = data.points.reduce((last, point, index) => (point.value !== null ? index : last), -1)
  const dots = data.points.flatMap((point, index) =>
    point.value !== null &&
    (index === lastIndex || (data.points[index - 1]?.value == null && data.points[index + 1]?.value == null))
      ? [{ value: point.value, index }]
      : []
  )
  const hovered = hover !== null ? data.points[hover] : null

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    setHover(Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1)))))
  }

  return (
    <div className="trend-row">
      <span className="trend-label">
        <span>{emoji}</span>
        {label}
      </span>
      <div className="sparkline-wrap">
        <svg
          className="sparkline"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`${label} over the last ${count} days`}
        >
          {segments.map((points, index) => (
            <polyline key={index} points={points} vectorEffect="non-scaling-stroke" />
          ))}
          {hover !== null && (
            <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={0} y2={height} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Dots live in HTML so they stay round while the line stretches. */}
        <div className="sparkline-dots" aria-hidden>
          {dots.map(({ value, index }) => (
            <i key={index} style={{ left: `${(x(index) / width) * 100}%`, top: `${(y(value) / height) * 100}%` }} />
          ))}
          {hovered?.value != null && hover !== null && (
            <i
              className="hovered"
              style={{ left: `${(x(hover) / width) * 100}%`, top: `${(y(hovered.value) / height) * 100}%` }}
            />
          )}
        </div>
      </div>
      <span className="trend-value">
        {hovered ? (
          <>
            <strong>{hovered.value === null ? '—' : `${oneDecimal(hovered.value)}${unit}`}</strong>
            <small>{weekdayShort.format(fromDateKey(hovered.date))} {formatShortDate(hovered.date)}</small>
          </>
        ) : (
          <>
            <strong>{data.average === null ? '—' : `${oneDecimal(data.average)}${unit}`}</strong>
            <small>
              {data.change === null || Math.abs(data.change) < 0.05
                ? 'avg'
                : `${data.change > 0 ? '▲' : '▼'} ${oneDecimal(Math.abs(data.change))}`}
            </small>
          </>
        )}
      </span>
    </div>
  )
}

/* ───────────────────────── Fill-in sheet ───────────────────────── */

export interface LogSheetProps {
  date: string | null
  today: string
  logs: DailyLog[]
  config: LogConfig
  goals: Goal[]
  onDate: (date: string) => void
  onChange: (date: string, change: (log: DailyLog) => DailyLog) => void
  onConfig: (config: LogConfig) => void
  onClose: () => void
}

export function DailyLogSheet(props: LogSheetProps) {
  const [mode, setMode] = useState<'log' | 'customize'>('log')
  const close = () => {
    setMode('log')
    props.onClose()
  }
  return (
    <Sheet open={props.date !== null} onClose={close} label="Daily log" className="log-sheet">
      {props.date !== null &&
        (mode === 'log' ? (
          <LogForm {...props} date={props.date} onClose={close} onCustomize={() => setMode('customize')} />
        ) : (
          <FieldEditor
            config={props.config}
            goals={props.goals}
            onConfig={props.onConfig}
            onBack={() => setMode('log')}
            onClose={close}
          />
        ))}
    </Sheet>
  )
}

function LogForm({
  date,
  today,
  logs,
  config,
  onDate,
  onChange,
  onClose,
  onCustomize
}: LogSheetProps & { date: string; onCustomize: () => void }) {
  const log = logs.find((item) => item.id === date)
  const change = (fn: (log: DailyLog) => DailyLog) => onChange(date, fn)
  const yesterday = addDays(today, -1)

  return (
    <div className="goal-form log-form">
      <header className="composer-head">
        <p className="eyebrow">Daily log · {formatShortDate(date)}</p>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </header>
      <Segmented
        className="log-day-switch"
        label="Day"
        value={date}
        onChange={onDate}
        options={[
          { value: yesterday, label: 'Yesterday' },
          { value: today, label: 'Today' }
        ]}
      />

      {config.fields.map((field) => (
        <FieldInput key={field.id} field={field} log={log} logs={logs} date={date} onChange={change} />
      ))}

      <section className="field-block">
        <span className="field-label">Notes</span>
        <textarea
          className="notes"
          rows={2}
          value={log?.note ?? ''}
          onChange={(event) => change((current) => ({ ...current, note: event.target.value }))}
          placeholder="Anything that stood out: stress, food, a bad night…"
        />
      </section>

      <footer className="composer-actions">
        <button type="button" className="ghost-button log-customize" onClick={onCustomize}>
          <Settings2 size={13} /> Customize
        </button>
        <motion.button type="button" className="primary-button" onClick={onClose} whileTap={{ scale: 0.97 }}>
          Done
        </motion.button>
      </footer>
    </div>
  )
}

function FieldBlock({ field, aside, children }: { field: LogField; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="field-block log-field">
      <div className="field-row">
        <span className="field-label">
          <span className="log-field-emoji">{field.emoji}</span>
          {field.label}
        </span>
        {aside}
      </div>
      {children}
    </section>
  )
}

function TimeField({
  label,
  value,
  onChange
}: {
  label: string
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  return (
    <label className="log-time">
      <small>{label}</small>
      <input type="time" value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)} />
    </label>
  )
}

function Scale({
  count,
  value,
  onChange,
  labels,
  label
}: {
  count: number
  value: number | undefined
  onChange: (value: number | undefined) => void
  labels?: string[]
  label: string
}) {
  return (
    <div className={cn('log-scale', `n${count}`)} role="radiogroup" aria-label={label}>
      {Array.from({ length: count }, (_, index) => index + 1).map((n) => (
        <motion.button
          type="button"
          role="radio"
          aria-checked={value === n}
          key={n}
          title={labels?.[n - 1]}
          className={cn(value !== undefined && n <= value && 'filled', value === n && 'active')}
          onClick={() => onChange(value === n ? undefined : n)}
          whileTap={{ scale: 0.9 }}
        >
          {labels ? labels[n - 1] : n}
        </motion.button>
      ))}
    </div>
  )
}

function FieldInput({
  field,
  log,
  logs,
  date,
  onChange
}: {
  field: LogField
  log: DailyLog | undefined
  logs: DailyLog[]
  date: string
  onChange: (fn: (log: DailyLog) => DailyLog) => void
}) {
  switch (field.kind) {
    case 'habit': {
      const done = Boolean(log?.checks[field.id])
      const streak = habitStreak(logs, field.id, date)
      return (
        <section className="log-habit">
          <span className="log-field-emoji">{field.emoji}</span>
          <div className="goal-card-copy">
            <strong>{field.label}</strong>
            <small>
              {streak.current > 0 ? (
                <span className="streak">
                  <Flame size={11} /> {streak.current}-day streak
                </span>
              ) : (
                'Tap when you kept it today'
              )}
            </small>
          </div>
          <motion.button
            type="button"
            className={cn('goal-check log-check', done && 'on')}
            onClick={() => onChange((current) => ({ ...current, checks: { ...current.checks, [field.id]: !done } }))}
            whileTap={{ scale: 0.88 }}
            aria-pressed={done}
            aria-label={field.label}
          >
            <motion.span
              className="goal-check-fill"
              initial={false}
              animate={{ scale: done ? 1 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            />
            <Check size={16} strokeWidth={2.6} />
          </motion.button>
        </section>
      )
    }

    case 'score': {
      const value = log?.scores[field.id]
      const [low, high] = anchorsFor(field)
      return (
        <FieldBlock field={field} aside={<strong className="log-value">{value ?? '–'}</strong>}>
          <Scale
            count={10}
            value={value}
            label={field.label}
            onChange={(next) =>
              onChange((current) => {
                const scores = { ...current.scores }
                if (next === undefined) delete scores[field.id]
                else scores[field.id] = next
                return { ...current, scores }
              })
            }
          />
          <div className="log-anchors">
            <small>1 · {low}</small>
            <small>10 · {high}</small>
          </div>
        </FieldBlock>
      )
    }

    case 'number': {
      const value = log?.numbers[field.id]
      const set = (next: number | undefined) =>
        onChange((current) => {
          const numbers = { ...current.numbers }
          if (next === undefined || Number.isNaN(next)) delete numbers[field.id]
          else numbers[field.id] = Math.max(0, next)
          return { ...current, numbers }
        })
      return (
        <FieldBlock field={field}>
          <Stepper value={value} unit={field.unit} step={1} onChange={set} label={field.label} />
        </FieldBlock>
      )
    }

    case 'sleep': {
      const sleep = log?.sleep ?? {}
      const minutes = sleepMinutes(log?.sleep)
      const set = (patch: Partial<typeof sleep>) =>
        onChange((current) => ({ ...current, sleep: { ...current.sleep, ...patch } }))
      return (
        <FieldBlock
          field={{ ...field, label: `${field.label} last night` }}
          aside={minutes !== null && <strong className="log-value">{durationLabel(minutes)}</strong>}
        >
          <div className="log-times">
            <TimeField label="Went to bed" value={sleep.bedtime} onChange={(bedtime) => set({ bedtime })} />
            <TimeField label="Woke up" value={sleep.wake} onChange={(wake) => set({ wake })} />
          </div>
          <small className="log-sub">Sleep quality</small>
          <Scale
            count={5}
            labels={qualityLabels}
            value={sleep.quality}
            label="Sleep quality"
            onChange={(quality) => set({ quality })}
          />
        </FieldBlock>
      )
    }

    case 'caffeine': {
      const caffeine = log?.caffeine
      const mg = caffeine?.mg ?? 0
      const set = (patch: Partial<NonNullable<DailyLog['caffeine']>>) =>
        onChange((current) => ({ ...current, caffeine: { mg: 0, ...current.caffeine, ...patch } }))
      // Tonight's bedtime is tomorrow's log; until then, go by the usual one.
      const tonight = logs.find((item) => item.id === addDays(date, 1))?.sleep?.bedtime
      const bedtime = tonight ?? typicalBedtime(logs, date)
      const late = mg > 0 && caffeineIsLate(caffeine?.lastAt, bedtime ?? undefined)
      return (
        <FieldBlock field={field} aside={caffeine && <strong className="log-value">{mg}mg</strong>}>
          <div className="chip-row">
            <Chip active={caffeine?.mg === 0} onClick={() => onChange((c) => ({ ...c, caffeine: { mg: 0 } }))}>
              None
            </Chip>
            {caffeinePresets.map((preset) => (
              <Chip key={preset.label} onClick={() => set({ mg: mg + preset.mg })} title={`Adds ${preset.mg}mg`}>
                {preset.label} <small>+{preset.mg}</small>
              </Chip>
            ))}
          </div>
          {caffeine !== undefined && (
            <div className="log-times">
              <Stepper value={mg} unit="mg" step={25} onChange={(value) => set({ mg: value ?? 0 })} label="Caffeine" />
              <TimeField label="Last caffeine" value={caffeine.lastAt} onChange={(lastAt) => set({ lastAt })} />
            </div>
          )}
          {late && bedtime && (
            <p className="log-warning">
              <TriangleAlert size={12} /> Within 8 hours of your {tonight ? '' : 'usual '}
              {timeLabel(bedtime)} bedtime. Late caffeine can cut into deep sleep.
            </p>
          )}
        </FieldBlock>
      )
    }

    case 'gym': {
      const gym = log?.gym ?? { kinds: [] }
      const trained = gymTrained(log?.gym)
      const set = (patch: Partial<NonNullable<DailyLog['gym']>>) =>
        onChange((current) => ({ ...current, gym: { kinds: [], ...current.gym, ...patch } }))
      const toggleKind = (kind: GymKind) =>
        set({
          rest: false,
          kinds: gym.kinds.includes(kind) ? gym.kinds.filter((item) => item !== kind) : [...gym.kinds, kind]
        })
      return (
        <FieldBlock field={field}>
          <div className="chip-row">
            {gymKinds.map((kind) => (
              <Chip key={kind.value} active={gym.kinds.includes(kind.value)} onClick={() => toggleKind(kind.value)}>
                {kind.label}
              </Chip>
            ))}
            <Chip
              active={Boolean(gym.rest)}
              onClick={() => set(gym.rest ? { rest: false } : { rest: true, kinds: [], time: undefined, minutes: undefined })}
            >
              Rest day
            </Chip>
          </div>
          {!gym.rest && (trained || gym.kinds.length > 0) && (
            <div className="log-times">
              <TimeField label="Time" value={gym.time} onChange={(time) => set({ time })} />
              <div className="log-duration">
                <small>Duration</small>
                <div className="chip-row">
                  {[30, 45, 60, 90].map((minutes) => (
                    <Chip
                      key={minutes}
                      active={gym.minutes === minutes}
                      onClick={() => set({ minutes: gym.minutes === minutes ? undefined : minutes })}
                    >
                      {durationLabel(minutes)}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}
        </FieldBlock>
      )
    }
  }
}

function Stepper({
  value,
  unit,
  step,
  onChange,
  label
}: {
  value: number | undefined
  unit?: string
  step: number
  onChange: (value: number | undefined) => void
  label: string
}) {
  return (
    <div className="log-stepper">
      <button type="button" onClick={() => onChange(Math.max(0, (value ?? 0) - step))} aria-label={`Less ${label}`}>
        <Minus size={13} />
      </button>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value ?? ''}
        placeholder="–"
        aria-label={label}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
      />
      {unit && <small>{unit}</small>}
      <button type="button" onClick={() => onChange((value ?? 0) + step)} aria-label={`More ${label}`}>
        <Plus size={13} />
      </button>
    </div>
  )
}

/* ───────────────────────── Customize ───────────────────────── */

function FieldEditor({
  config,
  goals,
  onConfig,
  onBack,
  onClose
}: {
  config: LogConfig
  goals: Goal[]
  onConfig: (config: LogConfig) => void
  onBack: () => void
  onClose: () => void
}) {
  const fields = config.fields
  const save = (next: Partial<LogConfig>) => onConfig({ ...config, ...next })
  const setFields = (next: LogField[]) => save({ fields: next })
  const patch = (id: string, value: Partial<LogField>) =>
    setFields(fields.map((field) => (field.id === id ? { ...field, ...value } : field)))
  const move = (index: number, delta: number) => {
    const next = [...fields]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    setFields(next)
  }
  const add = (field: Omit<LogField, 'id'> & { id?: string }) =>
    setFields([...fields, { ...field, id: field.id ?? createId(field.kind) }])
  const missingBuiltIns = (['sleep', 'caffeine', 'gym'] as const).filter(
    (kind) => !fields.some((field) => field.kind === kind)
  )
  const suggestions = fieldSuggestions.filter(
    (item) => !fields.some((field) => field.label.toLowerCase() === item.label.toLowerCase())
  )

  return (
    <div className="goal-form log-form">
      <header className="composer-head">
        <p className="eyebrow">Customize daily log</p>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </header>

      <section className="field-block">
        <span className="field-label">What you track</span>
        <AnimatePresence initial={false}>
          {fields.map((field, index) => (
            <motion.div
              key={field.id}
              layout
              className="log-edit-row"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={spring}
            >
              <div className="log-edit-main">
                <input
                  className="log-edit-emoji"
                  value={field.emoji}
                  onChange={(event) => patch(field.id, { emoji: lastGrapheme(event.target.value) || '•' })}
                  aria-label={`${field.label} icon`}
                />
                <input
                  className="log-edit-label"
                  value={field.label}
                  onChange={(event) => patch(field.id, { label: event.target.value })}
                  aria-label="Name"
                />
                {kindLabels[field.kind] !== field.label && <span className="log-kind">{kindLabels[field.kind]}</span>}
                <button
                  type="button"
                  className="icon-button subtle"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  className="icon-button subtle"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  type="button"
                  className="icon-button subtle"
                  onClick={() => setFields(fields.filter((item) => item.id !== field.id))}
                  aria-label={`Remove ${field.label}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {(field.kind === 'habit' || field.kind === 'gym') && goals.length > 0 && (
                <label className="log-edit-extra">
                  <small>Counts toward</small>
                  <select
                    value={field.goalId ?? ''}
                    onChange={(event) => patch(field.id, { goalId: event.target.value || undefined })}
                  >
                    <option value="">No goal</option>
                    {goals.map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.emoji} {goal.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {field.kind === 'number' && (
                <label className="log-edit-extra">
                  <small>Unit</small>
                  <input
                    value={field.unit ?? ''}
                    placeholder="e.g. glasses"
                    onChange={(event) => patch(field.id, { unit: event.target.value || undefined })}
                  />
                </label>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <p className="log-edit-hint">Removing something hides it. Past entries keep their data.</p>
      </section>

      <section className="field-block">
        <span className="field-label">Add</span>
        <div className="chip-row">
          <Chip onClick={() => add({ kind: 'habit', label: 'New habit', emoji: '✅' })}>
            <Plus size={12} /> Yes / no
          </Chip>
          <Chip onClick={() => add({ kind: 'score', label: 'New score', emoji: '📈' })}>
            <Plus size={12} /> 1–10 score
          </Chip>
          <Chip onClick={() => add({ kind: 'number', label: 'New number', emoji: '🔢' })}>
            <Plus size={12} /> Number
          </Chip>
          {missingBuiltIns.map((kind) => (
            <Chip key={kind} onClick={() => add(builtInFields[kind])}>
              <Plus size={12} /> {builtInFields[kind].emoji} {builtInFields[kind].label}
            </Chip>
          ))}
        </div>
        {suggestions.length > 0 && (
          <>
            <small className="log-sub">Ideas</small>
            <div className="chip-row">
              {suggestions.map((item) => (
                <Chip key={item.label} onClick={() => add(item)}>
                  <span>{item.emoji}</span> {item.label}
                </Chip>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="field-block">
        <div className="field-row">
          <span className="field-label">
            <Bell size={11} /> Nightly reminder
          </span>
          <Switch
            label="Nightly reminder"
            checked={config.reminderTime !== null}
            onChange={(on) => save({ reminderTime: on ? '21:30' : null })}
          />
        </div>
        {config.reminderTime !== null && (
          <TimeField
            label="Remind me at"
            value={config.reminderTime}
            onChange={(time) => time && save({ reminderTime: time })}
          />
        )}
        <p className="log-edit-hint">Only sent if that day’s log is still empty.</p>
      </section>

      <footer className="composer-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          Back to log
        </button>
        <motion.button type="button" className="primary-button" onClick={onClose} whileTap={{ scale: 0.97 }}>
          Done
        </motion.button>
      </footer>
    </div>
  )
}
