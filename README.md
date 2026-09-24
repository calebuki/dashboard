# Dashboard

Dashboard is a calm, always-on-top task panel for macOS and Windows. It combines natural-language capture, a fast event composer, recurring routines, a calendar, focus timers, weekly goals, and optional offline-first sync across computers.

## Highlights

- Type `Lunch with Sam fri 12:30 #work` or `Gym every weekday 7am !` — dates, times, areas, repeats, and importance are understood as you type
- An event composer with a two-week day strip, month picker, scroll-wheel time picker, quick time presets, durations with end times, and reminders
- Timed reminders (at start, 10/30/60 minutes, or a day before) plus due-today and due-tomorrow notices
- Today view grouped into Scheduled, Anytime, Done, and Coming up, with carried-over tasks marked
- Weekly goals: pick “3× a week”, check in with one tap, and linked tasks count automatically; streaks track consecutive weeks
- Light, dark, or system theme, with a circular reveal when switching
- Undo for deletes, keyboard shortcuts (`N`, `/`, `1`–`4`, `Ctrl/⌘ + Z`), and a focus timer with +5 min and Done
- Menu bar/system tray support, ghost (see-through) mode, and a global `⌘/Ctrl + Shift + Space` shortcut
- Local storage that keeps working offline, with optional passwordless account sync across Macs and PCs

## Install

Download the appropriate installer from the latest GitHub release:

- macOS: `Dashboard-*-mac-universal.dmg` for Apple Silicon and Intel Macs
- Windows: `Dashboard-Setup-*.exe`

The personal macOS build is unsigned. The first time you open it, right-click Dashboard, choose **Open**, then confirm. If macOS still blocks it, allow Dashboard in **System Settings → Privacy & Security**.

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

## Privacy

Dashboard stores a local JSON cache in Electron's application-data directory. When sync is enabled and the user signs in, task, goal, and preference records are sent over TLS to the configured Supabase project. Row Level Security restricts every record to its owning account. Focus timers remain device-local.

## License

MIT. The Rare UI OTP input included in this project is also MIT licensed; see its source header and the upstream Rare UI project.
