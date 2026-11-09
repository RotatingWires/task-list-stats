> [!WARNING]
> This project is fully vibecoded, probably inefficient, but it does what I wanted lol

# TaskList Stats v2.2.42

**TaskList Stats** is a separate statistics app with Task Flow for the self-hosted **TaskList** database.

TaskList stays focused on creating and managing tasks. TaskList Stats reads the same SQLite database and provides charts, records, calendars, hierarchy analysis, event history, comparisons, inferred activity sessions, milestones, and Fun views without adding that weight to the main TaskList app.

All TaskList database access is read-only, using private SQLite page caches. Stats does not edit tasks, lists, task events, statuses, Universal IDs, or notification state. Live milestone dialogs and confetti belong exclusively to TaskList; Stats keeps the permanent analytical Milestones tab.

The interface uses the same Windows 95-style visual language as TaskList, includes persistent **Light** and **Dark** themes, includes TaskList-style first-run password setup/login, works on desktop and mobile, and can be installed as a PWA.

- [What it does](#what-it-does)
- [Technology stack](#technology-stack)
- [Project layout](#project-layout)
- [Version handling](#version-handling)
- [Configuration and running](#configuration-and-running)
- [Runtime logging](#runtime-logging)
- [Authentication](#authentication)
- [Themes](#themes)
- [TaskList database access](#tasklist-database-access)
- [Table readability and row hover](#table-readability-and-row-hover)
- [TaskList deep links](#tasklist-deep-links)
- [Statistics sections](#statistics-sections)
- [List filtering](#list-filtering)
- [Timestamp precision rules](#timestamp-precision-rules)
- [Current-status semantics](#current-status-semantics)
- [Event history and older data](#event-history-and-older-data)
- [Import and export](#import-and-export)
- [HTTP API](#http-api)
- [Home screen and PWA](#home-screen-and-pwa)
- [Security and privacy](#security-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Development checks](#development-checks)
- [Development philosophy](#development-philosophy)
- [Release notes](#release-notes)

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

## Technology stack

- C# / ASP.NET Core Minimal API
- .NET 10
- Kestrel
- SQLite through `Microsoft.Data.Sqlite`
- Plain HTML, CSS, and JavaScript
- Browser Canvas API for charts
- Web manifest for adding to a phone's home screen (no offline copy, like NewsReview)
- No ORM
- No frontend framework
- No chart library
- No Node/npm build step

The frontend is plain HTML, CSS, and JavaScript modules (`<script type="module">`) with no build step, the same in all four apps. Two small files stay classic scripts and are the same word for word in every app: `theme.js`, which has to run before the page draws so it never flashes the wrong theme, and `dropdown.js`.

## Project layout

The source tree intentionally stays small. Behavior belongs in normal purpose-based modules; there are no release-specific override or monkey-patch files.

```text
TaskListStats.csproj      .NET project, dependencies, and release version
src/
  Program.cs              startup, middleware, sign-in endpoints, and API routes
  Store.cs                read-only TaskList database reader: snapshot, event history pages, connections (like the other apps' Store.cs)
  SingleFileLogger.cs     capped single-file runtime log writer
  PasswordAuth.cs         setup token, password file, and sign-in cookie (the same file in all four apps)
appsettings.json          database path, listen address, and log level
deploy/taskliststats.service
                          example systemd unit
README.md                 setup, behavior, security, and release documentation

data/                     runtime-created private Stats data (ignored by Git)
  auth.json               salted password hash after first-run setup
  keys/                   sign-in cookie keys when there is no Windows profile key ring (Linux, Task Scheduler)

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
  style.css               base Windows 95-style UI and responsive layout (colors from theme.css)
  theme.css               Light/Dark color tokens; the only file with color values
  analysis-tabs.css       analysis, milestone/session, and Calendar-dialog styles
  login.html              login / first-run setup page
  login.js                login, setup-token, and return-URL behavior
  auth.css                login/setup styling
  version.json            frontend release version regenerated from TaskListStats.csproj during build
  manifest.webmanifest    installable-PWA metadata
  sw.js                   removes the offline cache earlier releases installed
  icons/                  favicon.svg, favicon.ico, and touch-180/192/512.png, the same names in every app
```

## Version handling

`TaskListStats.csproj` contains the single authoritative application version in its `<Version>` property. The .NET SDK derives the assembly/file/informational versions from that value, so they are not repeated as separate manually maintained properties.

The build target regenerates `wwwroot/version.json` from `$(Version)` for the browser's release label. It rewrites the file only when the version changes, so building does not leave the committed copy modified. The running server assembly version remains available through the auth/snapshot APIs as a fallback.

Frontend asset URLs carry no release-number query strings. The server marks pages and scripts `Cache-Control: no-cache`, so the browser checks each with the server on every load and always runs the current release.

## Configuration and running

Server requirements:

- .NET 10 SDK/runtime
- a TaskList `tasklist.db` SQLite database
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
    "DatabasePath": "/srv/task-list/data/tasklist.db"
  }
}
```

`TASKLIST_DB_PATH` overrides the database path:

```bash
export TASKLIST_DB_PATH=/srv/task-list/data/tasklist.db
```

Without configuration, Stats listens on loopback only, at `http://127.0.0.1:8712`, matching TaskList's `http://127.0.0.1:8711`. To choose another address, pass `--urls` (or set the standard `ASPNETCORE_URLS` environment variable). For example, to accept LAN connections:

```bash
dotnet run --urls "http://0.0.0.0:8712"
```

When Task Scheduler launches `TaskListStats.exe` directly, add the same `--urls "http://0.0.0.0:8712"` argument if other devices need to connect. The former `ListenUrl` setting and `TASKLIST_STATS_URL` variable are no longer read.

TaskList before v1.7.22 named its database `task-list.db`. Stats accepts either name in the configured folder, so an older path setting keeps working after TaskList renames the file.

Stats keeps its own password and sign-in keys in `data/`. To keep them elsewhere, pass `--data-dir`, set `TaskListStats:DataDirectory`, or set `TASKLISTSTATS_DATA_DIR`.

| Environment variable | Purpose |
| --- | --- |
| `TASKLISTSTATS_DATA_DIR` | Stats' own data folder, overridden by `--data-dir` |
| `TASKLIST_DB_PATH` | TaskList's database, overriding `TaskListStats:DatabasePath` |
| `ASPNETCORE_URLS` | Listening address, like `--urls`; default `http://127.0.0.1:8712` |

| Command-line option | Purpose |
| --- | --- |
| `--urls URL` | Listening address, for example `http://0.0.0.0:8712` for LAN access |
| `--data-dir PATH` | Data folder (Stats' password and sign-in keys) |
| `--version` | Print the version and exit |

### Run as a Linux service

`deploy/taskliststats.service` is a systemd template, not an installer, like NewsReview's: build with `dotnet publish -c Release -o /opt/taskliststats`, create the service account, `/var/lib/taskliststats` (the data folder) and `/opt/taskliststats/logs`, adjust `User`, `WorkingDirectory`, `ExecStart`, and `ReadWritePaths` to match, then install and enable it. It listens on loopback at port 8712; change its `--urls` for LAN access, and find the first-run setup token in the journal. It runs as TaskList's `tasklist` account so it can read `/var/lib/tasklist/tasklist.db`, which its `ExecStart` passes as `--TaskListStats:DatabasePath`.

`appsettings.json` holds the default listen address (`Urls`) and log level, the same keys in every app. `--urls` and `ASPNETCORE_URLS` override it.

## Runtime logging

TaskList Stats writes its normal ASP.NET/runtime log stream to:

```text
logs\console.log
```

The same framework messages still go to the normal console when Stats is launched interactively. The file includes application startup/shutdown messages, HTTP request routing/status/timing messages, warnings, errors, and exceptions emitted through the normal .NET logging pipeline.

Only one log file is kept. When `logs\console.log` would exceed 10 MiB, Stats truncates that same file and continues writing from the beginning instead of creating rotated backup files. The `logs/` directory is ignored by Git.

Sensitive first-run authentication material is intentionally excluded from file logging. In particular, the one-time TaskList Stats setup token is still printed directly to the interactive server console and is not sent through the file logger. Passwords are not logged.

Task Scheduler can therefore launch `TaskListStats.exe` directly rather than using `cmd.exe` only for output redirection.

## Authentication

On first run, if `data/auth.json` does not exist, the server prints a setup token. Open Stats, enter that token, choose a password of at least 8 characters, and confirm it.

The plaintext password is never stored. `auth.json` contains a random salt and a PBKDF2-HMAC-SHA256 derived hash using 600,000 iterations, and records its iteration count. Hashes created by earlier releases with 210,000 iterations still verify; after the next successful login, Stats re-hashes the password with 600,000 iterations and replaces `auth.json` by writing a temporary file and renaming it. A wrong password never changes the file.

Successful login creates the `TaskListStats.Auth` cookie. It is HttpOnly, SameSite=Strict, persistent for up to 30 days, sliding while active, and marked Secure when the request itself uses HTTPS.

Use **File > Log Out** to clear the session. Setup and login are rate-limited to 5 attempts per source IP per minute.

## Themes

Use **View > Theme** to choose **Light** or **Dark**. The selection persists in browser storage and applies to the Stats workspace and login/setup UI.

The dark theme keeps the Windows 95 raised/recessed look instead of replacing it with a generic flat theme. Every color is a token in `wwwroot/theme.css`, defined once for Light and once for Dark, with the same token names TaskList, NewsReview, and SpendTracker use; the other stylesheets and scripts contain no color values, apart from the two browser `theme-color` values that `theme.js` writes to the page metadata. Canvas charts read their colors from the `--chart-*` and `--pattern-*` tokens by series name and redraw when the theme changes.

There is intentionally no automatic **System** theme; theme selection is strictly Light or Dark.

**View > Use Retro Font** switches the whole app, including the login page and chart labels, to W95FA, an open-source recreation of the Windows 95 MS Sans Serif font bundled in `wwwroot/fonts`, so the interface looks the same on Windows, Linux, macOS, Android, and iOS without installing fonts. It is off by default and saved per browser, separately for each app.

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

## Table readability and row hover

Tables use 14px text, a 1.45 line height, and larger cell padding across all tabs. Activity Session rows and Compare's custom table layout use matching spacing.

**File > Highlight rows on hover** is a square checkbox enabled by default. Clicking it toggles the setting and dismisses the File menu, just like selecting an option in View. Its setting is saved per browser. When enabled, table body rows highlight using the same Light/Dark colors as TaskList; headers, statistic cards, heatmap cells, and Milestones tiles are unaffected. Hover follows actual mouse/trackpad pointer movement, including over links and buttons inside rows and on touchscreen laptops. Moving outside a row, leaving the page, disabling the option, or using touch/pen input clears the highlight. Synthetic mouse events after touch are briefly suppressed. Theme styles load directly with the page, using the same stylesheet loading approach as TaskList.

## TaskList deep links

Task IDs shown in Stats link back to the main TaskList app using the task's Universal ID:

```text
/task/<UniversalID>
```

TaskList opens the correct list, switches to **All**, scrolls to the task, and highlights it.

By default, links point to TaskList on the same host you opened Stats with, at port 8711. For example, Stats at `http://192.168.1.50:8712` links to `http://192.168.1.50:8711/task/<UniversalID>`. If TaskList uses another host, port, or protocol, set its address in `appsettings.json`:

```json
{
  "TaskListStats": {
    "DatabasePath": "../task-list/data/tasklist.db",
    "TaskListUrl": "https://tasks.example.com"
  }
}
```

The address is sent only in the authenticated snapshot response and is included in snapshot exports. Restart Stats after changing it.

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

Chronological event history with one **Date/time range** field, event type, ordering, text/list/ID filtering, status transitions, and TaskList deep links. Like TaskList Search and NewsReview, enter `10/3 - 10/8, 9am - 5pm`, or either range alone. The comma separates the date range from the time range. Dates accept `m/d`, `m/d/yy`, or `m/d/yyyy`; omitted years use the current year. Times use the browser's local clock with flexible 12-hour parsing; omitted AM/PM means AM. Hyphens, en dashes, and em dashes work as range separators.

The range and the text filter apply when you press **Search** (or Enter), as in TaskList and NewsReview, so half-typed phrases are not searched; the Event and Order dropdowns apply as soon as you choose.

With the range field empty, undated events remain visible as "Unknown" after dated rows in either sort direction. Choosing an explicit range excludes events that cannot be placed in that range. Time-only ranges search all dates, and overnight ranges such as `10pm - 2am` match late-night and early-morning times on each selected date. A time filter excludes date-only events rather than treating them as midnight. Moving tasks preserves their original event attribution; historical task links follow the permanent Universal ID to the current list and visible number.

Created events display as `Created → Open` rather than showing a missing previous status, while normal state changes continue to display their actual transitions.

On roomy desktop windows, the Task Flow table fills the space below its controls and scrolls inside that space. Laptop, short, and narrow windows scroll the workspace instead, letting the controls move out of the way and keeping the table at its natural height. Horizontal table scrolling remains available, and the status bar stays visible.

### Compare

Compare either two list scopes or two time periods. Time-period mode uses one combined date/time range field for Period A and one for Period B, with the same syntax and missing-time behavior as Task Flow. Either date or time ranges can be supplied alone, and clearing a period's field includes all recorded history. Period ranges apply when you press **Search** (or Enter); the Compare mode and list dropdowns apply as soon as you choose. The Difference section reports `A - B` for the same metrics.

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

Global/list/recorded-event milestones include undated records and identify the threshold-crossing event by event-record order, matching TL's counter increments. Backdated imports therefore count without pretending they were inserted earlier. A milestone with no usable timestamp shows "Unknown date" and appears in an Unknown date section for Chronological/Year grouping. Yearly event milestones require valid dates and use UTC years for timestamps; date-only imports use their written year. Calendar charts and displayed event times keep their normal local-time presentation. Universal-ID milestones can also show unknown dates when the creation record is undated.

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

TaskList v1.5.24 and newer save list names at deletion. Stats reads this optional `deleted_lists` history without writing to TaskList's database and labels saved names "(deleted)" across historical views. Lists deleted before name preservation show "Deleted list #ID (name unavailable)" because their original names cannot be recovered. Older databases remain supported, and deleted lists are not added to current-list counts or selectors.

TaskList v1.7.9 adds **File > Fresh Start...**, which can remove finished tasks, archived lists, the history of deleted tasks, or all task history to free disk space. Stats has no Fresh start of its own because it never writes to TaskList's database; its only stored data is its password hash and log. When a TaskList Fresh start removes history, TaskList changes its history revision, so Stats' next event request reports that a reset is required and Stats reloads the whole remaining history, just as after a TaskList restore. Charts, records, and Milestones then reflect only the history that remains; clearing all task history leaves one legacy event per date each remaining task still has.

The Stats **Help** button opens About immediately, matching TaskList. Its wide, rectangular dialog uses 16px text for the event-history explanation and places about.lehighradio.com above the application/version label at the bottom, as TaskList does. The event-history paragraph explains missing dates, unavailable list names, and older history.

## Import and export

Use **File > Import/Export... > Download Snapshot** to download the snapshot loaded by Stats as `taskliststats-snapshot-YYYYMMDD-HHMMSS.json` (local time). Stats keeps no data of its own, so there is nothing to restore; back up and restore tasks in TaskList.

Treat exports as private because they can contain task titles, descriptions, list names, IDs, statuses, timestamps, and event history.

## HTTP API

The default base URL is `http://127.0.0.1:8712`. Request and response bodies are JSON unless stated otherwise. Stats uses its own `TaskListStats.Auth` cookie; a TaskList login cookie does not authenticate Stats. Login/setup set an HttpOnly, SameSite=Strict cookie with a 30-day sliding lifetime, marked Secure when the request uses HTTPS. Send that cookie on authenticated requests.

| Method | Path | Request | Response / effect |
| --- | --- | --- | --- |
| GET | `/api/auth/status` | None; public. | `{version, configured, authenticated}`. |
| POST | `/api/auth/setup` | Public JSON: `{setupToken, password, confirmPassword}`. | First-run setup using the token printed by this server. Password must be at least 8 characters and match confirmation. Saves the Stats password hash and signs in; returns `{authenticated: true}`. Returns 409 if already configured, 401 for an invalid token, or 400 for an invalid password. |
| POST | `/api/auth/login` | Public JSON: `{password}`. | Signs in and returns `{authenticated: true}`; 401 for an incorrect password, 409 if setup has not been completed. |
| POST | `/api/auth/logout` | Authenticated; no body. | Clears the Stats session cookie; 204 with no response body. |
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

## Home screen and PWA

TaskList Stats keeps no offline copy of its pages, like NewsReview: without a connection the browser shows its own offline page, which makes a connection problem obvious instead of opening a stale app that cannot reach its data. It can still be added to a phone's home screen from the web manifest. `sw.js` only removes the service worker and cache that releases before v2.2.23 installed.

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

An expired session should send you back to Login. Otherwise open `/api/snapshot` after logging in; its error message names the database path it tried.

### Task-ID links open the wrong TaskList server

Set `TaskListStats:TaskListUrl` in `appsettings.json` to TaskList's address and restart Stats. See [TaskList deep links](#tasklist-deep-links).

### Statistics differ from what you expected

Check the selected list scope, task vs subtask expectations, date-only vs full timestamp history, current status vs preserved old terminal timestamps, and whether the value comes from event history or approximate backlog reconstruction.

## Development checks

Run `python3 -m unittest discover -s tests -v` for server tests: `tests/server.py` (the same file in TaskList, TaskList Stats, and SpendTracker) builds the app and starts the real server on a temporary data folder; `tests/test_sign_in.py` (also the same in all three) checks first-run setup, login, logout, and the saved password file. `tests/test_api.py` checks the missing-database message and unknown addresses. Run `node tests/frontend.test.cjs` for frontend regression tests using the actual JavaScript and disposable DOM fixtures. Coverage includes all 11 workspaces in multiple scopes, moved/renamed/deleted-list identities, undated events, milestone groups and threshold attribution, status-flow counts, year boundaries, and concurrent snapshot/history refreshes. The neighboring TaskList checkout also has SQL integrity and cross-app milestone parity tests; see its [audit coverage](https://github.com/RotatingWires/task-list/blob/main/tests/AUDIT.md). Node is only needed for these tests, not to run Stats.

Optional browser layout checks use Python and Playwright with Firefox installed: `python3 tests/browser_layout.py`. The checks run the actual frontend with synthetic API data across nine viewport sizes in both themes. They verify that roomy desktop windows fit both lists above the status bar, while laptop/mobile layouts use the workspace as their only vertical scroller and let the lists fill the visible area after scrolling past the controls. Use `--browser chromium` or `--browser webkit` to select another installed Playwright browser. These are development tools only.

GitHub Actions (`.github/workflows/tests.yml`) builds Stats and runs the server tests and `node tests/frontend.test.cjs` on every push and pull request. The Playwright layout checks stay a local, optional tool.

## Development philosophy

- keep the source tree small
- prefer normal source edits over version-specific patch files
- do not monkey-patch or reassign existing functions to bolt on release behavior
- remove retired features from markup, code, styles, and dependencies instead of merely hiding them
- keep TaskList authoritative and all Stats access to its database read-only
- preserve timestamp precision instead of inventing data
- keep controls consistent across desktop and mobile
- use boring, understandable browser/.NET features before adding dependencies

## Release notes

Current release: **v2.2.42**.

### v2.2.42

- Fix: a dropdown inside a dialog that opens upward (when there is more room above it, as on a phone) no longer collapses out of sight below the screen; `dropdown.js`, the same in every app, now clears the stylesheet's position when it opens a menu upward.

### v2.2.41

- Code: the scripts are JavaScript modules (`<script type="module">`) with imports and exports, like NewsReview's, instead of classic scripts sharing globals; the app starts once every module has loaded. `theme.js` and `dropdown.js` stay classic scripts, the same in every app, so the theme is applied before the page draws.

### v2.2.40

- Code: reading TaskList's database moved from `Program.cs` into `Store.cs`, like the other apps; Program.cs keeps startup and the routes.

### v2.2.39

- Code: every script starts with a short comment saying what it holds (and `'use strict';` where it is not a module), like SpendTracker's; `SingleFileLogger.cs` is now the same file in all four apps.

### v2.2.38

- Code: elements are built with the `el(tag, className, text)` helper, the same one in every app.

### v2.2.37

- Scripts and stylesheets load from absolute paths (`/app.js`) like the other apps, so a page below the root still finds them.

### v2.2.36

- MANUAL.md uses the same section names and order as the other apps, with a contents list at the top and a **Current release** line under Release notes; no text was removed, only moved or retitled.
- README.md has a **Sibling apps** section linking all four apps.
- `.gitignore` has the same rules in every app.
- Removed Python cache files that were committed by mistake.

### v2.2.35

- Tests start the real server on a temporary data folder with `tests/server.py`, and `tests/test_sign_in.py` checks setup, login, logout, and the password file; both files are the same in TaskList, TaskList Stats, and SpendTracker.
- An unknown API address answers 404 `{ "error": "Not found" }` like NewsReview, instead of the app page (GET) or 405 (POST).
- Stats now has sign-in and server tests, and CI runs them.

### v2.2.34

- `theme.css` starts with one shared palette, the same color names and values in every app (light and dark), followed by the colors only this app uses. Links use the same navy as the other apps (#000080 instead of #0000a0).
- The wide layout starts above 1000px like the other apps (was 1100px).

### v2.2.33

- Dropdowns and menus share one file, `dropdown.js`, the same in every app: Arrow Down/Up move through a menu (Arrow Down on a closed dropdown opens it), Home and End jump to the first and last item, and Escape closes it and returns to its button without closing the dialog under it. A dropdown that would be cut off inside a dialog floats over the page and opens upward when there is more room there, like SpendTracker's.

### v2.2.32

- Every table sorts by a column when you click its heading (or press Enter): ascending, descending, then the original order, like SpendTracker's tables. A sort is kept when the table is drawn again.

### v2.2.31

- Every dialog is a `<form method="dialog">`, and its Cancel/Close/OK button is marked `data-close="dialogId"`; one shared handler closes it, the same code in every app.
- Keyboard focus draws the same dotted Windows 95 focus rectangle in every app; mouse clicks draw none.
- Screen readers get the same structure in every app: a hidden page heading with the app name and a **Skip to content** link that appears when you press Tab.
- Every button has an explicit type; links to TaskList open a new tab with `noopener noreferrer` like NewsReview's.

### v2.2.30

- The login and main pages share one set of page tags, the same in every app: a description, the iPhone home-screen and status-bar settings, the manifest, and icons.
- Icons live in `/icons/` with the same names in every app: `favicon.svg`, `favicon.ico`, and `touch-180/192/512.png`. The manifest has an app ID, scope, and description.
- The main page gained the iPhone home-screen settings its login page already had; there is now a `favicon.ico`.

### v2.2.29

- Database calls are synchronous, like SpendTracker's and NewsReview's. Microsoft.Data.Sqlite runs its async calls synchronously anyway, so this changes no behavior.

### v2.2.28

- Sign-in code lives in `src/PasswordAuth.cs`, the same file in all four apps. Passwords are capped at 1024 characters and `auth.json` is saved readable only by its owner on Linux and macOS.
- New `appsettings.json` with the listen address and log level, the same keys in every app. (added to the existing database path setting)
- New `deploy/taskliststats.service` systemd template, like NewsReview's; it runs as TaskList's account to read its database.

### v2.2.27

- Wording matches the other apps: menu paths are written **File > Import/Export...**, only "..." and straight quotes are used.
- Loading text is **Loading...** like the other apps.
- Times follow the browser's 12- or 24-hour setting instead of always using a 12-hour clock; Activity Sessions dates use the browser's locale.
- When the session expires, Stats goes to the login page with **Your session has expired.**, like TaskList.

### v2.2.26

- On phones the status bar keeps both sides, like TaskList: the right side shortens with an ellipsis.
- Errors show in the status bar as **Error: ...**, like TaskList, instead of a red panel over the page.

### v2.2.25

- The View menu has a **Tabs** heading over its tab list, like TaskList's **Tasks** heading.
- The About box describes Stats and gives a few tips in the same length as the other apps'.

### v2.2.24

- **File > Import/Export...** opens a dialog like the other apps' with **Download Snapshot** (formerly File > Export snapshot JSON...).
- Download names follow one pattern in every app, in local time: `taskliststats-snapshot-YYYYMMDD-HHMMSS.json`.

### v2.2.23

- No offline copy, like NewsReview: without a connection the browser shows its own offline page instead of a stale app. The old service worker and its cache are removed automatically.
- One `theme.js` shared word for word with the other three apps: the page marks its theme with `data-theme`, and it loads at the top of every page, login included, so it never flashes the wrong theme.

### v2.2.22

- **View > Use Retro Font**: the whole app, login page and chart labels included, can use W95FA, an open-source recreation of the Windows 95 font bundled with the app (SIL Open Font License, `wwwroot/fonts/OFL.txt`), so it looks the same on Windows, Linux, macOS, Android, and iOS. Off by default; saved per browser.

### v2.2.21

- Finds TaskList's database as `tasklist.db` or the older `task-list.db`; the default path is now `../task-list/data/tasklist.db`.
- Command-line options like NewsReview: `--data-dir PATH`, `--version`. The data folder can also come from `TaskListStats:DataDirectory` or `TASKLISTSTATS_DATA_DIR`.

### v2.2.20

- Startup logs the version and data folder, the database settings, and where the sign-in keys are, in the same three lines as the other apps.
- Without a Windows profile key ring (Linux, Task Scheduler), sign-in keys now live in data/keys like NewsReview, so a systemd service with ProtectHome stays signed in. Expect to log in once after updating.
- The login page words wrong-password and too-many-attempts messages itself; setup conflicts say "A password is already configured."
- API errors use `{ error }` like the other apps instead of ASP.NET problem details.
- Removed `/api/health`; no other app has one.

### v2.2.19

- Browser hardening like NewsReview: a content security policy, no MIME sniffing, no referrer, and writes from other sites are refused.
- API replies are never stored by the browser; pages and scripts are revalidated on each load.
- Requests give up after 30 seconds instead of waiting forever on a stopped server (snapshot exports excepted).

### v2.2.18

- The browser tab title leaves out the version ("TaskList Stats", "TaskList Stats Login"), like the other apps; the title bar and About box still show it.

### v2.2.17

- Opening the app signed out goes to plain `login.html`, like NewsReview, instead of `login.html?ReturnUrl=%2F`; deep links still keep their address through signing in.

### v2.2.16

- The Home Screen icons leave a margin around the window, like NewsReview's, so iOS's rounded corners no longer cut off its frame and title bar. They have new file names (touch-180.png, touch-192.png, touch-512.png) so iOS downloads them; remove the app from your Home Screen and add it again to update it.

### v2.2.15

- The Home Screen icons have new file names (home-180.png, home-192.png, home-512.png), so iOS downloads the current icon instead of reusing one it saved earlier. To update an app already on your Home Screen, remove it and add it again from Safari's Share menu.

### v2.2.14

- On phones (650px wide or less) the title bar leaves out the version number, which was often cut off; desktops and the About box still show it.

### v2.2.13

- On phones the title bar starts the same distance from the top as TaskList's (`--ios-top-offset`, at least 20px below the status bar).
- Home Screen and app icons are PNGs drawn from the favicon (180, 192, and 512 px), so the installed app's icon matches the browser tab's.

### v2.2.12

- On touch screens, text boxes (such as Month detail and the Compare dates) use 16px text so phones do not zoom in when one is focused.

### v2.2.11

- The server compresses its responses (Brotli or gzip), so the snapshot, event history, scripts, and styles cross the network several times smaller.
- Removed unused styles.

### v2.2.10

- Dialogs dim the page with NewsReview's `#0007` backdrop, matching NewsReview, TaskList, and SpendTracker.

### v2.2.9

- The Dark theme's error red is `#ff9c9c`, the same as NewsReview's and TaskList's.

### v2.2.8

- Document how Stats follows TaskList v1.7.9's Fresh Start: no Stats change is needed, because a Fresh start that removes history changes TaskList's history revision and Stats reloads the remaining history.

### v2.2.7

- The status bar is the same size as TaskList's: body-size text in 24px panels.

### v2.2.6

- Menu bar buttons (File, View, Help) highlight in the title color on mouse hover and while their menu is open, like NewsReview's top bar.

### v2.2.5

- Task Flow and Compare search when you press **Search** or Enter, like TaskList and NewsReview, instead of on every keystroke or when a field loses focus. Dropdown choices still apply right away.

### v2.2.4

- Rename the two colors the dark theme never overrode (`--soft-shadow`, `--focus-accent`) to `--classic-shadow` and `--classic-accent`, matching the `--classic-*` tokens TaskList uses for the same situation. Nothing looks different.

### v2.2.3

- Move every color into `wwwroot/theme.css` as Light/Dark tokens, using the token names shared with TaskList, NewsReview, and SpendTracker (`--face`, `--surface`, `--ink`, `--muted`, `--light-edge`, `--dark-edge`, `--title`, `--link`, and so on). The theme-only override rules that used to repaint `style.css` and `analysis-tabs.css` now live in the rules they belong to, so each color is set once.
- Charts name their series (`created`, `completed`, `cancelled`, `patternCreated`, `patternCompleted`) instead of passing hex colors that were translated back into theme colors.
- The look is unchanged: every view, menu, and dialog renders identically in both themes before and after.

### v2.2.2

- Move the C# server sources into `src/`, matching TaskList and NewsReview. `TaskListStats.csproj`, `appsettings.json`, `wwwroot/`, `tests/`, and every build, run, and test command stay where they were; behavior is unchanged.

### v2.2.1

- Draw the title-bar minimize, maximize, and close symbols with CSS in equal-size boxes so they line up; the old `_` sat on the text baseline below the other two. TaskList and NewsReview use the same markup and styles.

### v2.2.0

- Choose the listen address the same way as TaskList: `http://127.0.0.1:8712` by default, overridden by `--urls` or `ASPNETCORE_URLS`. Remove the `ListenUrl` setting and `TASKLIST_STATS_URL` variable, and the private LAN address that was committed in `appsettings.json`.
- Hash new passwords with 600,000 PBKDF2-HMAC-SHA256 iterations and upgrade 210,000-iteration hashes after the next successful login, replacing `auth.json` atomically.
- Link task IDs to TaskList on the current host at port 8711 instead of a hardcoded address; the optional `TaskListStats:TaskListUrl` setting overrides it.
- Generate `wwwroot/version.json` without a byte-order mark and only when the version changes, so builds no longer modify the committed file.
- Verified default/`--urls`/`ASPNETCORE_URLS` addresses, first-run setup, legacy-hash login and upgrade, unchanged hash on a wrong password, restart, and the login rate limit against the running app.

### v2.1.28

- Show persistent time-only and combined date/time search examples in the Task Flow and Compare notes, including when the range fields already contain dates.

### v2.1.27

- Give Task Flow and both Compare periods combined date/time range fields matching NewsReview and TaskList Search.
- Support date-only, time-only, combined, and overnight filters in local time; retain undated records with an empty filter and exclude missing clock times from time filters.
- Give wide controls the full row on smaller screens and add frontend tests for filtering, validation, period comparison, and midnight/noon.

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

- Clarify in Help that dates marked "Unknown" may come from tasks imported from another application; keep the event-history explanation in one paragraph.

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

- Show preserved deleted list names in Task Flow, Activity Sessions, and milestone history with a "(deleted)" label.
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
- Remove the period from File > Highlight rows on hover.
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

- Remove **System** from View > Theme so theme selection is strictly Light or Dark.
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
