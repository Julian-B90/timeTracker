# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run compile        # Type-check, lint, and bundle (development)
npm run package        # Production build (minified, for publishing)
npm run watch          # Watch mode: parallel esbuild + tsc
npm run lint           # ESLint validation
npm run check-types    # TypeScript type-check without emitting
npm test               # Run extension tests via vscode-test
```

To run a single test file, use `npm run compile-tests` then invoke `vscode-test` directly with the test file path.

Bundled output goes to `dist/extension.js` (esbuild, CJS). Test compilation outputs to `out/`.

## Architecture

This is a VS Code extension that integrates with the **7pace Timetracker** API for tracking time against Azure DevOps work items.

### Module Responsibilities

**`extension.ts`** — Entry point. Registers all commands (`timeTracker.startTimer`, `stopTimer`, `logTime`, `configure`, `showPanel`) and contains `parseDuration()` which handles "1h 30m", "45m", "2h", or plain numbers (minutes).

**`timerManager.ts`** — Stateful timer. Manages start/stop sessions, drives a 1-second interval for the status bar, and emits `onSessionChange` events that the panel subscribes to.

**`panelProvider.ts`** (`TrackerPanelProvider`) — Webview sidebar. Generates the full HTML/CSS/JS panel inline (VS Code theme-aware). Bridges webview `postMessage` ↔ VS Code commands. Subscribes to timer session changes to re-render live.

**`apiClient.ts`** — 7pace REST API v2 client. Reads `timeTracker.apiToken`, `organizationUrl`, and `project` from VS Code settings. Endpoints: POST time entries, GET recent 7-day entries, GET work item details.

**`gitHelper.ts`** — Git branch utilities. Shells out to `git rev-parse --abbrev-ref HEAD`, applies configurable regex (`timeTracker.branchPattern`) to extract ticket IDs, and watches `.git/HEAD` via `fs.watch` for branch changes.

### Data Flow

```
git branch change
  → gitHelper watches .git/HEAD
  → panelProvider re-fetches branch info + recent entries
  → webview re-renders

User starts timer
  → extension.ts command handler
  → timerManager.start()
  → status bar updates every second
  → onSessionChange fires → panelProvider re-renders

User stops timer
  → timerManager.stop()
  → extension.ts prompts to log time
  → apiClient.logTimeEntry() POSTs to 7pace
```

### Key Conventions

- No runtime npm dependencies — only Node.js built-ins and `fetch` (bundled by esbuild).
- `vscode` module is externalized (not bundled).
- ESLint enforces naming conventions, strict equality, curly braces, and semicolons.
- Ticket ID extraction: default regex matches `feature/1234`, `bugfix/5678`, etc.; falls back to first 4+ digit sequence in branch name.
