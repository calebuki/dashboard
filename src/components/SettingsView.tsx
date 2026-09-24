import { useState, type ReactNode } from 'react'
import {
  Bell,
  Blend,
  CircleAlert,
  Cloud,
  Keyboard,
  Monitor,
  Moon,
  Pin,
  Power,
  RefreshCw,
  Sun
} from 'lucide-react'
import { OtpInput, type OtpStatus } from '@/components/ui/otp-input'
import type { DashboardSettings, SyncStatus, ThemePreference } from '../types'
import { Segmented, Switch } from './primitives'
import { SyncPill } from './TitleBar'

export function SettingsView({
  settings,
  sync,
  onSync,
  onSettings,
  onTheme
}: {
  settings: DashboardSettings
  sync: SyncStatus
  onSync: (s: SyncStatus) => void
  onSettings: (p: Partial<DashboardSettings>) => void
  onTheme: (theme: ThemePreference, origin?: { x: number; y: number }) => void
}) {
  const mac = window.dashboard.platform === 'darwin'
  const mod = mac ? '⌘' : 'Ctrl'
  const shift = mac ? '⇧' : 'Shift'
  const enter = mac ? '↵' : 'Enter'
  const opacity = settings.overlayMode ? settings.overlayOpacity : settings.opacity

  return (
    <section className="view settings-view">
      <header className="view-head">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
        </div>
      </header>

      <Group label="Appearance">
        <Row icon={<Sun size={15} />} title="Theme" detail="Match your system or pick one.">
          <Segmented<ThemePreference>
            size="sm"
            label="Theme"
            value={settings.theme}
            onChange={(theme, event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onTheme(theme, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
            }}
            options={[
              { value: 'system', label: <Monitor size={13} />, title: 'System' },
              { value: 'light', label: <Sun size={13} />, title: 'Light' },
              { value: 'dark', label: <Moon size={13} />, title: 'Dark' }
            ]}
          />
        </Row>
        <Row
          icon={<Blend size={15} />}
          title={settings.overlayMode ? 'Ghost opacity' : 'Window opacity'}
          detail={`${Math.round(opacity * 100)}%${settings.overlayMode ? ' · ghost mode is on' : ''}`}
        >
          <input
            type="range"
            className="range"
            min="40"
            max="100"
            value={Math.round(opacity * 100)}
            style={{ '--value': `${((opacity * 100 - 40) / 60) * 100}%` } as React.CSSProperties}
            onChange={(event) => {
              const value = +event.target.value / 100
              onSettings({ [settings.overlayMode ? 'overlayOpacity' : 'opacity']: value })
              void window.dashboard.setOpacity(value)
            }}
          />
        </Row>
      </Group>

      <Group label="Window">
        <Row icon={<Pin size={15} />} title="Always on top" detail="Keep your day within reach.">
          <Switch
            label="Always on top"
            checked={settings.alwaysOnTop}
            onChange={(value) => {
              onSettings({ alwaysOnTop: value })
              void window.dashboard.setAlwaysOnTop(value)
            }}
          />
        </Row>
        <Row
          icon={<Power size={15} />}
          title="Open at login"
          detail={`Start quietly with ${window.dashboard.platform === 'darwin' ? 'your Mac' : 'Windows'}.`}
        >
          <Switch
            label="Open at login"
            checked={settings.launchAtLogin}
            onChange={(value) => {
              onSettings({ launchAtLogin: value })
              void window.dashboard.setLaunchAtLogin(value)
            }}
          />
        </Row>
        <Row icon={<Bell size={15} />} title="Notifications" detail="Reminders, due dates, and timers.">
          <Switch
            label="Notifications"
            checked={settings.notifications}
            onChange={(value) => onSettings({ notifications: value })}
          />
        </Row>
      </Group>

      <Group label="Sync">
        <SyncCard status={sync} onStatus={onSync} />
      </Group>

      <Group label="Shortcuts">
        <div className="shortcuts">
          <Keyboard size={15} />
          <dl>
            <dt>
              <kbd>{mod}</kbd>
              <kbd>{shift}</kbd>
              <kbd>Space</kbd>
            </dt>
            <dd>Show or hide Dashboard</dd>
            <dt>
              <kbd>N</kbd>
            </dt>
            <dd>New task</dd>
            <dt>
              <kbd>/</kbd>
            </dt>
            <dd>Quick add</dd>
            <dt>
              <kbd>1</kbd>–<kbd>4</kbd>
            </dt>
            <dd>Switch tabs</dd>
            <dt>
              <kbd>{shift}</kbd>
              <kbd>{enter}</kbd>
            </dt>
            <dd>Quick add with all options</dd>
            <dt>
              <kbd>{mod}</kbd>
              <kbd>Z</kbd>
            </dt>
            <dd>Undo delete</dd>
          </dl>
        </div>
      </Group>
    </section>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="settings-group">
      <span className="field-label">{label}</span>
      <div className="settings-card">{children}</div>
    </div>
  )
}

function Row({
  icon,
  title,
  detail,
  children
}: {
  icon: ReactNode
  title: string
  detail: string
  children: ReactNode
}) {
  return (
    <div className="setting-row">
      <span className="setting-icon">{icon}</span>
      <p>
        <strong>{title}</strong>
        <small>{detail}</small>
      </p>
      {children}
    </div>
  )
}

function SyncCard({ status, onStatus }: { status: SyncStatus; onStatus: (s: SyncStatus) => void }) {
  const [email, setEmail] = useState(status.email ?? '')
  const [code, setCode] = useState('')
  const [otp, setOtp] = useState<OtpStatus>('idle')
  const send = () => void window.dashboard.requestSyncCode(email).then(onStatus)
  const verify = (value = code) =>
    value.length === 6 &&
    void window.dashboard.verifySyncCode(email, value).then((next) => {
      setOtp(next.signedIn ? 'success' : 'error')
      onStatus(next)
    })
  return (
    <div className="sync-card">
      <div className="setting-row">
        <span className="setting-icon">
          <Cloud size={15} />
        </span>
        <p>
          <strong>{status.signedIn ? 'Cloud sync is on' : 'Sync across computers'}</strong>
          <small>
            {status.signedIn
              ? (status.email ?? 'Connected')
              : 'Use the same email everywhere. No password.'}
          </small>
        </p>
        {status.signedIn && <SyncPill status={status} />}
      </div>
      {!status.configured && (
        <div className="sync-message">
          <CircleAlert size={14} />
          <p>This build needs its cloud project connected before sign-in can be enabled.</p>
        </div>
      )}
      {status.configured && !status.signedIn && status.phase !== 'code-sent' && (
        <form
          className="email-entry"
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
          />
          <button type="submit" className="primary-button">
            Send code
          </button>
        </form>
      )}
      {status.phase === 'code-sent' && (
        <div className="otp-panel">
          <p>{status.message}</p>
          <OtpInput value={code} onChange={setCode} onComplete={verify} status={otp} autoFocus />
        </div>
      )}
      {status.signedIn && (
        <div className="sync-actions">
          <span>{status.message ?? 'Your changes are connected.'}</span>
          <button type="button" className="soft-button" onClick={() => void window.dashboard.syncNow().then(onStatus)}>
            <RefreshCw size={13} /> Sync now
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void window.dashboard.signOutSync().then(onStatus)}
          >
            Sign out
          </button>
        </div>
      )}
      {status.phase === 'error' && <div className="sync-error">{status.message}</div>}
    </div>
  )
}
