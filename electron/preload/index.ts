import { contextBridge, ipcRenderer } from 'electron'
import type { DashboardBridge, DashboardState, NotificationPayload } from '../../src/types'

const bridge: DashboardBridge = {
  loadState: () => ipcRenderer.invoke('dashboard:load-state') as Promise<DashboardState | null>,
  saveState: (state) => ipcRenderer.invoke('dashboard:save-state', state) as Promise<boolean>,
  setAlwaysOnTop: (enabled) =>
    ipcRenderer.invoke('dashboard:set-always-on-top', enabled) as Promise<boolean>,
  setOpacity: (opacity) => ipcRenderer.invoke('dashboard:set-opacity', opacity) as Promise<number>,
  setLaunchAtLogin: (enabled) =>
    ipcRenderer.invoke('dashboard:set-launch-at-login', enabled) as Promise<boolean>,
  notify: (payload: NotificationPayload) =>
    ipcRenderer.invoke('dashboard:notify', payload) as Promise<boolean>,
  minimize: () => ipcRenderer.send('dashboard:minimize'),
  hide: () => ipcRenderer.send('dashboard:hide'),
  quit: () => ipcRenderer.send('dashboard:quit')
}

contextBridge.exposeInMainWorld('dashboard', bridge)
