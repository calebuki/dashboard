import { AnimatePresence, motion } from 'motion/react'
import { Ghost, Minus, Moon, Pin, PinOff, Sun, X } from 'lucide-react'
import type { SyncStatus } from '../types'
import { cn } from '@/lib/utils'

const syncText = (status: SyncStatus) =>
  status.phase === 'synced'
    ? 'Synced'
    : status.phase === 'syncing'
      ? 'Syncing'
      : status.phase === 'offline'
        ? 'Offline'
        : status.phase === 'error'
          ? 'Sync error'
          : status.signedIn
            ? 'Sync paused'
            : 'On this computer'

export function SyncState({ status }: { status: SyncStatus }) {
  const text = syncText(status)
  return (
    <span className={cn('sync-state', status.phase)} title={status.message ?? text}>
      <i aria-hidden />
      {text}
    </span>
  )
}

/** The wordmark: lowercase, with the full stop drawn as a station. */
export function Wordmark() {
  return (
    <span className="wordmark">
      dashboard
      <span aria-hidden className="wordmark-stop" />
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
      <Wordmark />
      <SyncState status={sync} />
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
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              {dark ? <Moon size={16} /> : <Sun size={16} />}
            </motion.span>
          </AnimatePresence>
        </button>
        <button
          type="button"
          aria-label="See-through mode"
          aria-pressed={ghost}
          title="See-through mode"
          className={ghost ? 'active' : ''}
          onClick={onGhost}
        >
          <Ghost size={16} />
        </button>
        <button
          type="button"
          aria-label="Keep on top"
          aria-pressed={pinned}
          title={pinned ? 'Kept on top' : 'Keep on top'}
          className={pinned ? 'active' : ''}
          onClick={onPin}
        >
          {pinned ? <Pin size={16} /> : <PinOff size={16} />}
        </button>
        {!mac && (
          <button type="button" aria-label="Minimize" title="Minimize" onClick={() => window.dashboard.minimize()}>
            <Minus size={16} />
          </button>
        )}
        {!mac && (
          <button
            type="button"
            className="close"
            aria-label="Hide to tray"
            title="Hide to tray"
            onClick={() => window.dashboard.hide()}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </header>
  )
}
