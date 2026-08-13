# Dashboard

Dashboard is a calm, always-on-top Windows task panel for the things that need attention now. It combines sticky-note immediacy with recurring routines, a calendar, focused timers, and lightweight goal planning.

## What is included

- Personal, Work, and School task areas
- Always-on-top window with regular and 50% overlay opacity modes
- Automatic rollover for unfinished dated tasks
- Daily, weekday, and weekly recurrence
- Month calendar with upcoming tasks
- Per-task time limits, pause/resume, and Windows notifications
- System tray support and a global `Ctrl+Shift+Space` show/hide shortcut
- Optional launch at Windows login
- Local-only JSON storage with no account, sync, or tracking
- A seeded 12-month Swedish B1 goal with a 45-minute daily routine

## Install on Windows

Download `Dashboard-Setup-0.1.0.exe` from the latest GitHub release and run it. The first personal build is not code-signed, so Windows SmartScreen may ask you to confirm that you want to run it.

Closing the window sends Dashboard to the system tray. Use the tray menu to quit completely.

## Development

Requirements: Node.js 24+ and Windows for installer packaging.

```powershell
npm install
npm run dev
```

Useful checks:

```powershell
npm run typecheck
npm test
npm run build:win
```

## Data and privacy

Dashboard stores tasks and preferences in Electron's local application-data folder on the current PC. It does not make network requests or require a login. Removing the app does not intentionally upload or transfer any task data.

## License

MIT
