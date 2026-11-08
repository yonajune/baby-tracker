# baby-tracker

A basic baby activity tracker built with Vite, React, and TypeScript.

Record timestamped feeds, sleep intervals, and wet/dirty diapers, review recent activity, and delete mistakes. Feed amounts and notes are optional.

## Your data

Entries stay in this browser's localStorage. There are no accounts, backend, sync, or backups. Clearing browser data removes the history, and another browser or device will not share it. Use a trusted device; this is a simple personal log, not a medical record.

## Development

Use Node.js 24 and npm 11.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

The build writes `dist/`; preview serves that build locally. Focused tests use Node's built-in test runner to check activity validation and storage round-trips, corruption, write failures, and conflicting changes.

## Capy development environment

The repository-owned `.capy/setup.json` installs locked dependencies on initialization, refreshes them only when install inputs change, and starts Vite on port 5173. The development server binds to all interfaces for the cloud preview; it is not a production server. No environment variables or external services are required.

Keep credentials and personal data out of Git. Local `.env` files are ignored; committed `.env.example` files must contain placeholders only.
