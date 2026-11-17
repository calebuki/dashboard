import { useState, type ReactNode } from 'react'
import { CircleAlert, RefreshCw } from 'lucide-react'
import { OtpInput, type OtpStatus } from '@/components/ui/otp-input'
import type { DashboardSettings, SyncStatus, ThemePreference } from '../types'
import { Segmented, Switch } from './primitives'
import { SyncState } from './TitleBar'

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
        <h1>Settings</h1>
      </header>

      <Group label="Appearance">
        <Row title="Theme">
          <Segmented<ThemePreference>
            size="sm"
            label="Theme"
            value={settings.theme}
            onChange={(theme, event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onTheme(theme, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
            }}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
          />
        </Row>
        <Row
          title={settings.overlayMode ? 'See-through opacity' : 'Window opacity'}
          detail={`${Math.round(opacity * 100)}%${settings.overlayMode ? ' · see-through mode is on' : ''}`}
        >
          <input
            type="range"
            className="range"
            aria-label={settings.overlayMode ? 'See-through opacity' : 'Window opacity'}
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
        <Row title="Keep on top" detail="Stay above other windows">
          <Switch
            label="Keep on top"
            checked={settings.alwaysOnTop}
            onChange={(value) => {
              onSettings({ alwaysOnTop: value })
              void window.dashboard.setAlwaysOnTop(value)
            }}
          />
        </Row>
        <Row title="Open at login" detail={`Start when you sign in to ${mac ? 'your Mac' : 'Windows'}`}>
          <Switch
            label="Open at login"
            checked={settings.launchAtLogin}
            onChange={(value) => {
              onSettings({ launchAtLogin: value })
              void window.dashboard.setLaunchAtLogin(value)
            }}
          />
        </Row>
        <Row title="Notifications" detail="Reminders, due dates and timers">
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
            <dd>New task (new note on Notes)</dd>
            <dt>
              <kbd>/</kbd>
            </dt>
            <dd>Jump to the task box</dd>
            <dt>
              <kbd>1</kbd>–<kbd>5</kbd>
            </dt>
            <dd>Switch tabs</dd>
            <dt>
              <kbd>{shift}</kbd>
              <kbd>{enter}</kbd>
            </dt>
            <dd>Add with more options</dd>
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
  const id = `settings-${label.toLowerCase()}`
  return (
    <section className="settings-group" aria-labelledby={id}>
      <h2 className="section-title" id={id}>
        {label}
      </h2>
      <div className="settings-list">{children}</div>
    </section>
  )
}

function Row({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <p>
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
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
        <p>
          <strong>{status.signedIn ? 'Signed in' : 'Sync between computers'}</strong>
          <small>
            {status.signedIn ? (status.email ?? 'Connected') : 'Sign in with the same email on each computer.'}
          </small>
        </p>
        {status.signedIn && <SyncState status={status} />}
      </div>
      {!status.configured && (
        <div className="sync-message">
          <CircleAlert size={16} />
          <p>Sync isn't set up in this build.</p>
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
            className="field-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
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
          <span>{status.message ?? 'Up to date'}</span>
          <button type="button" className="soft-button sm" onClick={() => void window.dashboard.syncNow().then(onStatus)}>
            <RefreshCw size={15} /> Sync now
          </button>
          <button
            type="button"
            className="ghost-button sm"
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
