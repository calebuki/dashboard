import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface GooeyNavItem<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export function GooeyNav<T extends string>({
  items,
  value,
  onChange,
  className
}: {
  items: GooeyNavItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <nav className={cn('gooey-nav', className)} aria-label="Dashboard views">
      {items.map((item) => {
        const active = item.value === value
        return (
          <motion.button
            type="button"
            key={item.value}
            className={active ? 'active' : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(item.value)}
            layout={!reduceMotion}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          >
            {active && (
              <motion.span
                className="gooey-nav-active"
                layoutId="gooey-nav-active"
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              />
            )}
            <span className="gooey-nav-content">
              {item.icon}
              <small>{item.label}</small>
            </span>
          </motion.button>
        )
      })}
    </nav>
  )
}
