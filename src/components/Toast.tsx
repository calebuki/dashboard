import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { arrive } from './primitives'

export interface ToastMessage {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const TOAST_MS = 5000

export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(onDismiss, TOAST_MS)
    return () => clearTimeout(id)
  }, [toast, onDismiss])

  return (
    <div className="toast-layer" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            className="toast"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0, transition: { duration: 0.14 } }}
            transition={arrive}
          >
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run()
                  onDismiss()
                }}
              >
                {toast.action.label}
              </button>
            )}
            <motion.i
              className="toast-timer"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: TOAST_MS / 1000, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
