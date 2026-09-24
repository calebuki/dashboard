import { motion } from 'motion/react'
import { Check, Pause, Play, Plus, X } from 'lucide-react'
import type { Task } from '../types'
import { countdown } from '../lib/format'
import { ProgressRing, spring } from './primitives'

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
  return (
    <motion.aside
      className={`focus-timer ${paused ? 'paused' : ''}`}
      initial={{ y: 40, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.96 }}
      transition={spring}
    >
      <ProgressRing value={total ? seconds / total : 0} size={40} stroke={3.5}>
        <button
          type="button"
          className="focus-play"
          onClick={onPause}
          aria-label={paused ? 'Resume timer' : 'Pause timer'}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </ProgressRing>
      <p>
        <small>{paused ? 'Paused' : 'Focusing'}</small>
        <strong>{task.title}</strong>
      </p>
      <time>{countdown(seconds)}</time>
      <button type="button" onClick={onExtend} aria-label="Add 5 minutes" title="+5 min">
        <Plus size={13} />
      </button>
      <button type="button" className="done" onClick={onComplete} aria-label="Mark done" title="Done">
        <Check size={14} />
      </button>
      <button type="button" onClick={onClose} aria-label="Stop timer" title="Stop">
        <X size={13} />
      </button>
    </motion.aside>
  )
}
