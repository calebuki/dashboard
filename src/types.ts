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

/**
 * One row of the end-of-day log. Habits are yes/no, scores are 1–10 (higher is always better),
 * numbers are free counts. Sleep, caffeine and gym are built-in sections with their own shape.
 */
export type LogFieldKind = 'habit' | 'score' | 'number' | 'sleep' | 'caffeine' | 'gym'

export interface LogField {
  id: string
  kind: LogFieldKind
  label: string
  emoji: string
  /** Habit and gym only: doing it also counts as a check-in for this goal. */
  goalId?: string
  /** Number only, e.g. "glasses". */
  unit?: string
}

export interface LogConfig {
  fields: LogField[]
  /** "HH:MM" for a nightly nudge to fill in the log, or null for none. */
  reminderTime: string | null
  updatedAt: string
}

export type GymKind = 'lift' | 'cardio' | 'sport' | 'mobility'

export interface SleepEntry {
  /** Bedtime the night before this day, "HH:MM". */
  bedtime?: string
  /** Wake time on this day, "HH:MM". */
  wake?: string
  /** 1–5 */
  quality?: number
}

export interface CaffeineEntry {
  mg: number
  /** Time of the last caffeine, "HH:MM". */
  lastAt?: string
}

export interface GymEntry {
  rest?: boolean
  kinds: GymKind[]
  time?: string
  minutes?: number
}

/** One day's log; `id` is the day's date key. */
export interface DailyLog {
  id: string
  checks: Record<string, boolean>
  scores: Record<string, number>
  numbers: Record<string, number>
  sleep?: SleepEntry
  caffeine?: CaffeineEntry
  gym?: GymEntry
  note: string
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
  logs: DailyLog[]
  logConfig: LogConfig
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
