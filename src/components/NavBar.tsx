import { motion } from 'motion/react'
import { CalendarDays, Plus, Settings, Sun, Target } from 'lucide-react'
import { spring } from './primitives'
import { cn } from '@/lib/utils'

export type View = 'today' | 'calendar' | 'goals' | 'settings'

export const views: { value: View; label: string; icon: typeof Sun }[] = [
  { value: 'today', label: 'Today', icon: Sun },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays },
  { value: 'goals', label: 'Goals', icon: Target },
  { value: 'settings', label: 'Settings', icon: Settings }
]

export function NavBar({
  value,
  onChange,
  onAdd
}: {
  value: View
  onChange: (view: View) => void
  onAdd: () => void
}) {
  return (
    <div className="nav-dock">
      <nav className="nav" aria-label="Dashboard views">
        {views.map(({ value: item, label, icon: Icon }) => {
          const active = item === value
          return (
            <button
              type="button"
              key={item}
              className={cn(active && 'active')}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              onClick={() => onChange(item)}
            >
              {active && <motion.span className="nav-pill" layoutId="nav-pill" transition={spring} />}
              <Icon size={16} />
              <motion.small
                initial={false}
                animate={{ width: active ? 'auto' : 0, opacity: active ? 1 : 0 }}
                transition={spring}
              >
                {label}
              </motion.small>
            </button>
          )
        })}
      </nav>
      <motion.button
        type="button"
        className="nav-add"
        aria-label="New task"
        title="New task (N)"
        onClick={onAdd}
        whileHover={{ rotate: 90 }}
        whileTap={{ scale: 0.9 }}
        transition={spring}
      >
        <Plus size={20} />
      </motion.button>
    </div>
  )
}
