import type { CSSProperties } from 'react'
import { motion } from 'motion/react'
import { Check, Pause, Play, Plus, X } from 'lucide-react'
import type { Task } from '../types'
import { countdown } from '../lib/format'
import { arrive } from './primitives'

export function FocusTimer({
  task,
  seconds,
  total,
  paused,
  onPause,
  onExtend,
  onComplete,
  onClose
}: {
  task: Task
  seconds: number
  total: number
  paused: boolean
  onPause: () => void
  onExtend: () => void
  onComplete: () => void
  onClose: () => void
}) {
  // The train runs from the start of the line toward the end as time passes.
  const elapsed = total ? Math.min(1, Math.max(0, 1 - seconds / total)) : 0
  return (
    <motion.aside
      className={`focus-timer ${paused ? 'paused' : ''}`}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0, transition: { duration: 0.16 } }}
      transition={arrive}
      aria-label="Focus timer"
    >
      <div className="focus-row">
        <button
          type="button"
          className="focus-play"
          onClick={onPause}
          aria-label={paused ? 'Resume timer' : 'Pause timer'}
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <p>
          <small>{paused ? 'Paused' : 'Focusing'}</small>
          <strong>{task.title}</strong>
        </p>
        <time className="tabular">{countdown(seconds)}</time>
        <button type="button" onClick={onExtend} aria-label="Add 5 minutes" title="Add 5 minutes">
          <Plus size={16} />
        </button>
        <button type="button" className="done" onClick={onComplete} aria-label="Mark done" title="Mark done">
          <Check size={17} strokeWidth={2.6} />
        </button>
        <button type="button" onClick={onClose} aria-label="Stop timer" title="Stop">
          <X size={16} />
        </button>
      </div>
      <div className="focus-line" style={{ '--elapsed': elapsed } as CSSProperties} aria-hidden>
        <span />
        <i />
      </div>
    </motion.aside>
  )
}
