> [!WARNING]
> This project is fully vibecoded, probably inefficient, but it does what I wanted lol

# TaskList Stats

**TaskList Stats v2.0.8** is a separate, read-only statistics and history explorer for the self-hosted **TaskList** database.

TaskList stays focused on creating and managing tasks. TaskList Stats reads the same SQLite database and provides charts, records, calendars, hierarchy analysis, event history, comparisons, inferred activity sessions, milestones, and Fun views without adding that weight to the main TaskList app.

The interface uses the same Windows 95-style visual language as TaskList, includes TaskList-style first-run password setup/login, works on desktop and mobile, and can be installed as a PWA.

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

## Read-only TaskList database access

TaskList Stats does **not** create, update, or delete TaskList rows.

The TaskList SQLite database is opened with:

- `Mode=ReadOnly`
- `PRAGMA query_only = ON`

There are no TaskList-data write endpoints in the Stats API. The server reads TaskList into a snapshot and the browser performs the statistics against that snapshot.

Authentication does require one Stats-owned file:

```text
data/auth.json
```

That file stores the Stats password hash. It is not part of the TaskList database.

## Authentication

On first run, if `data/auth.json` does not exist, the server prints a setup token. Open Stats, enter that token, choose a password of at least 8 characters, and confirm it.

The plaintext password is never stored. `data/auth.json` contains a random salt and PBKDF2-HMAC-SHA256 derived hash using 210,000 iterations.

Successful login creates the `TaskListStats.Auth` cookie. It is HttpOnly, SameSite=Strict, persistent for up to 30 days, sliding while active, and marked Secure when the request itself uses HTTPS.

Use **File → Log Out** to clear the session. Setup and login are rate-limited to 5 attempts per source IP per minute.

## Technology stack

- C# / ASP.NET Core Minimal API
- .NET 10
- Kestrel
- Microsoft.Data.Sqlite
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
Program.cs                server, auth, read-only DB reader, and API
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
  style.css               base Windows 95-style UI and responsive layout
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
- read permission to the TaskList database and parent path
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

The backlog chart remains approximate because it reconstructs older state from the timestamps stored on current task rows.

### Calendar

- Year Activity Heatmap with Created / Completed / Cancelled / Reopened / All activity modes
- typed Month Detail using `m/yy` or `m/yyyy`
- Month Calendar with three-letter weekday headings
- Month × Year creation heatmap
- seasonality chart
- clickable days that open the exact Created / Completed / Cancelled tasks for that date

The Month Detail field is a normal styled text input with `inputmode="text"`, matching the other typed date/month controls instead of using a browser-native picker.

### Lists

Per-list current counts, completion percentage, completion duration, share of current entries, and most-active-list-by-month history.

### Patterns

Day-of-week and hour-of-day creation/completion charts, weekday × hour heatmap, Workload Rhythm, and Exam / Test Windows.

Workload Rhythm includes busiest creation weekday/hour and busiest completion weekday/hour using the same populations as the corresponding Patterns charts.

### Trees & Titles

Nesting depth, largest task trees, deepest tasks, title categories, common words, and reopened tasks.

### History Explorer

Chronological event history with one compact typed date-range field, event type, ordering, text/list/ID filtering, status transitions, and TaskList deep links. Ranges use the same `10/3 - 10/8` style as TaskList Search, with `m/d`, `m/d/yy`, or `m/d/yyyy` accepted on either side.

### Compare

Compare either two list scopes or two date ranges. Time-period mode uses one compact typed range for Period A and one for Period B instead of separate From/To controls. A and B use matching Windows-style metric panels and the Difference section reports `A - B` for the same metrics.

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

No milestone rows need to be entered manually.

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

For older task data, TaskList reconstructs event rows from the timestamps it already had. That older reconstruction can be incomplete when a task changed state repeatedly before the event log existed, and tasks deleted before event logging cannot be reconstructed.

The Stats **About** dialog contains the same user-facing explanation. The individual tabs stay focused on their statistics instead of repeating the warning everywhere.

## Exporting a snapshot

Use **File → Export snapshot JSON...** to download the snapshot loaded by Stats.

Treat exports as private because they can contain task titles, descriptions, list names, IDs, statuses, timestamps, and event history.

## PWA behavior

The service worker caches the application shell and login/setup assets, uses network-first behavior for current same-origin static assets, always fetches `/api/*` from the network, and uses cached files only as an offline fallback.

The shell cache does not contain the live TaskList snapshot.

## Security and privacy

Recommended deployment:

- use HTTPS across untrusted networks
- prefer LAN, VPN, or a private reverse proxy
- firewall Stats to networks/devices that need it
- keep `data/auth.json`, the TaskList database, and exported snapshots private
- give the Stats service account only the filesystem permissions it needs

Important distinctions:

- **TaskList DB writes:** blocked by read-only SQLite mode and `PRAGMA query_only`.
- **Stats auth storage:** Stats writes only its own `data/auth.json` credential file.
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

### Task-ID links open the wrong TaskList server

Change `TASKLIST_ORIGIN` in `wwwroot/app.js`.

### Statistics differ from what you expected

Check the selected list scope, task vs subtask expectations, date-only vs full timestamp history, current status vs preserved old terminal timestamps, and whether the value comes from event history or approximate backlog reconstruction.

## Current release: v2.0.8

### v2.0.8

- Replace History Explorer's separate From/To fields with one compact typed Date range control.
- Replace Compare time-period mode's four From/To fields with one typed date range for Period A and one for Period B.
- Use the same `10/3 - 10/8` range format as TaskList Search; either side accepts `m/d`, `m/d/yy`, or `m/d/yyyy`.
- Accept hyphen, en dash, or em dash separators and keep existing date validation/order checks.
- Keep the current default History and Compare date windows while formatting them into the compact controls.
- Remove the old separate-date parsing/listener paths and keep the range controls responsive on desktop and mobile.
- Bump project/assembly/frontend version metadata to v2.0.8 with no new dependencies or monkey patches.

### v2.0.7

- Returned Calendar Month Detail to one typed `m/yy` / `m/yyyy` field for consistency with the app's other typed date/month controls.
- Force the Month Detail field to `inputmode="text"` so mobile browsers use a normal text keyboard rather than a numeric-only picker.
- Removed the separate Month/Year selector markup, selector options, synchronization handlers, and selector-specific Calendar helper functions introduced in v2.0.6.
- Consolidated Calendar month parsing, initialization, rendering, and day-drill-down around the single `calendarMonth` value instead of keeping duplicate month/year state.
- Kept the v2.0.6 milestone families and file consolidation intact with no new files, dependencies, monkey patches, or hidden replacement controls.
- Bumped project/assembly/frontend version metadata to v2.0.7.

### v2.0.6

- Replaced the Calendar Month Detail text field with separate custom Month and Year menus so iOS never needs to type a slash or invoke a browser-native month picker.
- Added Universal ID milestones, per-list creation/completion milestones, and yearly first/round-number creation/completion milestones.
- Consolidated Calendar day-drill-down JavaScript into `history.js` and its feature styles into `analysis-tabs.css`.
- Removed the now-redundant `calendar-details.js` and `calendar-details.css` files and their service-worker/index references.
- Made the Activity Session event dialog normal static application markup instead of dynamically building another dialog structure in JavaScript.
- Kept removed/old feature code out of the source tree rather than hiding it.
- Bumped checked-in frontend and project version metadata to v2.0.6.

### v2.0.5

- Fixed mobile line-chart tooltip dismissal.
- Changed Calendar labels to three-letter weekdays, added Reopened heatmap mode, and replaced the native month picker with a custom-styled control.
- Consolidated old/live event-history explanations into About instead of repeating them on individual tabs.
- Removed Ancient Task and Task Graveyard from Fun.
- Prevented date-only Fun values from displaying a made-up midnight time.
- Removed the History Explorer Source column from the renderer itself.

### v2.0.4

- Removed the History Explorer Source column from the visible table.

### v2.0.3

- Turned Milestones into responsive tiles.
- Made Compare's Difference section match the A/B metric presentation.

### v2.0.2

- Restyled Activity Session rows and added clickable event-count drill-down dialogs.

### v2.0.1

- Fixed horizontal scrolling from the analysis tabs on mobile.
- Converted new analysis controls to the custom Windows-style control system.
- Removed Search / Explorer, Flow, and Insights completely.
- Added busiest completion weekday/hour to Workload Rhythm.
- Redesigned Milestones and Compare.

### v2.0

- Added History Explorer, Compare, Activity Sessions, and Milestones based on TaskList's state-event log.

### v1.0.13

- Fixed Calendar dialog sizing on mobile while keeping one scrollable dialog body.

### v1.0.12

- Moved only the Calendar dialog OK button slightly lower.

### v1.0.11

- Fixed Calendar dialog single-scroll behavior.
- Added checked-in/generated `version.json` so frontend version labels remain current even when an older executable is still running.

### v1.0.10

- Added Task Roulette tooltips and Calendar day drill-down.

### v1.0.9

- Removed release-specific compatibility/override code and organized browser behavior into normal purpose-based modules.

Earlier 1.0.x and 0.x releases built authentication, records, current-status semantics, backlog reconstruction, hierarchy performance, mobile layout, custom controls, deep links, Fun analyses, heatmaps, and the original statistics dashboards. The Git commit history contains the detailed release-by-release notes.

## Development philosophy

- keep the source tree small
- prefer normal source edits over version-specific patch files
- do not monkey-patch or reassign existing functions to bolt on release behavior
- remove retired features from markup, code, styles, and dependencies instead of merely hiding them
- keep the TaskList database authoritative and read-only from Stats
- preserve timestamp precision instead of inventing data
- keep controls consistent across desktop and mobile
- use boring, understandable browser/.NET features before adding dependencies
