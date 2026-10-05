> [!WARNING]
> This project is fully vibecoded, probably inefficient, but it does what I wanted lol

# TaskList Stats v2.0.12

**TaskList Stats** is a separate statistics and history explorer for the self-hosted **TaskList** database.

TaskList stays focused on creating and managing tasks. TaskList Stats reads the same SQLite database and provides charts, records, calendars, hierarchy analysis, event history, comparisons, inferred activity sessions, milestones, and Fun views without adding that weight to the main TaskList app.

Normal statistics/snapshot access stays read-only. v2.0.12 adds one deliberately narrow shared-database write: Stats can atomically acknowledge a pending milestone notification so the same celebration is not shown again in TaskList. It does not edit tasks, lists, task events, statuses, or Universal IDs.

The interface uses the same Windows 95-style visual language as TaskList, includes persistent **Light** and **Dark** themes, includes TaskList-style first-run password setup/login, works on desktop and mobile, and can be installed as a PWA.

## What it does

TaskList Stats can analyze **All lists**, one list, or any combination of lists. Tasks and subtasks are included in the selected scope.

It can answer questions such as:

- How many current entries are Open, Done, or Cancelled?
- How many root tasks and subtasks exist?
- What days, weeks, months, weekdays, and hours are busiest?
- How old is the current backlog?
- Which lists are most active?
- How deep are task trees and which roots have the largest subtrees?
- What title categories and common words appear most often?
- What exact task events happened during a selected date range?
- How do two lists or two time periods compare?
- What bursts of TaskList activity look like sessions?
- What round-number, Universal-ID, per-list, and yearly milestones have been reached?
- Which exact tasks were created, completed, or cancelled on a Calendar day?

## TaskList database access

Normal TaskList Stats snapshot reads do **not** create, update, or delete TaskList data.

The snapshot reader opens the TaskList SQLite database with:

- `Mode=ReadOnly`
- `PRAGMA query_only = ON`

The server reads TaskList into a snapshot and the browser performs the statistics against that snapshot.

v2.0.12 adds one exception for shared milestone notifications. `POST /api/milestones/claim` briefly opens the database read/write and only updates `viewed_at` / `viewed_by` on pending rows in TaskList's `milestone_notifications` table. This is what lets TaskList and Stats share one global "already celebrated" state. It never writes to `lists`, `items`, `task_events`, or `universal_ids`.

If the Stats process only has read permission to the TaskList database, normal statistics still work; Stats simply cannot claim/show a real shared milestone notification, leaving it pending for TaskList to claim later.

Authentication also requires one Stats-owned file:

```text
data/auth.json
```

That file stores the Stats password hash. It is not part of the TaskList database.

## Authentication

On first run, if `data/auth.json` does not exist, the server prints a setup token. Open Stats, enter that token, choose a password of at least 8 characters, and confirm it.

The plaintext password is never stored. `auth.json` contains a random salt and PBKDF2-HMAC-SHA256 derived hash using 210,000 iterations.

Successful login creates the `TaskListStats.Auth` cookie. It is HttpOnly, SameSite=Strict, persistent for up to 30 days, sliding while active, and marked Secure when the request itself uses HTTPS.

Use **File → Log Out** to clear the session. Setup and login are rate-limited to 5 attempts per source IP per minute.

## Technology stack

- C# / ASP.NET Core Minimal API
- .NET 10
- Kestrel
- SQLite through `Microsoft.Data.Sqlite`
- Plain HTML, CSS, and JavaScript
- Browser Canvas API for charts
- Service worker + web manifest for PWA behavior
- No ORM
- No frontend framework
- No chart library
- No Node/npm build step

## Project layout

The source tree intentionally stays small. Behavior belongs in normal purpose-based modules; there are no release-specific override or monkey-patch files.

```text
TaskListStats.csproj      .NET project, dependencies, and release version
Program.cs                server, auth, read-only snapshot reader, and API
MilestoneNotifications.cs shared milestone acknowledgement endpoint
appsettings.json          database path and listen-address configuration
README.md                 setup, behavior, security, and release documentation

data/                     runtime-created private Stats data (ignored by Git)
  auth.json               salted password hash after first-run setup

wwwroot/
  index.html              application shell, panels, controls, and dialogs
  app.js                  shared state, dates, scope, links, table/card helpers
  overview.js             Overview records, completion behavior, and aging
  history.js              Trends, backlog, Calendar, Calendar drill-down, Lists
  patterns.js             Patterns plus Trees & Titles
  analysis-tabs.js        History Explorer, Compare, Activity Sessions, Milestones
  fun.js                  Fun workspace
  charts.js               Canvas chart drawing and chart tooltip interactions
  ui.js                   navigation, custom selects, filtering, startup/session UI
  milestones.js           shared milestone claim/dialog/confetti behavior
  milestones.css          responsive Light/Dark milestone celebration styling
  theme.js                persistent Light/Dark theme selection and startup application
  style.css               base Windows 95-style UI and responsive layout
  theme.css               shared Light/Dark Win95 theme tokens and dark-theme styling
  analysis-tabs.css       analysis, milestone/session, and Calendar-dialog styles
  login.html              login / first-run setup page
  login.js                login, setup-token, and return-URL behavior
  auth.css                login/setup styling
  version.json            checked-in frontend release version
  manifest.webmanifest    installable-PWA metadata
  sw.js                   network-first service worker/static cache
  icons/stats.svg         app/favicon icon
```

## Version handling

`TaskListStats.csproj` is the project/assembly version source.

The build target regenerates `wwwroot/version.json` from that version. The checked-in `version.json` is also updated on every release so the browser displays the current frontend version even when the user updates static files without rebuilding the existing executable immediately.

The running server assembly version remains available through the auth/snapshot APIs as a fallback.

## Requirements and running

Server requirements:

- .NET 10 SDK/runtime
- a TaskList `task-list.db` SQLite database
- read permission to the TaskList database and parent path for normal Stats features
- write permission to the TaskList database if Stats should be able to acknowledge/show shared milestone notifications
- write permission to the Stats working directory for `data/auth.json`

Run:

```bash
git clone https://github.com/RotatingWires/task-list-stats.git
cd task-list-stats
dotnet restore
dotnet run
```

Typical `appsettings.json`:

```json
{
  "TaskListStats": {
    "DatabasePath": "/srv/task-list/data/task-list.db",
    "ListenUrl": "http://0.0.0.0:8712"
  }
}
```

Environment variables can override it:

```bash
export TASKLIST_DB_PATH=/srv/task-list/data/task-list.db
export TASKLIST_STATS_URL=http://0.0.0.0:8712
```

## Themes

Use **View → Theme** to choose **Light** or **Dark**. The selection persists in browser storage and applies to the Stats workspace and login/setup UI.

The dark theme keeps the Windows 95 raised/recessed look instead of replacing it with a generic flat theme. Canvas charts read theme-aware colors and redraw appropriately.

There is intentionally no automatic **System** theme; theme selection is strictly Light or Dark.

## TaskList deep links

Task IDs shown in Stats link back to the main TaskList app using the task's Universal ID:

```text
/task/<UniversalID>
```

TaskList opens the correct list, switches to **All**, scrolls to the task, and highlights it.

The TaskList origin is defined in `wwwroot/app.js`:

```javascript
const TASKLIST_ORIGIN = 'http://tasklist.lehighradio.com:8711';
```

Change it if your TaskList instance uses another host, port, or protocol.

## Statistics sections

### Overview

Current counts, creation/completion records, completion behavior, open-task aging, completion-time buckets, and oldest open tasks.

### Trends

Created / Completed / Cancelled history, approximate backlog history, busiest months, completion-speed months, and year-over-year monthly creation comparison.

The backlog chart remains approximate because it reconstructs older state from timestamps stored on current task rows.

### Calendar

- Year Activity Heatmap with Created / Completed / Cancelled / Reopened / All activity modes
- typed Month Detail using `m/yy` or `m/yyyy`
- Month Calendar with three-letter weekday headings
- Month × Year creation heatmap
- seasonality chart
- clickable days that open the exact Created / Completed / Cancelled tasks for that date

Calendar day drill-down only renders event categories that actually contain tasks for the selected day. Empty categories are omitted instead of showing placeholder boxes.

### Lists

Per-list current counts, completion percentage, completion duration, share of current entries, and most-active-list-by-month history.

### Patterns

Day-of-week and hour-of-day creation/completion charts, weekday × hour heatmap, Workload Rhythm, and Exam / Test Windows.

Workload Rhythm includes busiest creation weekday/hour and busiest completion weekday/hour using the same populations as the corresponding Patterns charts.

### Trees & Titles

Nesting depth, largest task trees, deepest tasks, title categories, common words, and reopened tasks.

### History Explorer

Chronological event history with one compact typed date-range field, event type, ordering, text/list/ID filtering, status transitions, and TaskList deep links. Ranges use the same `10/3 - 10/8` style as TaskList Search, with `m/d`, `m/d/yy`, or `m/d/yyyy` accepted on either side.

Created events display as `Created → Open` rather than showing a missing previous status, while normal state changes continue to display their actual transitions.

### Compare

Compare either two list scopes or two date ranges. Time-period mode uses one compact typed range for Period A and one for Period B. The Difference section reports `A - B` for the same metrics.

### Activity Sessions

Groups timestamped events into inferred sessions using a 15-, 30-, or 60-minute maximum gap. This is an inference from event timing, not a time tracker.

Session rows show their event mix. Click the event count to open the session's events in chronological order.

### Milestones

Milestones are calculated automatically from the available event history. Current milestone families include:

- global Created / Completed / Cancelled / Reopened thresholds
- overall recorded-event thresholds
- Universal ID milestones such as #100, #500, #1,000, #2,500, #5,000, and #10,000
- per-list creation/completion thresholds
- yearly first creation/completion plus yearly round-number thresholds

TaskList v1.5.5+ also keeps a tiny shared notification ledger for major global Created, Completed, and Universal-ID thresholds. Either TaskList or Stats can claim a pending milestone, show a short celebration dialog with confetti, and mark that notification viewed globally so the other app does not repeat it. This popup state is separate from the permanent Milestones analysis shown here.

### Fun

Task Roulette, Forgotten Task, Time Machine, Productivity Jackpot, Personal Records, On This Day, Déjà Vu, Slowest Task, Night Owl, Early Bird, Same-Day Speedrun, and Cleanup Day.

Date-only values are displayed as dates. Fun statistics that require an actual time only use timestamps that really contain a clock time; Stats does not turn a date-only value into a fake `12:00 AM` event.

## List filtering

The list selector is a multi-select Windows-style checklist.

- **All lists** is the default.
- Select one list to analyze only that list.
- Select several lists to analyze their combined scope.
- Unchecking the final selected list returns to **All lists**.

The selected scope is shared across Stats tabs.

TaskList Stats currently reads every row from TaskList's `lists`, `items`, and `task_events` tables without applying TaskList's archived-list flag. Archived lists are therefore included in **All lists**, their current items and historical events contribute to statistics, and archived lists appear in the Stats list selector like active lists.

## Timestamp precision rules

TaskList history can contain full timestamps or imported date-only values. Stats does **not** invent a midnight time for date-only history.

Date-only values can participate in calendar-date statistics such as daily/monthly trends, calendars, heatmaps, seasonality, and date-level milestones.

Statistics requiring an actual clock time only use confirmed timestamps containing a time component. This includes hour-of-day charts, weekday × hour heatmaps, completion-duration metrics, Activity Sessions, and time-specific Fun analyses.

## Current-status semantics

For normal completion/cancellation analytics, current status is authoritative:

- a task contributes to completion statistics only when its current status is `Done`
- a task contributes to cancellation statistics only when its current status is `Cancelled`
- creation statistics use valid creation dates regardless of current status

This prevents a preserved old terminal timestamp from inflating the wrong current-state statistic.

## Event history and older data

TaskList v1.5 introduced an append-only `task_events` state-transition log. New transitions are stored individually as they happen.

For older task data, TaskList reconstructs event rows from timestamps it already had. That older reconstruction can be incomplete when a task changed state repeatedly before the event log existed, and tasks deleted before event logging cannot be reconstructed.

The Stats **About** dialog contains the same user-facing explanation.

## Exporting a snapshot

Use **File → Export snapshot JSON...** to download the snapshot loaded by Stats.

Treat exports as private because they can contain task titles, descriptions, list names, IDs, statuses, timestamps, and event history.

## PWA behavior

The service worker caches the application shell, shared theme/milestone assets, and login/setup assets; uses network-first behavior for current same-origin static assets; always fetches `/api/*` from the network; and uses cached files only as an offline fallback.

The shell cache does not contain the live TaskList snapshot.

## Security and privacy

Recommended deployment:

- use HTTPS across untrusted networks
- prefer LAN, VPN, or a private reverse proxy
- firewall Stats to networks/devices that need it
- keep `data/auth.json`, the TaskList database, and exported snapshots private
- give the Stats service account only the filesystem permissions it needs

Important distinctions:

- **TaskList task/history data:** normal snapshot access is read-only SQLite mode with `PRAGMA query_only`; Stats does not edit lists, items, event history, statuses, or Universal IDs.
- **Milestone acknowledgement:** one narrow endpoint may update only `viewed_at` / `viewed_by` in `milestone_notifications` so a celebration is globally one-time across the two apps.
- **Stats auth storage:** Stats writes its own `data/auth.json` credential file.
- **Passwords:** plaintext passwords are never stored.
- **Sessions:** the cookie is HttpOnly and SameSite=Strict; use HTTPS if the network is not trusted.
- **Exports:** snapshot JSON contains personal task data and should be protected like a database export.

## Troubleshooting

### I only see Create Password

That is expected on first run. Look at the TaskList Stats server console for the current setup token.

### Login says "Too many attempts"

Setup/login allows 5 attempts per source IP per minute. Wait for the minute window to expire before retrying.

### `TaskList database not found`

Check `TaskListStats:DatabasePath` or `TASKLIST_DB_PATH` and verify filesystem read permissions.

### The page shows `Database unavailable`

An expired session should send you back to Login. Otherwise inspect `/api/health` and `/api/snapshot` after logging in.

### A real milestone popup never appears in Stats

TaskList v1.5.5 or newer must have initialized the shared `milestone_notifications` table. Stats also needs filesystem write permission to the TaskList database to atomically acknowledge the notification. If it cannot write, the normal Stats dashboard still works and TaskList can claim the notification instead.

### Task-ID links open the wrong TaskList server

Change `TASKLIST_ORIGIN` in `wwwroot/app.js`.

### Statistics differ from what you expected

Check the selected list scope, task vs subtask expectations, date-only vs full timestamp history, current status vs preserved old terminal timestamps, and whether the value comes from event history or approximate backlog reconstruction.

## Current release: v2.0.12

### v2.0.12

- Add shared milestone celebrations for major global Created, Completed, and Universal-ID thresholds generated by TaskList v1.5.5+.
- Atomically claim pending notifications so a real celebration appears only once across TaskList and TaskList Stats.
- Keep normal Stats snapshots strictly read-only; the only TaskList-database write is the narrow milestone acknowledgement update.
- Add the same responsive Win95-style Light/Dark celebration dialog and short dependency-free confetti as TaskList, including reduced-motion support.
- Keep the existing Milestones tab as the permanent analytical/history view after a popup is dismissed.
- Add milestone frontend assets to the existing network-first PWA shell.
- Add no monkey patches, frontend libraries, or new runtime dependencies.

### v2.0.11

- Remove **System** from View → Theme so theme selection is strictly Light or Dark.
- Remove the `prefers-color-scheme` listener and System-theme resolution instead of merely hiding the menu choice.
- Make Calendar day drill-down omit Created / Completed / Cancelled categories when that category has no tasks on the selected day.
- Use darker, less neon Created/Completed colors for the Patterns grouped charts in dark mode while leaving other chart palettes unchanged.
- Audit the source tree and service-worker shell for old compatibility, release-specific override, and retired Calendar files.
- Preserve the read-only TaskList snapshot model and add no monkey patches, chart libraries, or runtime dependencies.

### v2.0.10

- Add persistent Light, Dark, and initially System theme support across the Stats workspace and login/setup screen.
- Add shared Win95 dark-theme styling for chrome, menus, controls, tables, cards, dialogs, Calendar, heatmaps, analysis tabs, Fun, links, notes, and tooltips.
- Make Canvas charts theme-aware and redraw the active tab after a theme change.

### v2.0.9

- Display Created event transitions as `Created → Open` instead of `— → Open`.
- Document archived-list behavior in **All lists**.

### v2.0.8

- Replace separate From/To fields in History Explorer and Compare with compact typed date-range controls.

### v2.0.7 / v2.0.6

- Return Calendar Month Detail to one typed `m/yy` / `m/yyyy` field.
- Add Universal-ID, per-list, and yearly milestone families.
- Consolidate Calendar drill-down into the normal History/analysis modules and remove redundant release-specific files.

### v2.0.x highlights

- Add History Explorer, Compare, Activity Sessions, Milestones, Calendar drill-down, responsive analysis controls, improved chart tooltips, and the current Fun workspace.
- Remove retired Search / Explorer, Flow, Insights, Ancient Task, and Task Graveyard features from the actual source instead of merely hiding them.

Earlier release-by-release details remain available in Git commit history.

## Development philosophy

- keep the source tree small
- prefer normal source edits over version-specific patch files
- do not monkey-patch or reassign existing functions to bolt on release behavior
- remove retired features from markup, code, styles, and dependencies instead of merely hiding them
- keep TaskList authoritative; keep normal Stats snapshot reads read-only and limit shared writes to the explicit milestone acknowledgement
- preserve timestamp precision instead of inventing data
- keep controls consistent across desktop and mobile
- use boring, understandable browser/.NET features before adding dependencies
