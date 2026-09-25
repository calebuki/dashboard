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

/** Key-order-independent JSON, since Postgres jsonb does not preserve key order. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>)
            .filter(([, entry]) => entry !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : item
  )
}

function stateFingerprint(state: DashboardState): string {
  return canonical({
    tasks: state.tasks,
    goals: state.goals,
    settings: state.settings
  })
}

/** Last writer wins, using each item's own `updatedAt`. */
function newer<T extends { updatedAt: string }>(local: T, remote: T): T {
  return (local.updatedAt ?? '') > (remote.updatedAt ?? '') ? local : remote
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
  private connectedUserId: string | null = null

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
        // Token refreshes also land here; only (re)connect for a new account.
        if (session && session.user.id !== this.connectedUserId)
          void this.connect(session.user.id, session.user.email)
        else if (!session && this.connectedUserId) this.disconnect()
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
    if (!this.client || this.connectedUserId === userId) return
    this.connectedUserId = userId
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
    this.connectedUserId = null
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
    const state = this.latestLocalState
    const fingerprint = stateFingerprint(state)
    if (!force && fingerprint === this.lastPushedFingerprint) return

    // lastSnapshot mirrors what the server holds, so only differences are sent.
    const currentRows = this.rowsForState(state, userId)
    const previousRows = this.lastSnapshot ? this.rowsForState(this.lastSnapshot, userId) : []
    const previous = new Map(
      previousRows.map((row) => [itemKey(row.item_type, row.item_id), canonical(row.payload)])
    )
    const currentKeys = new Set(currentRows.map((row) => itemKey(row.item_type, row.item_id)))
    const changedRows = currentRows.filter(
      (row) => previous.get(itemKey(row.item_type, row.item_id)) !== canonical(row.payload)
    )
    const deletedRows = previousRows
      .filter(
        (row) =>
          !currentKeys.has(itemKey(row.item_type, row.item_id)) && row.item_type !== 'settings'
      )
      .map((row) => ({ ...row, payload: {}, deleted_at: new Date().toISOString() }))

    const rows = [...changedRows, ...deletedRows]
    if (rows.length) {
      this.publishStatus({ ...this.status, phase: 'syncing', message: undefined })
      const { error } = await this.client
        .from('dashboard_items')
        .upsert(rows, { onConflict: 'user_id,item_type,item_id' })
      if (error) throw error
    }
    this.lastSnapshot = state
    this.lastPushedFingerprint = fingerprint
    this.publishSynced()
  }

  private publishSynced(): void {
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
      else this.publishSynced()
      return
    }

    const local = this.latestLocalState
    const serverBefore = this.lastSnapshot
    const firstMerge = !serverBefore
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
    const settingsRow = activeRows.find(
      (row) => row.item_type === 'settings' && row.item_id === 'dashboard'
    )
    const remoteSettings = settingsRow
      ? (settingsRow.payload as unknown as DashboardState['settings'])
      : local.settings

    const mergeItems = <T extends Task | Goal>(
      type: 'task' | 'goal',
      localItems: T[],
      remoteItems: T[],
      previousServerItems: T[],
      fingerprint: (item: T) => string
    ): T[] => {
      const localById = new Map(localItems.map((item) => [item.id, item]))
      // Gone locally but on the server last time: deleted here, not uploaded yet.
      const pendingDeletes = new Set(
        previousServerItems.map((item) => item.id).filter((id) => !localById.has(id))
      )
      const remoteIds = new Set(remoteItems.map((item) => item.id))
      const remoteFingerprints = new Set(remoteItems.map(fingerprint))
      const merged = remoteItems
        .filter((item) => !pendingDeletes.has(item.id))
        .map((item) => {
          const mine = localById.get(item.id)
          return mine ? newer(mine, item) : item
        })
      for (const item of localItems) {
        if (remoteIds.has(item.id) || tombstones.has(itemKey(type, item.id))) continue
        // On the very first merge, skip local copies of items another computer already uploaded.
        if (firstMerge && remoteFingerprints.has(fingerprint(item))) continue
        merged.push(item)
      }
      return merged
    }

    const localSettingsChanged =
      serverBefore !== null && canonical(local.settings) !== canonical(serverBefore.settings)
    const merged = normalizeDashboardState({
      ...local,
      version: 3,
      tasks: mergeItems('task', local.tasks, remoteTasks, serverBefore?.tasks ?? [], taskFingerprint),
      goals: mergeItems('goal', local.goals, remoteGoals, serverBefore?.goals ?? [], goalFingerprint),
      settings: localSettingsChanged ? local.settings : remoteSettings
    })

    this.lastSnapshot = normalizeDashboardState({
      ...local,
      version: 3,
      tasks: remoteTasks,
      goals: remoteGoals,
      settings: remoteSettings
    })
    this.lastPushedFingerprint = stateFingerprint(this.lastSnapshot)

    // Our own uploads echo back through realtime; only touch the app on real changes.
    if (stateFingerprint(merged) !== stateFingerprint(local)) {
      this.latestLocalState = merged
      await this.options.onRemoteState(merged)
    }
    await this.pushState()
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
