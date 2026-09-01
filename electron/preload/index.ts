import { contextBridge, ipcRenderer } from 'electron'
import type { DashboardBridge, DashboardState, NotificationPayload } from '../../src/types'

const bridge: DashboardBridge = {
  platform: process.platform as DashboardBridge['platform'],
  loadState: () => ipcRenderer.invoke('dashboard:load-state') as Promise<DashboardState | null>,
  saveState: (state) => ipcRenderer.invoke('dashboard:save-state', state) as Promise<boolean>,
  setAlwaysOnTop: (enabled) =>
    ipcRenderer.invoke('dashboard:set-always-on-top', enabled) as Promise<boolean>,
  setOpacity: (opacity) => ipcRenderer.invoke('dashboard:set-opacity', opacity) as Promise<number>,
  setLaunchAtLogin: (enabled) =>
    ipcRenderer.invoke('dashboard:set-launch-at-login', enabled) as Promise<boolean>,
  notify: (payload: NotificationPayload) =>
    ipcRenderer.invoke('dashboard:notify', payload) as Promise<boolean>,
  getSyncStatus: () =>
    ipcRenderer.invoke('dashboard:get-sync-status') as ReturnType<DashboardBridge['getSyncStatus']>,
  requestSyncCode: (email) =>
    ipcRenderer.invoke('dashboard:request-sync-code', email) as ReturnType<
      DashboardBridge['requestSyncCode']
    >,
  verifySyncCode: (email, code) =>
    ipcRenderer.invoke('dashboard:verify-sync-code', email, code) as ReturnType<
      DashboardBridge['verifySyncCode']
    >,
  signOutSync: () =>
    ipcRenderer.invoke('dashboard:sign-out-sync') as ReturnType<DashboardBridge['signOutSync']>,
  syncNow: () => ipcRenderer.invoke('dashboard:sync-now') as ReturnType<DashboardBridge['syncNow']>,
  onSyncStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]) =>
      listener(status)
    ipcRenderer.on('dashboard:sync-status', handler)
    return () => ipcRenderer.removeListener('dashboard:sync-status', handler)
  },
  onRemoteState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: DashboardState) => listener(state)
    ipcRenderer.on('dashboard:remote-state', handler)
    return () => ipcRenderer.removeListener('dashboard:remote-state', handler)
  },
  minimize: () => ipcRenderer.send('dashboard:minimize'),
  hide: () => ipcRenderer.send('dashboard:hide'),
  quit: () => ipcRenderer.send('dashboard:quit')
}

contextBridge.exposeInMainWorld('dashboard', bridge)
