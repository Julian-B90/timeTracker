# TimeTracker

A VS Code extension for tracking time against Azure DevOps work items using the **7pace Timetracker** API.

## Features

- **Sidebar panel** — Start and stop a live timer directly from the Activity Bar. The elapsed time is shown in the status bar and updates every second.
- **Manual time log** — Log time for any work item with a flexible duration format (`1h 30m`, `45m`, `2h`, or plain minutes).
- **Branch detection** — Automatically extracts the ticket ID from your current Git branch (e.g. `feature/12345`) and pre-fills the work item field.
- **Activity types** — Select the activity type (Development, Code Review, etc.) when starting a timer or logging time manually. The default activity is pre-selected automatically.
- **Recent entries** — Shows your logged work items from the last 7 days including activity type and duration.
- **Configurable branch pattern** — Customise the regex used to extract ticket IDs from branch names.

## Requirements

- A running [7pace Timehub](https://www.7pace.com) instance connected to your Azure DevOps organisation.
- An API token with read/write access to work logs (generate one under **7pace → Settings → API Tokens**).

## Extension Settings

| Setting                     | Description                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ------ | ------ | --- | ----------------- |
| `timeTracker.apiToken`      | API token for the 7pace Timetracker.                                                                     |
| `timeTracker.instanceUrl`   | Your 7pace Timehub instance URL, e.g. `https://myorg.timehub.7pace.com`.                                 |
| `timeTracker.branchPattern` | Regex to extract the ticket ID from a branch name. The first capture group is used. Default: `(?:feature | bugfix | hotfix | fix | task)[/\\](\d+)`. |

Run **TimeTracker: Configure** (or click ⚙ in the panel) to open the settings page directly.

## Usage

1. Set `timeTracker.apiToken` and `timeTracker.instanceUrl` in VS Code settings.
2. Open the **TimeTracker** panel in the Activity Bar.
3. Click **▶ Start Timer** — the ticket ID is pre-filled from your current branch if a match is found.
4. Click **⏹ Stop & Log** to stop the timer and log the time to 7pace automatically.
5. Use **📋 Manual Entry** to log time for any past date without starting a timer.

## Release Notes

### 0.0.1

Initial release.
