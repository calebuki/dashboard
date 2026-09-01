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
  completed: boolean
  completedAt?: string
  completedDates: string[]
  rollover: boolean
  rolledOverFrom?: string
  rolloverCount: number
  createdAt: string
  updatedAt: string
}

export interface GoalPhase {
  title: string
  range: string
  outcome: string
}

export interface Goal {
  id: string
  title: string
  target: string
  startDate: string
  targetDate: string
  color: string
  phases: GoalPhase[]
  updatedAt: string
}

export interface DashboardSettings {
  alwaysOnTop: boolean
  opacity: number
  overlayOpacity: number
  overlayMode: boolean
  launchAtLogin: boolean
  notifications: boolean
}

export interface ActiveTimer {
  taskId: string
  durationSeconds: number
  endsAt: number
  pausedRemainingSeconds?: number
}

export interface DashboardState {
  version: 2
  tasks: Task[]
  goals: Goal[]
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
  notify: (payload: NotificationPayload) => Promise<boolean>
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
