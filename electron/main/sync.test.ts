import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardState, Task } from '../../src/types'
import { createInitialState } from '../../src/lib/state'

interface Row {
  user_id: string
  item_type: string
  item_id: string
  payload: Record<string, unknown>
  deleted_at: string | null
}

// Postgres jsonb does not keep key order; mimic that so fingerprints are exercised.
const shuffleKeys = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).reverse())

const server = {
  rows: new Map<string, Row>(),
  upserts: 0,
  realtime: null as null | (() => void)
}

vi.mock('electron', () => ({
  safeStorage: { isEncryptionAvailable: () => false }
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({
        data: { session: { user: { id: 'user-1', email: 'me@example.com' } } },
        error: null
      })
    },
    from: () => ({
      select: async () => ({
        data: [...server.rows.values()].map((row) => ({ ...row, payload: shuffleKeys(row.payload) })),
        error: null
      }),
      upsert: async (rows: Row[]) => {
        server.upserts += 1
        rows.forEach((row) =>
          server.rows.set(`${row.item_type}:${row.item_id}`, JSON.parse(JSON.stringify(row)))
        )
        // Realtime echoes every write back to the writer.
        setTimeout(() => server.realtime?.(), 0)
        return { error: null }
      }
    }),
    channel: () => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: () => void) => {
          server.realtime = callback
          return channel
        },
        subscribe: () => channel
      }
      return channel
    },
    removeChannel: async () => {}
  })
}))

process.env.MAIN_VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'

const { DashboardSyncManager } = await import('./sync')

const settle = () => new Promise((resolve) => setTimeout(resolve, 1200))

async function connectedManager(initial: DashboardState) {
  const remoteStates: DashboardState[] = []
  const manager = new DashboardSyncManager({
    userDataPath: '/tmp/dashboard-test',
    onStatus: () => {},
    onRemoteState: async (state) => {
      remoteStates.push(state)
    }
  })
  manager.setLocalState(initial)
  await manager.initialize()
  await settle()
  return { manager, remoteStates }
}

const edit = (state: DashboardState, patch: Partial<Task>, index = 0): DashboardState => ({
  ...state,
  tasks: state.tasks.map((task, i) =>
    i === index ? { ...task, ...patch, updatedAt: new Date(Date.now() + 1000).toISOString() } : task
  )
})

describe('DashboardSyncManager', () => {
  beforeEach(() => {
    server.rows.clear()
    server.upserts = 0
    server.realtime = null
  })

  it('does not loop on its own realtime echoes or revert a local edit', async () => {
    const initial = createInitialState()
    const { manager, remoteStates } = await connectedManager(initial)
    const uploadsAfterConnect = server.upserts

    const edited = edit(initial, { title: 'Renamed locally' })
    manager.setLocalState(edited)
    await settle()

    expect(server.upserts).toBe(uploadsAfterConnect + 1)
    expect(remoteStates).toHaveLength(0)
    expect(manager.getStatus().phase).toBe('synced')

    const upsertsBefore = server.upserts
    await settle()
    expect(server.upserts).toBe(upsertsBefore)
  })

  it('keeps an unsent local edit and deletion when a pull arrives first', async () => {
    const initial = createInitialState()
    const { manager, remoteStates } = await connectedManager(initial)

    const deletedId = initial.tasks[1].id
    const local = {
      ...edit(initial, { title: 'Fresh local title' }),
      tasks: edit(initial, { title: 'Fresh local title' }).tasks.filter((t) => t.id !== deletedId)
    }
    manager.setLocalState(local)
    // A realtime event lands before the debounced upload runs.
    server.realtime?.()
    await settle()

    const titles = [...server.rows.values()]
      .filter((row) => row.item_type === 'task' && !row.deleted_at)
      .map((row) => row.payload.title)
    expect(titles).toContain('Fresh local title')
    expect(server.rows.get(`task:${deletedId}`)?.deleted_at).toBeTruthy()
    expect(remoteStates.every((state) => !state.tasks.some((t) => t.id === deletedId))).toBe(true)
  })

  it('applies a newer change made on another computer', async () => {
    const initial = createInitialState()
    const { remoteStates } = await connectedManager(initial)

    const key = `task:${initial.tasks[0].id}`
    const row = server.rows.get(key)!
    server.rows.set(key, {
      ...row,
      payload: { ...row.payload, title: 'From laptop', updatedAt: new Date(Date.now() + 5000).toISOString() }
    })
    server.realtime?.()
    await settle()

    expect(remoteStates.at(-1)?.tasks[0].title).toBe('From laptop')
  })
})
