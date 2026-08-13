import type { DashboardBridge } from './types'

declare global {
  interface Window {
    dashboard: DashboardBridge
  }
}

export {}
