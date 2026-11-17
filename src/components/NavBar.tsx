import { motion } from 'motion/react'
import { CalendarDays, NotebookPen, Plus, Settings, Sun, Target } from 'lucide-react'
import { easeOut, spring } from './primitives'
import { cn } from '@/lib/utils'

export type View = 'today' | 'calendar' | 'goals' | 'notes' | 'settings'

export const views: { value: View; label: string; icon: typeof Sun }[] = [
  { value: 'today', label: 'Today', icon: Sun },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'goals', label: 'Goals', icon: Target },
  { value: 'notes', label: 'Notes', icon: NotebookPen },
  { value: 'settings', label: 'Settings', icon: Settings }
]

export function NavBar({
  value,
  onChange,
  onAdd,
  addLabel = 'New task'
}: {
  value: View
  onChange: (view: View) => void
  onAdd: () => void
  addLabel?: string
}) {
  return (
    <div className="nav-dock">
      <nav className="nav" aria-label="Dashboard views">
        {views.map(({ value: item, label, icon: Icon }, index) => {
          const active = item === value
          return (
            <button
              type="button"
              key={item}
              className={cn(active && 'active')}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              title={`${label} (${index + 1})`}
              onClick={() => onChange(item)}
            >
              {active && <motion.span className="nav-pill" layoutId="nav-pill" transition={spring} />}
              <Icon size={17} />
              <motion.small
                initial={false}
                animate={{ width: active ? 'auto' : 0, opacity: active ? 1 : 0 }}
                transition={{ duration: 0.24, ease: easeOut }}
              >
                {label}
              </motion.small>
            </button>
          )
        })}
      </nav>
      <button type="button" className="nav-add" aria-label={addLabel} title={`${addLabel} (N)`} onClick={onAdd}>
        <Plus size={22} strokeWidth={2.4} />
      </button>
    </div>
  )
}
