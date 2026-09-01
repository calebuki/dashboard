import { safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { DashboardState, Goal, SyncStatus, Task } from '../../src/types'
import { normalizeDashboardState } from '../../src/lib/state'

type ItemType = 'task' | 'goal' | 'settings'

interface DashboardItemRow {
  user_id: string
  item_type: ItemType
  item_id: string
  payload: Record<string, unknown>
  updated_at?: string
  deleted_at: string | null
}

interface SyncManagerOptions {
  userDataPath: string
  onStatus: (status: SyncStatus) => void
  onRemoteState: (state: DashboardState) => Promise<void>
}

function syncConfiguration(): { url: string; key: string } | null {
  const buildEnvironment = import.meta.env as unknown as Record<
    string,
    string | boolean | undefined
  >
  const url = String(
    buildEnvironment.MAIN_VITE_SUPABASE_URL ?? process.env.MAIN_VITE_SUPABASE_URL ?? ''
  ).trim()
  const key = String(
    buildEnvironment.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY ??
      process.env.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY ??
      ''
  ).trim()
  return url && key ? { url, key } : null
}

function itemKey(type: ItemType, id: string): string {
  return `${type}:${id}`
}

function taskFingerprint(task: Task): string {
  return [task.title.trim().toLowerCase(), task.category, task.recurrence?.kind ?? 'none'].join('|')
}

function goalFingerprint(goal: Goal): string {
  return goal.title.trim().toLowerCase()
}

function stateFingerprint(state: DashboardState): string {
  return JSON.stringify({
    tasks: state.tasks,
    goals: state.goals,
    settings: state.settings
  })
}

class EncryptedAuthStorage {
  private readonly filePath: string
  private operation = Promise.resolve()

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'dashboard-auth.bin')
  }

  private async readValues(): Promise<Record<string, string>> {
    if (!safeStorage.isEncryptionAvailable()) return {}
    try {
      const encrypted = await readFile(this.filePath)
      return JSON.parse(safeStorage.decryptString(encrypted)) as Record<string, string>
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Could not read encrypted sync session', error)
      }
      return {}
    }
  }

  private async writeValues(values: Record<string, string>): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable on this computer.')
    }
    await mkdir(join(this.filePath, '..'), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    await writeFile(temporaryPath, safeStorage.encryptString(JSON.stringify(values)))
    await rename(temporaryPath, this.filePath)
  }

  getItem(key: string): Promise<string | null> {
    return this.operation.then(async () => (await this.readValues())[key] ?? null)
  }

  setItem(key: string, value: string): Promise<void> {
    const run = this.operation.then(async () => {
      const values = await this.readValues()
      values[key] = value
      await this.writeValues(values)
    })
    this.operation = run.catch(() => undefined)
    return run
  }

  removeItem(key: string): Promise<void> {
    const run = this.operation.then(async () => {
      const values = await this.readValues()
      delete values[key]
      await this.writeValues(values)
    })
    this.operation = run.catch(() => undefined)
    return run
  }
}

export class DashboardSyncManager {
  private readonly options: SyncManagerOptions
  private client: SupabaseClient | null = null
  private channel: RealtimeChannel | null = null
  private status: SyncStatus = {
    configured: false,
    signedIn: false,
    phase: 'unavailable',
    message: 'Cloud sync needs to be configured for this build.'
  }
  private latestLocalState: DashboardState | null = null
  private lastSnapshot: DashboardState | null = null
  private lastPushedFingerprint = ''
  private pushTimer: NodeJS.Timeout | null = null
  private pullTimer: NodeJS.Timeout | null = null
  private syncOperation = Promise.resolve()

  constructor(options: SyncManagerOptions) {
    this.options = options
  }

  async initialize(): Promise<void> {
    const configuration = syncConfiguration()
    if (!configuration) {
      this.publishStatus(this.status)
      return
    }

    this.client = createClient(configuration.url, configuration.key, {
      auth: {
        storage: new EncryptedAuthStorage(this.options.userDataPath),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
    this.publishStatus({
      configured: true,
      signedIn: false,
      phase: 'signed-out'
    })

    this.client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (session) void this.connect(session.user.id, session.user.email)
        else this.disconnect()
      })
    })

    const { data, error } = await this.client.auth.getSession()
    if (error) {
      this.publishFailure(error)
      return
    }
    if (data.session) await this.connect(data.session.user.id, data.session.user.email)
  }

  setLocalState(state: DashboardState): void {
    this.latestLocalState = normalizeDashboardState(state)
    if (!this.status.signedIn) return
    if (!this.lastSnapshot) {
      void this.enqueue(() => this.pullRemote(true))
      return
    }
    if (stateFingerprint(this.latestLocalState) === this.lastPushedFingerprint) return
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(() => this.enqueue(() => this.pushState()), 500)
  }

  getStatus(): SyncStatus {
    return { ...this.status }
  }

  async requestCode(email: string): Promise<SyncStatus> {
    if (!this.client) return this.getStatus()
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return this.publishStatus({
        configured: true,
        signedIn: false,
        phase: 'error',
        message: 'Enter a valid email address.'
      })
    }
    this.publishStatus({ configured: true, signedIn: false, phase: 'syncing' })
    const { error } = await this.client.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: true }
    })
    if (error) return this.publishFailure(error)
    return this.publishStatus({
      configured: true,
      signedIn: false,
      phase: 'code-sent',
      email: normalizedEmail,
      message: 'Check your email for the six-digit code.'
    })
  }

  async verifyCode(email: string, code: string): Promise<SyncStatus> {
    if (!this.client) return this.getStatus()
    this.publishStatus({
      configured: true,
      signedIn: false,
      phase: 'syncing',
      email: email.trim().toLowerCase()
    })
    const { data, error } = await this.client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email'
    })
    if (error) return this.publishFailure(error)
    if (data.session) await this.connect(data.session.user.id, data.session.user.email)
    return this.getStatus()
  }

  async signOut(): Promise<SyncStatus> {
    if (!this.client) return this.getStatus()
    const { error } = await this.client.auth.signOut()
    if (error) return this.publishFailure(error)
    this.disconnect()
    return this.getStatus()
  }

  async syncNow(): Promise<SyncStatus> {
    if (!this.client || !this.status.signedIn) return this.getStatus()
    await this.enqueue(async () => {
      await this.pushState(true)
      await this.pullRemote()
    })
    return this.getStatus()
  }

  private async connect(userId: string, email?: string): Promise<void> {
    if (!this.client) return
    this.publishStatus({
      configured: true,
      signedIn: true,
      phase: 'syncing',
      email
    })
    if (this.channel) await this.client.removeChannel(this.channel)
    this.channel = this.client
      .channel(`dashboard:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dashboard_items',
          filter: `user_id=eq.${userId}`
        },
        () => {
          if (this.pullTimer) clearTimeout(this.pullTimer)
          this.pullTimer = setTimeout(() => this.enqueue(() => this.pullRemote()), 250)
        }
      )
      .subscribe()
    await this.enqueue(() => this.pullRemote(true))
  }

  private disconnect(): void {
    if (this.client && this.channel) void this.client.removeChannel(this.channel)
    this.channel = null
    this.lastSnapshot = null
    this.lastPushedFingerprint = ''
    this.publishStatus({
      configured: Boolean(this.client),
      signedIn: false,
      phase: 'signed-out'
    })
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const run = this.syncOperation.then(operation)
    this.syncOperation = run.catch((error) => {
      this.publishFailure(error)
    })
    return run.catch(() => undefined)
  }

  private async currentUserId(): Promise<string | null> {
    if (!this.client) return null
    const { data } = await this.client.auth.getSession()
    return data.session?.user.id ?? null
  }

  private rowsForState(state: DashboardState, userId: string): DashboardItemRow[] {
    return [
      ...state.tasks.map((task) => ({
        user_id: userId,
        item_type: 'task' as const,
        item_id: task.id,
        payload: task as unknown as Record<string, unknown>,
        deleted_at: null
      })),
      ...state.goals.map((goal) => ({
        user_id: userId,
        item_type: 'goal' as const,
        item_id: goal.id,
        payload: goal as unknown as Record<string, unknown>,
        deleted_at: null
      })),
      {
        user_id: userId,
        item_type: 'settings' as const,
        item_id: 'dashboard',
        payload: state.settings as unknown as Record<string, unknown>,
        deleted_at: null
      }
    ]
  }

  private async pushState(force = false): Promise<void> {
    if (!this.client || !this.latestLocalState) return
    const userId = await this.currentUserId()
    if (!userId) return
    const fingerprint = stateFingerprint(this.latestLocalState)
    if (!force && fingerprint === this.lastPushedFingerprint) return
    this.publishStatus({
      ...this.status,
      phase: 'syncing',
      message: undefined
    })

    const currentRows = this.rowsForState(this.latestLocalState, userId)
    const currentKeys = new Set(currentRows.map((row) => itemKey(row.item_type, row.item_id)))
    const previousRows = this.lastSnapshot ? this.rowsForState(this.lastSnapshot, userId) : []
    const deletedRows = previousRows
      .filter(
        (row) =>
          !currentKeys.has(itemKey(row.item_type, row.item_id)) && row.item_type !== 'settings'
      )
      .map((row) => ({
        ...row,
        payload: {},
        deleted_at: new Date().toISOString()
      }))

    const { error } = await this.client
      .from('dashboard_items')
      .upsert([...currentRows, ...deletedRows], {
        onConflict: 'user_id,item_type,item_id'
      })
    if (error) throw error
    this.lastSnapshot = this.latestLocalState
    this.lastPushedFingerprint = fingerprint
    this.publishStatus({
      ...this.status,
      phase: 'synced',
      message: undefined,
      lastSyncedAt: new Date().toISOString()
    })
  }

  private async pullRemote(uploadWhenEmpty = false): Promise<void> {
    if (!this.client || !this.latestLocalState) return
    const { data, error } = await this.client
      .from('dashboard_items')
      .select('user_id,item_type,item_id,payload,updated_at,deleted_at')
    if (error) throw error
    const rows = (data ?? []) as DashboardItemRow[]
    if (rows.length === 0) {
      if (uploadWhenEmpty) await this.pushState(true)
      return
    }

    const tombstones = new Set(
      rows.filter((row) => row.deleted_at).map((row) => itemKey(row.item_type, row.item_id))
    )
    const activeRows = rows.filter((row) => !row.deleted_at)
    const remoteTasks = activeRows
      .filter((row) => row.item_type === 'task')
      .map((row) => row.payload as unknown as Task)
    const remoteGoals = activeRows
      .filter((row) => row.item_type === 'goal')
      .map((row) => row.payload as unknown as Goal)
    const taskIds = new Set(remoteTasks.map((task) => task.id))
    const taskFingerprints = new Set(remoteTasks.map(taskFingerprint))
    const goalIds = new Set(remoteGoals.map((goal) => goal.id))
    const goalFingerprints = new Set(remoteGoals.map(goalFingerprint))

    const localOnlyTasks = this.latestLocalState.tasks.filter(
      (task) =>
        !taskIds.has(task.id) &&
        !tombstones.has(itemKey('task', task.id)) &&
        !taskFingerprints.has(taskFingerprint(task))
    )
    const localOnlyGoals = this.latestLocalState.goals.filter(
      (goal) =>
        !goalIds.has(goal.id) &&
        !tombstones.has(itemKey('goal', goal.id)) &&
        !goalFingerprints.has(goalFingerprint(goal))
    )
    const settingsRow = activeRows.find(
      (row) => row.item_type === 'settings' && row.item_id === 'dashboard'
    )
    const merged = normalizeDashboardState({
      ...this.latestLocalState,
      version: 2,
      tasks: [...remoteTasks, ...localOnlyTasks],
      goals: [...remoteGoals, ...localOnlyGoals],
      settings: settingsRow
        ? (settingsRow.payload as unknown as DashboardState['settings'])
        : this.latestLocalState.settings
    })

    this.latestLocalState = merged
    this.lastSnapshot = merged
    await this.options.onRemoteState(merged)
    await this.pushState(true)
  }

  private publishStatus(status: SyncStatus): SyncStatus {
    this.status = status
    this.options.onStatus(this.getStatus())
    return this.getStatus()
  }

  private publishFailure(error: unknown): SyncStatus {
    console.error('Dashboard sync failed', error)
    const message = error instanceof Error ? error.message : 'Cloud sync could not finish.'
    const offline = /fetch|network|offline|websocket/i.test(message)
    return this.publishStatus({
      ...this.status,
      phase: offline ? 'offline' : 'error',
      message: offline ? 'You are offline. Changes will sync when the connection returns.' : message
    })
  }
}
