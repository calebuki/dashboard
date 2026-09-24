import { AnimatePresence, motion } from 'motion/react'
import {
  Cloud,
  CloudOff,
  Ghost,
  LoaderCircle,
  Minus,
  Moon,
  Pin,
  PinOff,
  Sun,
  WifiOff,
  X
} from 'lucide-react'
import type { SyncStatus } from '../types'
import { cn } from '@/lib/utils'

export function SyncPill({ status }: { status: SyncStatus }) {
  const Icon =
    status.phase === 'offline'
      ? WifiOff
      : status.phase === 'error' || status.phase === 'unavailable'
        ? CloudOff
        : status.phase === 'syncing'
          ? LoaderCircle
          : Cloud
  const text =
    status.phase === 'synced'
      ? 'Synced'
      : status.phase === 'syncing'
        ? 'Syncing'
        : status.phase === 'offline'
          ? 'Offline'
          : status.signedIn
            ? 'Issue'
            : 'Local'
  return (
    <span className={cn('sync-pill', status.phase)} title={status.message ?? text}>
      <Icon className={status.phase === 'syncing' ? 'spin' : ''} size={11} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function TitleBar({
  pinned,
  ghost,
  dark,
  sync,
  onPin,
  onGhost,
  onTheme
}: {
  pinned: boolean
  ghost: boolean
  dark: boolean
  sync: SyncStatus
  onPin: () => void
  onGhost: () => void
  onTheme: (origin: { x: number; y: number }) => void
}) {
  const mac = window.dashboard.platform === 'darwin'
  return (
    <header className="title-bar">
      <div className="brand-mark" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <b>Dashboard</b>
      <SyncPill status={sync} />
      <div className="window-actions">
        <button
          type="button"
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Light mode' : 'Dark mode'}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            onTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={dark ? 'moon' : 'sun'}
              className="icon-swap"
              initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            >
              {dark ? <Moon size={14} /> : <Sun size={14} />}
            </motion.span>
          </AnimatePresence>
        </button>
        <button
          type="button"
          aria-label="Toggle ghost mode"
          title="Ghost mode (see-through)"
          className={ghost ? 'active' : ''}
          onClick={onGhost}
        >
          <Ghost size={14} />
        </button>
        <button
          type="button"
          aria-label="Toggle always on top"
          title={pinned ? 'Pinned on top' : 'Not pinned'}
          className={pinned ? 'active' : ''}
          onClick={onPin}
        >
          {pinned ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
        {!mac && (
          <button type="button" aria-label="Minimize" onClick={() => window.dashboard.minimize()}>
            <Minus size={14} />
          </button>
        )}
        {!mac && (
          <button
            type="button"
            className="close"
            aria-label="Hide to tray"
            onClick={() => window.dashboard.hide()}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </header>
  )
}
