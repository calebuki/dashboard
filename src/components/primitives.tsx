import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo
} from 'motion/react'
import { cn } from '@/lib/utils'

export const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const

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
    <motion.button
      type="button"
      title={title}
      className={cn('chip', active && 'active', className)}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={spring}
    >
      {children}
    </motion.button>
  )
}

/** Digits roll vertically when the value changes. */
export function RollingNumber({ value, className }: { value: number | string; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <span className={cn('rolling-number', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={reduce ? false : { y: '70%', opacity: 0, filter: 'blur(3px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={reduce ? undefined : { y: '-70%', opacity: 0, filter: 'blur(3px)' }}
          transition={spring}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  className,
  children
}: {
  value: number
  size?: number
  stroke?: number
  className?: string
  children?: ReactNode
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(1, Math.max(0, value))
  return (
    <div className={cn('progress-ring', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <motion.circle
          className="fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={softSpring}
        />
      </svg>
      {children && <div className="progress-ring-content">{children}</div>}
    </div>
  )
}

/** A small radial burst of dots, used when something gets completed. */
export function Burst({ show, color = 'var(--accent)' }: { show: boolean; color?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <AnimatePresence>
      {show && (
        <span className="burst" aria-hidden>
          {Array.from({ length: 8 }, (_, index) => {
            const angle = (index / 8) * Math.PI * 2
            return (
              <motion.i
                key={index}
                style={{ background: color }}
                initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                animate={{
                  x: Math.cos(angle) * 18,
                  y: Math.sin(angle) * 18,
                  scale: 0,
                  opacity: 0
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.3, 1] }}
              />
            )
          })}
        </span>
      )}
    </AnimatePresence>
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
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
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

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="collapsible"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={softSpring}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
