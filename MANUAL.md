> [!WARNING]
> This project is fully vibecoded, probably inefficient, but it does what I wanted lol

# TaskList Stats v2.1.26

**TaskList Stats** is a separate statistics app with Task Flow for the self-hosted **TaskList** database.

TaskList stays focused on creating and managing tasks. TaskList Stats reads the same SQLite database and provides charts, records, calendars, hierarchy analysis, event history, comparisons, inferred activity sessions, milestones, and Fun views without adding that weight to the main TaskList app.

All TaskList database access is read-only, using private SQLite page caches. Stats does not edit tasks, lists, task events, statuses, Universal IDs, or notification state. Live milestone dialogs and confetti belong exclusively to TaskList; Stats keeps the permanent analytical Milestones tab.

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

<img width="2560" height="1299" alt="image" src="https://github.com/user-attachments/assets/74e1c4ea-e0a9-4f17-a4c2-7798a00a0289" />
<img width="2560" height="1299" alt="image" src="https://github.com/user-attachments/assets/2907f0f1-2aa5-4b15-8dd1-9313f57b121b" />
<img width="2560" height="1300" alt="image" src="https://github.com/user-attachments/assets/4d19265e-db65-42f8-aa5d-7fc32c5ef778" />
<img width="2560" height="1299" alt="image" src="https://github.com/user-attachments/assets/d4bbb7d6-a504-43de-9840-b0e12b822144" />
<img width="2560" height="1299" alt="image" src="https://github.com/user-attachments/assets/7664cdb2-e455-4f8b-ae4a-ab49ea522695" />
<img width="2558" height="1301" alt="image" src="https://github.com/user-attachments/assets/570682fa-ee2d-4922-878c-a9398002d0f2" />
<img width="2560" height="1296" alt="image" src="https://github.com/user-attachments/assets/06f6885c-fdc1-452b-a39f-d7a9385df762" />
<img width="2560" height="1296" alt="image" src="https://github.com/user-attachments/assets/3c5cdbda-9990-48fe-9509-16b6eb806ee1" />
<img width="2560" height="1296" alt="image" src="https://github.com/user-attachments/assets/3a1a6686-f5f4-4720-a819-dda6741d4aa7" />

## TaskList database access

TaskList Stats does **not** create, update, or delete TaskList data.

Both the snapshot and event-history readers open the TaskList SQLite database with:

- `Mode=ReadOnly`
- `Cache=Private`
- `PRAGMA query_only = ON`

The server reads current TaskList lists/items into the initial snapshot and the browser performs the statistics against that snapshot. The append-only `task_events` history is intentionally excluded from initial startup and is loaded from `/api/events` only when Task Flow, Compare, Activity Sessions, Milestones, or snapshot export actually needs it.

After the first event-history load, Stats keeps the events in browser memory across normal **Refresh** operations. When event history is needed again, the browser sends the last event ID plus an opaque cursor derived from that last event. The server validates that cursor against the current database and returns only rows with a larger event ID. Those new rows are appended to the in-memory event set, so a refresh after five new TaskList events transfers five event rows instead of the entire history.

If the database was restored, replaced, truncated, or otherwise no longer contains the same last cached event, cursor validation fails. The same `/api/events` response then marks the cache for reset and returns the full current event history, so Stats recovers automatically instead of silently combining events from two database histories. Event history is not persisted in browser storage, so a full page/browser restart still performs one normal lazy full-history load when an event-dependent feature is first opened.

Stats has no milestone acknowledgement endpoint or read/write connection to the TaskList database. Its analytical Milestones tab reads event history without accessing TaskList's notification queue.

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

## HTTP endpoints

The default base URL is `http://localhost:8712`. Request and response bodies are JSON unless stated otherwise. Stats uses its own `TaskListStats.Auth` cookie; a TaskList login cookie does not authenticate Stats. Login/setup set an HttpOnly, SameSite=Strict cookie with a 30-day sliding lifetime, marked Secure when the request uses HTTPS. Send that cookie on authenticated requests.

| Method | Path | Request | Response / effect |
| --- | --- | --- | --- |
| GET | `/api/auth/status` | None; public. | `{version, configured, authenticated}`. |
| POST | `/api/auth/setup` | Public JSON: `{setupToken, password, confirmPassword}`. | First-run setup using the token printed by this server. Password must be at least 8 characters and match confirmation. Saves the Stats password hash and signs in; returns `{authenticated: true}`. Returns 409 if already configured, 401 for an invalid token, or 400 for an invalid password. |
| POST | `/api/auth/login` | Public JSON: `{password}`. | Signs in and returns `{authenticated: true}`; 401 for an incorrect password, 409 if setup has not been completed. |
| POST | `/api/auth/logout` | Authenticated; no body. | Clears the Stats session cookie; 204 with no response body. |
| GET | `/api/health` | Authenticated; no body. | `{ok, version, databaseFound, databaseFile}`. `ok` indicates whether the configured database file exists, not whether every query can succeed. |
| GET | `/api/snapshot` | Authenticated; no body. | Current lists/items and database metadata, described below. Reads TaskList through a read-only SQLite connection. |
| GET | `/api/events` | Authenticated; optional `afterId` and `cursor` query parameters. | `{resetRequired, lastEventId, cursor, events}`; full or incremental history, described below. Reads through a read-only SQLite connection. |

Setup and login share a limit of 5 attempts per observed source IP per minute; excess attempts return 429. Protected endpoints return 401 without a valid Stats cookie. Missing/unreadable TaskList databases return 503 problem details for snapshot/history requests. Validation and malformed JSON/query values can return 400. Authentication errors may have no JSON body; errors returned with `error` use that field, while database problems use `title` and `detail`.

### Snapshot fields

`/api/snapshot` returns `{version, generatedAtUtc, databaseLastWriteUtc, highestUniversalId, lists, deletedLists, items, eventLogAvailable, events}`. Timestamps are strings. `databaseLastWriteUtc` is the main database file's last-write time, not an event-history cursor. `highestUniversalId` includes IDs allocated to entries that have since been deleted.

- `lists`: `{id, name, createdAt}` for every surviving list, including archived lists. The snapshot does not include list descriptions or an archive flag.
- `deletedLists`: `{id, name}` from TaskList's deleted-list name ledger; an empty array when that table is unavailable in an older database.
- `items`: flat `{universalId, listId, displayId, parentDisplayId, title, description, status, createdAt, updatedAt, completedAt, cancelledAt, reopenedAt}` rows. `parentDisplayId` is null for roots; optional timestamps can be null. Status is `Open`, `Done`, or `Cancelled`. No server-side list/date/status filters are applied.
- `eventLogAvailable`: whether `task_events` exists. `events` is always empty in this endpoint; history is loaded separately.

### Incremental event history

Start with `GET /api/events`. Its `events` array contains all current recorded events ordered by event ID ascending. Each event is `{id, universalId, eventType, eventAt, fromStatus, toStatus, listId, displayId, parentDisplayId, title, source}`. Status/parent fields can be null. List/display IDs and titles describe the entry when the event was recorded.

Retain the returned `lastEventId` and opaque `cursor`, then request `/api/events?afterId=LAST_ID&cursor=CURSOR` to get only newer events. There is no page size or server-side history filter; an initial load can contain the entire history. Zero/negative `afterId` starts from the beginning. When no new events exist, the last event ID/cursor remain usable.

For a positive `afterId`, the server checks the supplied cursor against that exact event. If the event is missing or the cursor is missing/mismatched, it returns `resetRequired: true` and the full current history. Replace the cached history in that case instead of appending. If the event table is absent, the response has `lastEventId: 0`, `cursor: null`, and `events: []`; `resetRequired` is true when a positive `afterId` was supplied.

With TaskList v1.6.9 or newer, the opaque cursor also includes the server-owned history revision, which changes on ZIP restore even if the final event is identical. Older TaskList schemas use the event anchor alone. Snapshot/history reads each use one deferred read transaction so concurrent changes cannot mix lists, tasks, revision state, and event rows from different database states. Concurrent snapshot refreshes coalesce, and late history responses cannot modify a replacement snapshot.

### Browser routes and API scope

`/` and `/index.html` require sign-in; `/login.html` handles login/setup. Static frontend/PWA assets are served separately. Other authenticated non-file GET paths fall back to the application HTML, so an unknown GET path should not be treated as a JSON endpoint.

All analytics, list filtering, Task Flow, activity sessions, milestones, and the JSON snapshot download are computed/assembled in the browser from these read-only APIs. Stats has no task-writing, list-writing, milestone-consume, or ZIP-restore endpoint.

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
  analysis-tabs.js        Task Flow, Compare, Activity Sessions
  milestones.js           on-demand Milestones view, grouping, thresholds, and SVG icons
  fun.js                  Fun workspace
  charts.js               Canvas chart drawing and chart tooltip interactions
  ui.js                   navigation, custom selects, filtering, startup/session UI
  theme.js                persistent Light/Dark theme selection and startup application
  style.css               base Windows 95-style UI and responsive layout
  theme.css               shared Light/Dark Win95 theme tokens and dark-theme styling
  analysis-tabs.css       analysis, milestone/session, and Calendar-dialog styles
  login.html              login / first-run setup page
  login.js                login, setup-token, and return-URL behavior
  auth.css                login/setup styling
  version.json            frontend release version regenerated from TaskListStats.csproj during build
  manifest.webmanifest    installable-PWA metadata
  sw.js                   network-first service worker/static cache
  icons/stats.svg         app/favicon icon
```

## Version handling

`TaskListStats.csproj` contains the single authoritative application version in its `<Version>` property. The .NET SDK derives the assembly/file/informational versions from that value, so they are not repeated as separate manually maintained properties.

The build target regenerates `wwwroot/version.json` from `$(Version)` for the browser's release label. The running server assembly version remains available through the auth/snapshot APIs as a fallback.

Frontend asset URLs no longer carry release-number query strings. The service worker uses a stable shell-cache name and network-first requests with `cache: 'no-store'`, updating the cached copy after a successful network response and using cache only as an offline fallback. That keeps frontend freshness independent of manually duplicated release numbers.

## Requirements and running

Server requirements:

- .NET 10 SDK/runtime
- a TaskList `task-list.db` SQLite database
- read access to the TaskList database and parent path, including existing SQLite WAL/SHM sidecar files when WAL is active
- write permission to the Stats working directory for `data/auth.json` and `logs/console.log`

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

## Runtime logging

TaskList Stats writes its normal ASP.NET/runtime log stream to:

```text
logs\console.log
```

The same framework messages still go to the normal console when Stats is launched interactively. The file includes application startup/shutdown messages, HTTP request routing/status/timing messages, warnings, errors, and exceptions emitted through the normal .NET logging pipeline.

Only one log file is kept. When `logs\console.log` would exceed 10 MiB, Stats truncates that same file and continues writing from the beginning instead of creating rotated backup files. The `logs/` directory is ignored by Git.

Sensitive first-run authentication material is intentionally excluded from file logging. In particular, the one-time TaskList Stats setup token is still printed directly to the interactive server console and is not sent through the file logger. Passwords are not logged.

Task Scheduler can therefore launch `TaskListStats.exe` directly rather than using `cmd.exe` only for output redirection.

## Themes

Use **View → Theme** to choose **Light** or **Dark**. The selection persists in browser storage and applies to the Stats workspace and login/setup UI.

The dark theme keeps the Windows 95 raised/recessed look instead of replacing it with a generic flat theme. Canvas charts read theme-aware colors and redraw appropriately.

There is intentionally no automatic **System** theme; theme selection is strictly Light or Dark.

## Table readability and row hover

Tables use 14px text, a 1.45 line height, and larger cell padding across all tabs. Activity Session rows and Compare's custom table layout use matching spacing.

**File → Highlight rows on hover** is a square checkbox enabled by default. Clicking it toggles the setting and dismisses the File menu, just like selecting an option in View. Its setting is saved per browser. When enabled, table body rows highlight using the same Light/Dark colors as TaskList; headers, statistic cards, heatmap cells, and Milestones tiles are unaffected. Hover follows actual mouse/trackpad pointer movement, including over links and buttons inside rows and on touchscreen laptops. Moving outside a row, leaving the page, disabling the option, or using touch/pen input clears the highlight. Synthetic mouse events after touch are briefly suppressed. Theme styles load directly with the page, using the same stylesheet loading approach as TaskList.

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

Created / Completed / Cancelled history, approximate backlog history, busiest months, and completion-speed months. The Calendar Month × Year Heatmap provides the cross-year monthly comparison.

The backlog chart remains approximate because it reconstructs older state from timestamps stored on current task rows.

### Calendar

- Year Activity Heatmap with Created / Completed / Cancelled / Reopened / All activity modes
- typed Month Detail using `m/yy` or `m/yyyy`
- Month Calendar with three-letter weekday headings
- Month × Year Heatmap with its own Created / Completed / Cancelled / Reopened / All activity selector
- seasonality chart
- clickable days that open the exact Created / Completed / Cancelled tasks for that date

Only Calendar days with entries in the selected list scope are clickable. Day drill-down only renders event categories that actually contain tasks for the selected day. Empty categories are omitted instead of showing placeholder boxes, and days without entries do not open a dialog.

Every heatmap uses the same event choices and defaults to Created. Each selection is independent: the Year Activity and Month × Year heatmaps can show different event types. All activity sums the available Created, Completed, Cancelled, and Reopened timestamps, so one task can contribute more than once. These heatmaps use timestamps from the current snapshot, including the existing current-status rules for Completed and Cancelled, without loading event history. The Month × Year rows follow the years present in the selected event timestamps, including years with completions or reopens but no creations. It shows all represented years, not only the current year; a new year appears automatically once the selected event type has timestamps in that year.

### Lists

Per-list current counts, completion percentage, completion duration, share of current entries, and most-active-list-by-month history.

### Patterns

Day-of-week and hour-of-day creation/completion charts, weekday × hour heatmap, Workload Rhythm, and Exam / Test Windows.

The Weekday × Hour Heatmap has the same independent Created / Completed / Cancelled / Reopened / All activity dropdown as both Calendar heatmaps. It includes only confirmed clock times for the selected events; date-only values contribute to the Calendar heatmaps but never become artificial midnight activity in the hour heatmap.

The heatmap uses compact 22px-high rows, saving vertical space while keeping the same hour-column widths, labels, and count text size.

Workload Rhythm includes busiest creation weekday/hour and busiest completion weekday/hour using the same populations as the corresponding Patterns charts.

### Trees & Titles

Nesting depth, largest task trees, deepest tasks, title categories, common words, and reopened tasks.

### Task Flow

Chronological event history with one compact typed date-range field, event type, ordering, text/list/ID filtering, status transitions, and TaskList deep links. Ranges use the same `10/3 - 10/8` style as TaskList Search, with `m/d`, `m/d/yy`, or `m/d/yyyy` accepted on either side.

Without a date range, undated events remain visible as “Unknown” after dated rows in either sort direction. Choosing an explicit range excludes events that cannot be placed in that range. Moving tasks preserves their original event attribution; historical task links follow the permanent Universal ID to the current list and visible number.

Created events display as `Created → Open` rather than showing a missing previous status, while normal state changes continue to display their actual transitions.

On roomy desktop windows, the Task Flow table fills the space below its controls and scrolls inside that space. Laptop, short, and narrow windows scroll the workspace instead, letting the controls move out of the way and keeping the table at its natural height. Horizontal table scrolling remains available, and the status bar stays visible.

### Compare

Compare either two list scopes or two date ranges. Time-period mode uses one compact typed range for Period A and one for Period B. The Difference section reports `A - B` for the same metrics.

Net recorded open flow follows actual status transitions: deleting an Open task reduces it, while Done → Cancelled and Cancelled → Done leave it unchanged. Legacy reconstructed closing transitions use their recorded/inferred Open origin. This measures recorded flow; current item counts remain a separate measure, particularly after moves or gaps in historical tracking.

### Activity Sessions

Groups timestamped events into inferred sessions using a 15-, 30-, or 60-minute maximum gap. This is an inference from event timing, not a time tracker.

Session rows show their event mix. Click the event count to open the session's events newest first, matching the session list. Events at the same timestamp use descending event ID as a stable tie-breaker. The detail view sorts a copy; session grouping and start/end times remain based on chronological event order.

On roomy desktop windows, Recent Inferred Sessions fits the space below the controls and summary cards, with scrolling inside the list. On laptop and mobile layouts, the list grows naturally and shares the workspace scrollbar with its controls and cards, avoiding a tiny list with a second vertical scrollbar. Both this view and Task Flow use the fitted layout only when the viewport is wider than 780px and taller than 800px; browser zoom and display scaling affect the available viewport.

All dialog buttons use shared footer spacing of 6px above and below. Activity Session and Calendar retain their lower OK placement, including when content scrolls, and Help uses the same default.

### Milestones

Milestones are calculated automatically from the available event history. Current milestone families include:

- global Created / Completed / Cancelled / Reopened / Deleted thresholds at 1, 100, 500, 1,000, 2,000, 3,000, 5,000, and 10,000, then every 500 events (10,500, 11,000, 11,500, ...)
- overall recorded-event thresholds on the same global schedule, continuing every 500 events after 10,000
- Universal ID milestones at #1, #100, #500, #1,000, #2,000, #2,500, #3,000, #5,000, and #10,000, then every 500 IDs (#10,500, #11,000, #11,500, ...)
- per-list creation/completion thresholds at 100, 500, 1,000, 2,000, and 5,000, then every 500 events (5,500, 6,000, 6,500, ...)
- yearly first creation/completion plus 100, 500, 1,000, and 2,000 round-number thresholds, then every 500 events within that year (2,500, 3,000, 3,500, ...)

The permanent Milestones timeline is computed from event history and is independent of TaskList's live notification queue. It remains available whether or not a popup has been displayed. Stats never claims or displays celebration dialogs or confetti; live celebrations belong exclusively to TaskList.

Global/list/recorded-event milestones include undated records and identify the threshold-crossing event by event-record order, matching TL's counter increments. Backdated imports therefore count without pretending they were inserted earlier. A milestone with no usable timestamp shows “Unknown date” and appears in an Unknown date section for Chronological/Year grouping. Yearly event milestones require valid dates and use UTC years for timestamps; date-only imports use their written year. Calendar charts and displayed event times keep their normal local-time presentation. Universal-ID milestones can also show unknown dates when the creation record is undated.

Milestones have a **Sort by** dropdown with Chronological, Year, Type, and List choices. It uses the same selected-circle indicator as View and closes after choosing an option. Chronological is the default and keeps month-and-year sections, such as October 2026, newest first. Year groups by the year earned, newest first. Type groups Created, Completed, Cancelled, Reopened, Deleted, Recorded events, and Universal ID milestones separately. Within each type, Overall milestones come first, followed by separate year sections (newest year first), then separate list sections (alphabetically). Milestones progress from the smallest threshold to the largest within each of those sections, including milestones with unknown dates. Tile titles omit the year/list prefix already supplied by the section heading. List groups by the list attached to the event that earned the milestone, alphabetically. Chronological, Year, and List keep milestones newest first within each group. Sorting respects the selected list scope and shows only groups containing milestones.

Milestone tiles are square by default and capped at 320px wide, so a single milestone stays compact instead of filling the month section. Tiles shrink on narrow screens and can grow taller for long content. Titles use 22px text, task details use 18px, and timestamps use 16px; titles and timestamps are stacked for easier reading.

Each tile has a 72px icon directly beneath its title: a document with a plus for Created, a checked box for Completed, a circled X for Cancelled, a return arrow for Reopened, a trash bin for Deleted, a history list with a clock for Recorded events, and a hash mark for Universal ID. Icons match the title color in Light/Dark themes and use inline SVG, so they need no image-file downloads. The milestone view and SVG definitions load together only when the Milestones tab is first opened; subsequent visits reuse the loaded module. Decorative icons are excluded from screen-reader and keyboard navigation.

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

TaskList v1.5 introduced an append-only `task_events` history log. Created, Completed, Cancelled, and Reopened transitions are stored individually as they happen. TaskList v1.5.10 adds Deleted events, including the task's status immediately before deletion.

For older task data, TaskList reconstructs event rows from timestamps it already had. That older reconstruction can be incomplete when a task changed state repeatedly before the event log existed. Because older TaskList versions did not store deletion timestamps, tasks deleted before v1.5.10 cannot be given a trustworthy historical Deleted event.

TaskList v1.5.24 and newer save list names at deletion. Stats reads this optional `deleted_lists` history without writing to TaskList's database and labels saved names “(deleted)” across historical views. Lists deleted before name preservation show “Deleted list #ID (name unavailable)” because their original names cannot be recovered. Older databases remain supported, and deleted lists are not added to current-list counts or selectors.

The Stats **Help** button opens About immediately, matching TaskList. Its wide, rectangular dialog uses 16px text for the event-history explanation and places about.lehighradio.com above the application/version label at the bottom, as TaskList does. The event-history paragraph explains missing dates, unavailable list names, and older history.

## Exporting a snapshot

Use **File → Export snapshot JSON...** to download the snapshot loaded by Stats.

Treat exports as private because they can contain task titles, descriptions, list names, IDs, statuses, timestamps, and event history.

## PWA behavior

The service worker caches the application shell, shared theme assets, and login/setup assets; uses network-first `cache: 'no-store'` behavior for current same-origin static assets; always fetches `/api/*` from the network; and uses cached files only as an offline fallback.

The cache name is stable rather than release-numbered. Successful online asset loads replace the cached copy, so normal frontend updates do not require duplicated version strings in asset URLs or cache names. On activation, obsolete files are removed from the stable shell cache, including the retired milestone popup assets. The shell cache does not contain the live TaskList snapshot. The on-demand milestones.js module is excluded from installation precaching, cached after its first use, and retained during cache cleanup for later offline visits.

## Security and privacy

Recommended deployment:

- use HTTPS across untrusted networks
- prefer LAN, VPN, or a private reverse proxy
- firewall Stats to networks/devices that need it
- keep `data/auth.json`, the TaskList database, and exported snapshots private
- give the Stats service account only the filesystem permissions it needs

Important distinctions:

- **TaskList database:** all connections use read-only SQLite mode with `PRAGMA query_only`; Stats does not edit task/history data or notification state.
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

### Task-ID links open the wrong TaskList server

Change `TASKLIST_ORIGIN` in `wwwroot/app.js`.

### Statistics differ from what you expected

Check the selected list scope, task vs subtask expectations, date-only vs full timestamp history, current status vs preserved old terminal timestamps, and whether the value comes from event history or approximate backlog reconstruction.

## Development checks

Run `node tests/frontend.test.cjs` for frontend regression tests using the actual JavaScript and disposable DOM fixtures. Coverage includes all 11 workspaces in multiple scopes, moved/renamed/deleted-list identities, undated events, milestone groups and threshold attribution, status-flow counts, year boundaries, and concurrent snapshot/history refreshes. The neighboring TaskList checkout also has SQL integrity and cross-app milestone parity tests; see its [audit coverage](https://github.com/RotatingWires/task-list/blob/main/tests/AUDIT.md). Node is only needed for these tests, not to run Stats.

Optional browser layout checks use Python and Playwright with Firefox installed: `python3 tests/browser_layout.py`. The checks run the actual frontend with synthetic API data across nine viewport sizes in both themes. They verify that roomy desktop windows fit both lists above the status bar, while laptop/mobile layouts use the workspace as their only vertical scroller and let the lists fill the visible area after scrolling past the controls. Use `--browser chromium` or `--browser webkit` to select another installed Playwright browser. These are development tools only.

## Current release: v2.1.26

### v2.1.26

- Open Calendar day details only when the selected day has entries in the current list scope; empty days no longer open an empty dialog.
- Limit the calendar pointer and hover outline to days with entries, and cover empty, populated, and list-filtered days with frontend regression tests.

### v2.1.25

- Match TaskList's title-bar height, insets, typography, centered context, and decorative window symbols on desktop and mobile.
- Keep the list scope visible on narrow screens, truncate long title labels within their columns, and remove redundant login-title overrides.

### v2.1.24

- Shorten the Patterns weekday × hour heatmap rows from 34px to 22px, reducing the page height by 84px while retaining the existing label/count text sizes and column widths.

### v2.1.23

- Keep Task Flow and Activity Sessions flowing with the workspace on laptop, short, and narrow viewports, removing tiny nested vertical scroll areas.
- Preserve fitted lists and the fixed status bar on roomy desktop windows, and keep horizontal table scrolling available.
- Add browser regression checks for the scrolling behavior across laptop/mobile/desktop sizes and both themes.

### v2.1.22

- Size Task Flow and Recent Inferred Sessions from the remaining workspace height, replacing their shared viewport-height cap.
- Let Task Flow use the space above the status bar and keep Activity Sessions scrolling inside its list on desktop/laptop screens; retain workspace scrolling when narrow or short screens need it.

### v2.1.21

- Organize Type-sorted milestones into Overall, individual year, and individual list sections, with thresholds in ascending order.
- Shorten Type-view tile titles by removing the year/list prefix repeated in the section heading; preserve other sorts and milestone calculations.

### v2.1.20

- Clarify in Help that dates marked “Unknown” may come from tasks imported from another application; keep the event-history explanation in one paragraph.

### v2.1.19

- Include undated events in global/list milestone counts and all-time Task Flow, with explicit unknown dates and safe grouping/sorting.
- Match TL's milestone event-record ordering and UTC yearly counters, including backdated imports; avoid argument-limit failures on large UID histories.
- Correct net open-flow counts for closed-to-closed transitions and deletion of open tasks; reject invalid ISO calendar dates.
- Include TL's restore revision in history cursors, keep each database read consistent, and prevent overlapping refreshes from mixing snapshots or event caches.
- Add frontend regression coverage across workspaces, scopes, histories, dates, identity changes, and asynchronous refreshes.

### v2.1.18

- Document every HTTP endpoint, cookie authentication, snapshot fields, incremental event cursors, error responses, and browser routes.
- Update project/frontend version metadata; preserve read-only TaskList access.

### v2.1.17

- Show preserved deleted list names in Task Flow, Activity Sessions, and milestone history with a “(deleted)” label.
- Mark older deleted list names as unavailable rather than substituting a generic current-list name.
- Explain deleted list-name availability in About alongside the existing date/history limitations.
- Read the optional name-history table without changing the read-only connection or lazy event loading; support older TaskList databases.
- Update project/frontend version metadata and documentation to v2.1.17.

### v2.1.16

- Make lower dialog buttons the shared default using 6px top/bottom footer padding, preserving the standard footer height.
- Remove Activity Session and Calendar button transforms; preserve their existing lower placement through shared layout and apply that spacing to Help.
- Keep content scrolling, title/footer placement, dialog actions, lazy event/milestone loading, and read-only database behavior.
- Update release metadata/documentation to v2.1.16.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.1.15

- Combine the Help event-history explanation into one paragraph without removing its content.
- Rename Task Flow throughout the tab, navigation, renderer, control IDs, CSS, Help, and documentation; remove the former internal feature names.
- Read View navigation labels from the existing tab buttons instead of maintaining a duplicate label list.
- Reuse the owning radio-menu button helper for single-select dropdowns, remove its unused value argument, and derive Task Flow event choices from the shared event-type constants.
- Preserve lazy/incremental event loading, deferred milestone code/icons, read-only database access, sorting, filtering, and touch-aware row hover.
- Cleanup audit found no other safely removable source files or unused frontend functions; retain necessary migration/compatibility behavior.
- Update release metadata/documentation to v2.1.15.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.1.14

- Make Help open About directly, deleting the old second-level Help menu, its event handler, and its CSS.
- Match TaskList's About layout with a wide rectangular dialog, readable 16px event-history paragraphs, and about.lehighradio.com followed by the application/version label at the bottom.
- Remove the chart-library/ORM/read-only implementation paragraph from Help; target the dedicated version span so the event-history heading remains intact.
- Size shared single-select menus to their options and wrap long labels within the viewport, fixing Chronological truncation when Year is selected.
- Increase milestone titles to 22px, details to 18px, timestamps to 16px, and group headings to 18px while retaining content-based tile growth.
- Move milestone computation, grouping, rendering, and SVG definitions into one dynamically imported module loaded only when the Milestones tab opens. Remove their original eager definitions and event handler.
- Cache the milestone module after first use without including it in installation precaching; retain it during service-worker cache cleanup.
- Update release metadata/documentation to v2.1.14.

### v2.1.13

- Add a distinct inline SVG icon for each of the seven milestone types, directly below the tile title and above its timestamp.
- Render icons at 72px using the title's Light/Dark color, with matching rounded strokes and no external assets or dependencies.
- Keep icons decorative and unfocusable while preserving milestone text, sorting, square tile sizing, and event attribution.
- Update release metadata/documentation to v2.1.13.

### v2.1.12

- Add a Milestones Sort by dropdown with Chronological, Year, Type, and List, reusing the shared radio-menu dropdown and View-style circle indicator.
- Keep Chronological's existing newest-first month sections; add newest-first year sections, separate milestone-type sections, and alphabetical list sections, with newest-first tiles within every group.
- Add explicit milestone type metadata so Recorded events and Universal ID milestones keep their own groups instead of inheriting the triggering task event's type.
- Replace month-only rendering and CSS names with one grouped renderer while preserving square tiles, larger text, list scope, thresholds, and unavailable-history handling.
- Update release metadata/documentation to v2.1.12.

### v2.1.11

- Continue all milestone families every 500 after their existing early thresholds: global events/recorded events/Universal IDs after 10,000, per-list events after 5,000, and yearly events after 2,000.
- Derive continuation starts from the final base threshold and remove the old 5,000-step start argument and call-site overrides.
- Match TaskList v1.5.19 notification schedules while retaining all existing early thresholds, event/list/year scope, chronological computation, and milestone tile grouping.
- Show newly qualifying historical milestones in Stats; TaskList preserves its existing-history baseline and only celebrates future qualifying inserts.
- Update release metadata/documentation to v2.1.11.

### v2.1.10

- Replace stretching milestone grid columns with compact columns capped at 320px, including months with only one milestone.
- Make milestone tiles square by default, with room to grow vertically for long content and shrink to fit narrow screens.
- Stack milestone titles and timestamps; increase title text to 18px, task details to 16px, and timestamps to 14px with more padding and spacing.
- Increase month headings to 16px and remove superseded mobile overrides for the old milestone layout.
- Update release metadata/documentation to v2.1.10.

### v2.1.9

- Move the Activity Session event dialog's OK button down 6px, matching Calendar, without shifting the event list or changing its scrolling area.
- Replace the flat Milestones timeline with month-and-year sections, newest month first and newest milestones first within each section.
- Group by the event's local calendar month, preserving all milestone families, list scope, date-only display, and stable event/label tie-breakers.
- Move the responsive tile grid into each month section and remove obsolete flat-grid styling.
- Update release metadata/documentation to v2.1.9.

### v2.1.8

- Dismiss the File menu after toggling Highlight rows on hover, matching View-menu selection behavior.
- Show the hover option as a square checkbox with a checkmark when enabled and an empty box when disabled; use the menu's text color in both themes and on hover/focus.
- Restrict selection dots to radio menu items, preserving View and dropdown selections and list-filter checkmarks.
- Preserve saved hover preferences and the working pointer-based row highlighting.
- Update release metadata/documentation to v2.1.8.

### v2.1.7

- Fix table row hover by tracking mouse/trackpad pointer movement directly, including links and buttons inside rows, instead of gating CSS :hover on a separate mouse-capability class.
- Clear row highlighting when leaving rows/the page, disabling the checkbox, or using touch/pen input; preserve the saved setting and synthetic-mouse suppression.
- Load theme.css directly in both application and login pages, matching TaskList, and delete the obsolete dynamic stylesheet loader and readiness waits.
- Remove the period from File → Highlight rows on hover.
- Verify that the redundant Trends monthly year comparison markup, renderer, and call sites remain fully removed; Calendar retains the Month × Year Heatmap.
- Preserve TaskList's Light/Dark hover colors, table readability improvements, and newest-first session detail order.
- Update release metadata/documentation to v2.1.7.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.1.6

- Show Activity Session detail events newest first, with descending event ID for equal timestamps, while preserving session inference and time ranges.
- Add a saved File-menu checkbox for table row hover, enabled by default, using TaskList's Light/Dark hover colors.
- Detect actual mouse movement and clear hover mode on touch instead of relying on pointer-capability media queries.
- Increase table text size, line height, and cell spacing, including custom Session and Compare rows; leave Milestones tiles and other cards unchanged.
- Remove the redundant Trends Year-Over-Year Monthly Comparison markup and renderer because Calendar's Month × Year Heatmap already shows all represented years.
- Remove Fun's redundant table-size overrides now covered by the shared table styles.
- Update release metadata/documentation to v2.1.6.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.1.5

- Give Year Activity, Month × Year, and Weekday × Hour heatmaps the same Created / Completed / Cancelled / Reopened / All activity choices through one shared option list.
- Add an independent event dropdown to Month × Year and remove the fixed Created Tasks title suffix.
- Expand Weekday × Hour beyond Created/Completed while preserving exclusion of date-only timestamps.
- Share timestamp selection across all heatmaps and derive Month × Year rows from the selected event years.
- Preserve current-status semantics, list scope, and existing lazy event-history loading.
- Update release metadata/documentation to v2.1.5.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.1.4

- Make all TaskList database access read-only by removing the shared milestone acknowledgement endpoint and its read/write connection path.
- Remove live celebration JavaScript/CSS, the startup import, and popup entries from the PWA shell; purge obsolete cached assets on activation.
- Preserve the permanent analytical Milestones tab, its historical threshold families, and the existing lazy/incremental event-history loading behavior.
- Remove TaskList database write-permission requirements and obsolete popup troubleshooting; keep Stats-owned authentication/log storage documented separately.
- Update About text and release metadata/documentation to v2.1.4.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.1.3

- Make `TaskListStats.csproj`'s single `<Version>` property the only manually maintained runtime release number; let the .NET SDK derive assembly/file/informational versions from it.
- Remove release-number query strings from JavaScript and dynamic milestone imports so individual frontend assets no longer need manual version bumps.
- Replace the per-release service-worker cache name with a stable shell cache and force network-first static requests to bypass the browser HTTP cache before refreshing the offline copy.
- Keep `version.json` generated from the authoritative project version during build for the browser release label.
- Remove remaining duplicate README release headings.
- Update release metadata/documentation to v2.1.3.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.1.2

- Consolidate normal read-only SQLite connection creation and PRAGMA setup into one helper shared by snapshot and event-history endpoints.
- Consolidate task_events availability detection so both endpoints use one schema-check path.
- Normalize versioned frontend/PWA asset references to v2.1.2 instead of carrying mixed historical cache-busting values.
- Remove duplicate release-history headings introduced by earlier README updates.
- Keep the existing purpose-based frontend modules; the cleanup audit found no unreferenced JavaScript functions or safely removable source/runtime files.
- Update project/frontend metadata to v2.1.2.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.1.1

- Clarify Task Flow's description that every recorded event is displayed on its own row so each event's timestamp can be seen individually.
- Advance project/frontend version metadata and the PWA shell cache to v2.1.1.

### v2.1.0

- Add incremental event-history refreshes on top of the v2.0.19 lazy-loading path.
- Keep already-loaded event history in browser memory across normal Stats Refresh operations instead of discarding and downloading it again.
- Extend `/api/events` with an `afterId` cursor path so refreshes transfer only newly appended `task_events` rows.
- Validate an opaque SHA-256 cursor derived from the last cached event before accepting an incremental continuation.
- Automatically fall back to a full event-history replacement in the same response if the TaskList database was restored, replaced, truncated, or the cached cursor no longer matches.
- Keep the normal startup snapshot free of event-history rows, and continue loading history only for Task Flow, Compare, Activity Sessions, Milestones, or snapshot export.
- Keep event caching memory-only; a full page/browser restart still starts clean and performs one lazy full-history load when needed.
- Cache-bust the changed app/UI scripts and advance the PWA shell cache.
- Update project/frontend metadata and documentation to v2.1.0.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.0.19

- Remove the full `task_events` scan and event-history payload from the normal `/api/snapshot` startup path.
- Add an authenticated read-only `/api/events` endpoint and load event history only when Task Flow, Compare, Activity Sessions, Milestones, or snapshot export needs it.
- Reuse the loaded event array in browser memory instead of fetching it again while the current snapshot remains active.
- Reset lazy event state on Refresh so event-dependent views reload history against the newly refreshed current snapshot.
- Keep all normal Stats database access read-only and preserve the separate narrow milestone acknowledgement write path.
- Update UI status text so unloaded history is shown as on-demand rather than incorrectly reporting zero events.
- Cache-bust the changed app/analysis/UI scripts and advance the PWA shell cache.
- Update project/frontend version metadata to v2.0.19.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.0.18

- Add native single-file runtime logging at `logs/console.log` while preserving the normal interactive console output.
- Capture the ASP.NET/.NET logging pipeline, including startup/shutdown, request status/timing, warnings, errors, and exceptions, without requiring a `cmd.exe` redirection wrapper.
- Keep exactly one log file: when it would exceed 10 MiB, truncate that same file and continue writing rather than creating rotated copies.
- Keep the one-time TaskList Stats setup token console-only so sensitive setup material is not persisted in the runtime log.
- Ignore the runtime `logs/` directory in Git and document logging behavior, retention, and Task Scheduler use.
- Update project/frontend version metadata to v2.0.18.
- Add no monkey patches or new runtime/frontend dependencies.

### v2.0.17

- Fix Stats milestone acknowledgement returning 503 / SQLite Error 8 when a read-only shared-cache connection had already opened the TaskList database.
- Change normal read-only snapshot connections from SQLite shared cache to private cache.
- Open milestone acknowledgement with a fresh non-pooled private read/write connection and explicitly clear query_only before the narrow viewed-state update.
- Preserve read-only behavior for every normal Stats snapshot/query and keep the only write limited to milestone acknowledgement state.
- Update project/frontend version metadata and README documentation to v2.0.17.
- Add no monkey patches, frontend libraries, or runtime dependencies.

### v2.0.16

- Add Deleted as a first-class event throughout Task Flow and event-based analysis for TaskList v1.5.10+ databases.
- Add Deleted to the Task Flow event filter and display transitions such as Open → Deleted, Done → Deleted, or Cancelled → Deleted.
- Keep deleted task IDs non-clickable when the current item no longer exists while preserving their list/display ID, title snapshot, Universal ID, and event history.
- Add Deleted counts to Compare and the Milestones summary, and include Deleted in the global permanent milestone family.
- Teach the shared milestone celebration dialog how to label Deleted milestones rather than treating an unknown event kind as a Universal-ID milestone.
- Document that pre-v1.5.10 deletions cannot be reconstructed because no trustworthy historical deletion time was stored.
- Cache-bust changed analysis/UI/milestone assets and update project/frontend metadata to v2.0.16.
- Add no monkey patches, frontend libraries, or runtime dependencies.

### v2.0.15

- Expand shared celebration popups to the same milestone families shown in the permanent Milestones timeline.
- Support global Created / Completed / Cancelled / Reopened, overall recorded-event, Universal-ID, per-list Created / Completed, and yearly Created / Completed notifications.
- Allow the continuing milestone families to keep celebrating every 5,000 instead of stopping permanently.
- Display list/year context in the shared milestone dialog and bundle simultaneous milestones into one confetti celebration.
- Remain compatible with the older v1.5.5 TaskList notification schema when Stats is updated before TaskList.
- Keep normal statistics reads read-only; Stats still only writes milestone acknowledgement state.
- Update project/frontend versions and documentation to v2.0.15.
- Add no monkey patches, frontend libraries, or runtime dependencies.

### v2.0.14

- Keep per-list Created and Completed milestones going every 5,000 events after the existing 5,000 threshold.
- Keep each year's Created and Completed milestones going at 5,000-event intervals after the existing First/100/500/1,000/2,000 thresholds.
- Preserve the existing early per-list and yearly milestones while removing their hard upper ceilings.
- Reuse the same generated-threshold helper as the global event and Universal-ID milestone series instead of hardcoding future limits.
- Keep these as permanent Stats milestones only; shared celebration-notification thresholds are unchanged.
- Add no monkey patches, frontend libraries, or runtime dependencies.

### v2.0.13

- Keep global Created, Completed, Cancelled, Reopened, and overall recorded-event milestones going every 5,000 events after 10,000 instead of ending permanently.
- Keep Universal-ID milestones going every 5,000 IDs after #10,000.
- Preserve the existing early milestone thresholds before 10,000.
- Leave per-list and yearly milestone schedules unchanged so their scoped timelines do not become excessively noisy.
- Keep permanent Stats milestones separate from the shared celebration-notification threshold set.
- Add no monkey patches, frontend libraries, or runtime dependencies.

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

- Replace separate From/To fields in Task Flow and Compare with compact typed date-range controls.

### v2.0.7 / v2.0.6

- Return Calendar Month Detail to one typed `m/yy` / `m/yyyy` field.
- Add Universal-ID, per-list, and yearly milestone families.
- Consolidate Calendar drill-down into the normal History/analysis modules and remove redundant release-specific files.

### v2.0.x highlights

- Add Task Flow, Compare, Activity Sessions, Milestones, Calendar drill-down, responsive analysis controls, improved chart tooltips, and the current Fun workspace.
- Remove retired Search / Explorer, Flow, Insights, Ancient Task, and Task Graveyard features from the actual source instead of merely hiding them.

Earlier release-by-release details remain available in Git commit history.

## Development philosophy

- keep the source tree small
- prefer normal source edits over version-specific patch files
- do not monkey-patch or reassign existing functions to bolt on release behavior
- remove retired features from markup, code, styles, and dependencies instead of merely hiding them
- keep TaskList authoritative and all Stats access to its database read-only
- preserve timestamp precision instead of inventing data
- keep controls consistent across desktop and mobile
- use boring, understandable browser/.NET features before adding dependencies
