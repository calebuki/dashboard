# Dashboard

Dashboard is a calm, always-on-top task panel for macOS and Windows. It combines quick natural-language capture, recurring routines, a calendar, focus timers, long-term goals, and optional offline-first sync across computers.

## Highlights

- Type `Call Maya tomorrow at 6` to create a correctly scheduled task
- One-tap Today, Tomorrow, Weekend, Morning, Afternoon, and Evening choices
- Personal, Work, and School task areas
- Daily, weekday, and weekly recurrence with automatic rollover
- Month calendar, focused timers, notifications, and lightweight goals
- Menu bar/system tray support and a global `⌘/Ctrl + Shift + Space` shortcut
- Local storage that continues working offline
- Optional passwordless account sync across Macs and PCs
- Rare UI Duration Picker and OTP Input, adapted to Dashboard's visual system

## Install

Download the appropriate installer from the latest GitHub release:

- macOS: `Dashboard-*-mac-universal.dmg` for Apple Silicon and Intel Macs
- Windows: `Dashboard-Setup-*.exe`

For a normal macOS installation, release builds should be signed and notarized with an Apple Developer ID. Unsigned development builds can still be opened manually through macOS Privacy & Security.

## Development

Requirements: Node.js 24+.

```bash
npm install
npm run dev
```

Checks and packages:

```bash
npm run typecheck
npm test
npm run build:mac
npm run build:win
```

## Cloud sync setup

Dashboard uses Supabase Auth, Postgres, Realtime, and Row Level Security. The app never includes a secret or service-role key.

1. Create or link a Supabase project.
2. Apply `supabase/migrations/20260901182804_dashboard_sync.sql` with the Supabase CLI.
3. Configure a production SMTP provider and change the Magic Link email template to show `{{ .Token }}` so users receive a six-digit OTP.
4. Set these build environment variables:

```text
MAIN_VITE_SUPABASE_URL
MAIN_VITE_SUPABASE_PUBLISHABLE_KEY
```

For GitHub Actions, add them as repository secrets named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.

## macOS signing

The release workflow supports electron-builder signing and notarization with:

```text
MAC_CSC_LINK
MAC_CSC_KEY_PASSWORD
APPLE_API_KEY
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

Without these repository secrets, the workflow can produce a testable unsigned Mac build, but it will not provide the normal Gatekeeper installation experience.

## Privacy

Dashboard stores a local JSON cache in Electron's application-data directory. When sync is enabled and the user signs in, task, goal, and preference records are sent over TLS to the configured Supabase project. Row Level Security restricts every record to its owning account. Focus timers remain device-local.

## License

MIT. Rare UI components included in this project are also MIT licensed; see their source headers and the upstream Rare UI project.
