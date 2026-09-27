import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardState, Note, Task } from '../../src/types'
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
  images: new Map<string, Uint8Array<ArrayBuffer>>(),
  log: [] as string[],
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
        rows.forEach((row) => server.log.push(`row:${row.item_type}`))
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
    removeChannel: async () => {},
    storage: {
      from: () => ({
        list: async (folder: string) => ({
          data: [...server.images.keys()]
            .filter((path) => path.startsWith(`${folder}/`))
            .map((path) => ({ name: path.slice(folder.length + 1) })),
          error: null
        }),
        upload: async (path: string, data: Uint8Array) => {
          server.log.push(`image:${path}`)
          server.images.set(path, new Uint8Array(data))
          return { error: null }
        },
        download: async (path: string) => {
          const data = server.images.get(path)
          return data ? { data: new Blob([data]), error: null } : { data: null, error: new Error('Not found') }
        }
      })
    }
  })
}))

process.env.MAIN_VITE_SUPABASE_URL = 'https://example.supabase.co'
process.env.MAIN_VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'

const { DashboardSyncManager } = await import('./sync')

const settle = () => new Promise((resolve) => setTimeout(resolve, 1200))

async function connectedManager(initial: DashboardState, userDataPath = '/tmp/dashboard-test') {
  const remoteStates: DashboardState[] = []
  const manager = new DashboardSyncManager({
    userDataPath,
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
    server.images.clear()
    server.log = []
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

  it('syncs notes and their images to another computer', async () => {
    const file = '3f2c1a9e-8b7d-4c6e-9f10-2a3b4c5d6e7f.webp'
    const laptop = await mkdtemp(join(tmpdir(), 'dashboard-laptop-'))
    const desktop = await mkdtemp(join(tmpdir(), 'dashboard-desktop-'))
    await mkdir(join(laptop, 'note-images'))
    await writeFile(join(laptop, 'note-images', file), 'image-bytes')

    const now = new Date().toISOString()
    const note: Note = {
      id: 'note-1',
      title: 'Trip',
      html: `<p>Map</p><img src="note-image://local/${file}" alt="">`,
      pinned: false,
      createdAt: now,
      updatedAt: now
    }
    await connectedManager({ ...createInitialState(), notes: [note] }, laptop)

    // The image lands before the note that shows it.
    expect(server.log.indexOf(`image:user-1/${file}`)).toBeGreaterThanOrEqual(0)
    expect(server.log.indexOf(`image:user-1/${file}`)).toBeLessThan(server.log.indexOf('row:note'))

    const { manager, remoteStates } = await connectedManager(createInitialState(), desktop)
    expect(remoteStates.at(-1)?.notes.map((n) => n.title)).toEqual(['Trip'])
    expect(await manager.ensureImage(file)).toBe(true)
    expect(await readFile(join(desktop, 'note-images', file), 'utf8')).toBe('image-bytes')
    expect(await manager.ensureImage('../dashboard-state.json')).toBe(false)
  })
})
