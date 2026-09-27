export type Category = 'personal' | 'work' | 'school'

export type RecurrenceKind = 'daily' | 'weekdays' | 'weekly'

export interface Recurrence {
  kind: RecurrenceKind
  days?: number[]
}

export interface Task {
  id: string
  title: string
  notes: string
  category: Category
  dueDate: string
  dueTime?: string
  estimateMinutes: number
  recurrence: Recurrence | null
  priority: 1 | 2 | 3
  goalId?: string
  /** Minutes before `dueTime` to send a reminder. `null`/missing means no timed reminder. */
  remindBefore?: number | null
  completed: boolean
  completedAt?: string
  completedDates: string[]
  rollover: boolean
  rolledOverFrom?: string
  rolloverCount: number
  createdAt: string
  updatedAt: string
}

export type GoalColor = 'lime' | 'sky' | 'violet' | 'coral' | 'amber' | 'mint'

/**
 * A goal is a simple weekly rhythm: "do this N times a week". Progress comes from
 * manual check-ins plus completions of any task linked to the goal.
 */
export interface Goal {
  id: string
  title: string
  emoji: string
  color: GoalColor
  weeklyTarget: number
  checkins: string[]
  createdAt: string
  updatedAt: string
}

export interface GoalDraft {
  title: string
  emoji: string
  color: GoalColor
  weeklyTarget: number
}

/**
 * A rich-text note. `html` is sanitized markup (see `sanitizeNoteHtml`); pasted images live
 * outside the note as `note-image://` files so the synced payload stays small.
 */
export interface Note {
  id: string
  title: string
  html: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface DashboardSettings {
  alwaysOnTop: boolean
  opacity: number
  overlayOpacity: number
  overlayMode: boolean
  launchAtLogin: boolean
  notifications: boolean
  theme: ThemePreference
}

export interface ActiveTimer {
  taskId: string
  durationSeconds: number
  endsAt: number
  pausedRemainingSeconds?: number
}

export interface DashboardState {
  version: 3
  tasks: Task[]
  goals: Goal[]
  notes: Note[]
  settings: DashboardSettings
  activeTimer: ActiveTimer | null
  sentTaskReminders: string[]
}

export interface TaskDraft {
  title: string
  notes: string
  category: Category
  dueDate: string
  dueTime: string
  estimateMinutes: number
  recurrence: RecurrenceKind | 'none'
  priority: 1 | 2 | 3
  goalId?: string
  remindBefore: number | null
}

export interface NotificationPayload {
  title: string
  body: string
}

export type SyncPhase =
  'unavailable' | 'signed-out' | 'code-sent' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncStatus {
  configured: boolean
  signedIn: boolean
  phase: SyncPhase
  email?: string
  message?: string
  lastSyncedAt?: string
}

export interface DashboardBridge {
  platform: 'darwin' | 'win32' | 'linux'
  loadState: () => Promise<DashboardState | null>
  saveState: (state: DashboardState) => Promise<boolean>
  setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
  setOpacity: (opacity: number) => Promise<number>
  setLaunchAtLogin: (enabled: boolean) => Promise<boolean>
  setTheme: (theme: ThemePreference) => Promise<'light' | 'dark'>
  notify: (payload: NotificationPayload) => Promise<boolean>
  /** Stores an image on this computer and returns the `note-image://` URL to embed. */
  saveNoteImage: (data: ArrayBuffer, type: string) => Promise<string>
  getSyncStatus: () => Promise<SyncStatus>
  requestSyncCode: (email: string) => Promise<SyncStatus>
  verifySyncCode: (email: string, code: string) => Promise<SyncStatus>
  signOutSync: () => Promise<SyncStatus>
  syncNow: () => Promise<SyncStatus>
  onSyncStatus: (listener: (status: SyncStatus) => void) => () => void
  onRemoteState: (listener: (state: DashboardState) => void) => () => void
  minimize: () => void
  hide: () => void
  quit: () => void
}
