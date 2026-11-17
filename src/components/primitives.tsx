import { useEffect, useId, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const
/** Matches --ease-out in styles.css: for anything responding to the person. */
export const easeOut = [0.23, 1, 0.32, 1] as const
export const arrive = { duration: 0.24, ease: easeOut } as const

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  label
}: {
  options: { value: T; label: ReactNode; className?: string; title?: string }[]
  value: T
  onChange: (value: T, event: MouseEvent<HTMLButtonElement>) => void
  className?: string
  size?: 'sm' | 'md'
  label?: string
}) {
  const id = useId()
  return (
    <div className={cn('segmented', size, className)} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            key={String(option.value)}
            className={cn(option.className, active && 'active')}
            onClick={(event) => onChange(option.value, event)}
          >
            {active && (
              <motion.span className="segmented-pill" layoutId={`seg-${id}`} transition={spring} />
            )}
            <span className="segmented-label">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      className={cn('switch', checked && 'on')}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <motion.i layout transition={spring} />
    </button>
  )
}

export function Chip({
  active,
  onClick,
  children,
  className,
  title
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      className={cn('chip', active && 'active', className)}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * A run of stations on one line: the first `filled` light up and the line joins them.
 * Long runs collapse into a plain track so the stations never crowd.
 */
export function StationLine({
  total,
  filled,
  color,
  label,
  className
}: {
  total: number
  filled: number
  color: string
  label: string
  className?: string
}) {
  const count = Math.max(0, total)
  const lit = Math.min(count, Math.max(0, filled))
  const crowded = count > 16
  const reach = crowded ? (count ? lit / count : 0) : count > 1 && lit > 1 ? (lit - 1) / (count - 1) : 0
  return (
    <div
      className={cn('station-line', crowded && 'crowded', className)}
      style={{ '--route': color, '--count': count, '--span': Math.max(1, count - 1) } as CSSProperties}
      role="img"
      aria-label={label}
    >
      <span className="station-track">
        <i style={{ transform: `scaleX(${reach})` }} />
      </span>
      {!crowded &&
        Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={cn('station', index < lit && 'on')}
            style={{ '--i': index } as CSSProperties}
          />
        ))}
    </div>
  )
}

export interface Stop {
  key: string
  on: boolean
  label: ReactNode
  ariaLabel: string
  current?: boolean
  dim?: boolean
  disabled?: boolean
  title?: string
}

/** Clickable stations on a line, one per day. Neighbouring lit stations are joined. */
export function StopLine({
  stops,
  color,
  label,
  onSelect,
  className
}: {
  stops: Stop[]
  color: string
  label: string
  onSelect: (key: string) => void
  className?: string
}) {
  return (
    <div className={cn('stop-line', className)} style={{ '--route': color } as CSSProperties} role="group" aria-label={label}>
      {stops.map((stop, index) => (
        <button
          type="button"
          key={stop.key}
          disabled={stop.disabled}
          title={stop.title}
          aria-label={stop.ariaLabel}
          aria-pressed={stop.on}
          className={cn(
            'stop',
            stop.on && 'on',
            stop.current && 'current',
            stop.dim && 'dim',
            stop.on && stops[index - 1]?.on && 'join-prev',
            stop.on && stops[index + 1]?.on && 'join-next'
          )}
          onClick={() => onSelect(stop.key)}
        >
          <i />
          <small>{stop.label}</small>
        </button>
      ))}
    </div>
  )
}

export function Sheet({
  open,
  onClose,
  children,
  className,
  label
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  label: string
}) {
  const controls = useDragControls()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose()
  }
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={cn('sheet', className)}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { duration: 0.18, ease: 'easeIn' } }}
            transition={{ duration: 0.34, ease: easeOut }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            <div className="sheet-handle" onPointerDown={(event) => controls.start(event)}>
              <i />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Title row for a sheet: what it is, and a way out. */
export function SheetHead({ title, onClose, children }: { title: ReactNode; onClose: () => void; children?: ReactNode }) {
  return (
    <header className="sheet-head">
      <h2>{title}</h2>
      {children}
      <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close">
        <X size={17} />
      </button>
    </header>
  )
}

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="collapsible"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: easeOut }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A quiet line of text for when a list has nothing in it. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="empty-note">{children}</p>
}
