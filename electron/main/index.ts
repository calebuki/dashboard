import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  Tray
} from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DashboardState, NotificationPayload } from '../../src/types'
import { normalizeDashboardState } from '../../src/lib/state'
import { DashboardSyncManager } from './sync'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let syncManager: DashboardSyncManager | null = null

const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)

if (isDevelopment) app.commandLine.appendSwitch('remote-debugging-port', '9222')

function statePath(): string {
  return join(app.getPath('userData'), 'dashboard-state.json')
}

async function loadState(): Promise<DashboardState | null> {
  try {
    const content = await readFile(statePath(), 'utf8')
    const state = normalizeDashboardState(JSON.parse(content) as DashboardState)
    syncManager?.setLocalState(state)
    return state
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') console.error('Could not load dashboard state', error)
    return null
  }
}

async function saveState(state: DashboardState): Promise<boolean> {
  const saved = await writeState(state)
  if (saved) syncManager?.setLocalState(state)
  return saved
}

async function writeState(state: DashboardState): Promise<boolean> {
  try {
    const filePath = statePath()
    const temporaryPath = `${filePath}.tmp`
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8')
    await rename(temporaryPath, filePath)
    return true
  } catch (error) {
    console.error('Could not save dashboard state', error)
    return false
  }
}

function buildTrayImage(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="9" fill="#d7ff64"/>
      <path d="M9 9h14v3H9zm0 6h10v3H9zm0 6h7v3H9z" fill="#151611"/>
    </svg>`
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const image = nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 })
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function showWindow(): void {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

function toggleWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
  else showWindow()
}

function createTray(): void {
  tray = new Tray(buildTrayImage())
  tray.setToolTip(
    process.platform === 'darwin' ? 'Dashboard — ⌘⇧Space' : 'Dashboard — Ctrl+Shift+Space'
  )
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Dashboard', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', showWindow)
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    width: 480,
    height: 840,
    minWidth: 410,
    minHeight: 620,
    show: false,
    frame: isMac,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 15, y: 17 }
        }
      : {}),
    transparent: false,
    backgroundColor: '#171814',
    alwaysOnTop: true,
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.setAlwaysOnTop(true, 'floating')
  mainWindow.setOpacity(0.88)

  if (isDevelopment) {
    mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error(`Preload failed at ${preloadPath}`, error)
    })
  }

  mainWindow.on('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) showWindow()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('dashboard:load-state', loadState)
  ipcMain.handle('dashboard:save-state', (_event, state: DashboardState) => saveState(state))
  ipcMain.handle('dashboard:set-always-on-top', (_event, enabled: boolean) => {
    mainWindow?.setAlwaysOnTop(Boolean(enabled), 'floating')
    return mainWindow?.isAlwaysOnTop() ?? false
  })
  ipcMain.handle('dashboard:set-opacity', (_event, opacity: number) => {
    const safeOpacity = Math.min(1, Math.max(0.4, Number(opacity) || 0.88))
    mainWindow?.setOpacity(safeOpacity)
    return safeOpacity
  })
  ipcMain.handle('dashboard:set-launch-at-login', (_event, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      args: ['--hidden']
    })
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle('dashboard:notify', (_event, payload: NotificationPayload) => {
    if (!Notification.isSupported()) return false
    new Notification({
      title: String(payload.title).slice(0, 80),
      body: String(payload.body).slice(0, 240),
      silent: false
    }).show()
    return true
  })
  ipcMain.handle(
    'dashboard:get-sync-status',
    () =>
      syncManager?.getStatus() ?? {
        configured: false,
        signedIn: false,
        phase: 'unavailable',
        message: 'Cloud sync needs to be configured for this build.'
      }
  )
  ipcMain.handle('dashboard:request-sync-code', (_event, email: string) =>
    syncManager?.requestCode(email)
  )
  ipcMain.handle('dashboard:verify-sync-code', (_event, email: string, code: string) =>
    syncManager?.verifyCode(email, code)
  )
  ipcMain.handle('dashboard:sign-out-sync', () => syncManager?.signOut())
  ipcMain.handle('dashboard:sync-now', () => syncManager?.syncNow())
  ipcMain.on('dashboard:minimize', () => mainWindow?.minimize())
  ipcMain.on('dashboard:hide', () => mainWindow?.hide())
  ipcMain.on('dashboard:quit', () => {
    isQuitting = true
    app.quit()
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.calebuki.dashboard')
  registerIpc()
  createWindow()
  createTray()
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Dashboard',
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            {
              label: 'Hide Dashboard',
              accelerator: 'Command+H',
              click: () => mainWindow?.hide()
            },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        { role: 'editMenu' },
        { role: 'windowMenu' }
      ])
    )
  }
  syncManager = new DashboardSyncManager({
    userDataPath: app.getPath('userData'),
    onStatus: (status) => mainWindow?.webContents.send('dashboard:sync-status', status),
    onRemoteState: async (state) => {
      await writeState(state)
      mainWindow?.webContents.send('dashboard:remote-state', state)
    }
  })
  void syncManager.initialize()
  globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow)

  app.on('activate', () => {
    if (!mainWindow) createWindow()
    else showWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep the tray process running; the explicit Quit action exits the app.
  }
})
