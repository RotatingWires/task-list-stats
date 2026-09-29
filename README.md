> [!WARNING]
> This project is fully vibecoded, probably inefficient, but it does what I wanted lol

# TaskList Stats

**TaskList Stats v1.0.5** is a separate, read-only statistics and history explorer for the self-hosted **TaskList** database.

It is intentionally its own application instead of being built into TaskList. TaskList stays focused on managing tasks, while TaskList Stats can spend its UI and code budget on charts, heatmaps, records, historical analysis, hierarchy statistics, and experimental/fun views without bloating the main app.

The interface uses the same Windows 95-style visual language as TaskList and works as a normal browser app or installable PWA.

## What it does

TaskList Stats reads the existing TaskList SQLite database and builds a browser-side snapshot containing the current lists, task records, timestamps, status, hierarchy IDs, and lifetime Universal ID information.

From that snapshot it can answer questions such as:

- How many tasks are Open, Done, or Cancelled?
- What days, weeks, months, weekdays, and hours are busiest?
- What are the creation/completion records for the selected lists?
- How old is the current backlog?
- How has the approximate backlog changed over time?
- Which lists are most active?
- How deep are task trees and which roots have the largest subtrees?
- What task-title categories and common words appear most often?
- When are tasks usually created or completed?
- Which tasks were unusually fast, slow, old, forgotten, reopened, or otherwise interesting?

The app can analyze **All lists**, one list, or any combination of lists using the checklist at the top of the UI.

## Important safety property: read-only database access

TaskList Stats does **not** create, update, or delete TaskList rows.

The server opens SQLite with:

- `Mode=ReadOnly`
- `PRAGMA query_only = ON`

There are no write endpoints in the Stats API. The application reads TaskList data into a snapshot and performs its analysis in the browser.

That protects the TaskList database from intentional writes by this app, but it does **not** make the Stats web interface safe to expose publicly: anyone who can reach the site can potentially see the task snapshot returned by `/api/snapshot`.

## Technology stack

- C# / ASP.NET Core Minimal API
- .NET 10
- Kestrel
- Microsoft.Data.Sqlite
- Plain HTML, CSS, and JavaScript
- SQLite opened read-only
- No ORM
- No frontend framework
- No chart library
- Browser Canvas API for charts
- Service worker + web manifest for PWA support

## Project layout

```text
TaskListStats.csproj      .NET project and package/version metadata
Program.cs                Kestrel server, database reader, and API endpoints
appsettings.json          database path and listen-address configuration

wwwroot/
  index.html              application shell and statistics panels
  style.css               Windows 95-style UI and responsive/mobile layout
  app.js                  core data handling and statistics rendering
  charts.js               chart drawing and chart interactions
  fun.js                  Fun-tab analyses
  records-v1.js           v1.x records/status/backlog/tree compatibility layer
  manifest.webmanifest    installable-PWA metadata
  sw.js                   service worker and static-asset cache
  icons/stats.svg         app/favicon icon
```

## Requirements

For the server:

- .NET 10 SDK/runtime
- A TaskList `task-list.db` SQLite database
- Read permission to the database file and its parent path

For the client:

- A modern desktop or mobile browser
- JavaScript enabled

The app has no Node.js/npm build step and no frontend package manager.

## First-time setup

Clone the repository and enter it:

```bash
git clone https://github.com/RotatingWires/task-list-stats.git
cd task-list-stats
```

Restore the .NET dependency:

```bash
dotnet restore
```

Then configure the TaskList database path and listening address.

### Option 1: edit `appsettings.json`

The repository contains:

```json
{
  "TaskListStats": {
    "DatabasePath": "../task-list/data/task-list.db",
    "ListenUrl": "http://192.168.1.12:8712"
  }
}
```

Those values reflect the original deployment and will probably need to be changed on another machine.

A more generic example is:

```json
{
  "TaskListStats": {
    "DatabasePath": "/srv/task-list/data/task-list.db",
    "ListenUrl": "http://0.0.0.0:8712"
  }
}
```

`0.0.0.0` listens on all interfaces. Use a LAN/VPN firewall and do not expose the Stats port directly to the public Internet.

### Option 2: environment variables

Environment variables override `appsettings.json`:

```bash
export TASKLIST_DB_PATH=/srv/task-list/data/task-list.db
export TASKLIST_STATS_URL=http://0.0.0.0:8712
```

Supported variables:

| Variable | Purpose |
| --- | --- |
| `TASKLIST_DB_PATH` | Full or relative path to TaskList's SQLite database |
| `TASKLIST_STATS_URL` | Kestrel listen URL, for example `http://0.0.0.0:8712` |

If no usable database path is configured, the server also checks several common relative TaskList locations before returning an error.

## Configure TaskList deep links

Whenever Stats displays a task ID, it can link directly back into TaskList using the clean route:

```text
/task/<UniversalID>
```

TaskList handles that route by opening the correct list, switching to the **All** view, scrolling to the task, and highlighting it.

The TaskList origin is currently defined near the top of `wwwroot/app.js`:

```javascript
const TASKLIST_ORIGIN = 'http://tasklist.lehighradio.com:8711';
```

If your TaskList instance uses a different hostname, IP, port, or HTTPS URL, change that constant to match your deployment.

Task links intentionally open in a new tab and use `rel="noopener"`.

## Run it

Development/direct run:

```bash
dotnet run
```

Then open the configured Stats URL in a browser, for example:

```text
http://server-ip:8712/
```

The status bar shows how many current TaskList items were loaded and when the database file was last modified.

## API endpoints

TaskList Stats exposes only a very small API.

### `GET /api/health`

Reports whether the configured database can be found and returns the server version.

Example use:

```bash
curl http://127.0.0.1:8712/api/health
```

### `GET /api/snapshot`

Opens the TaskList database read-only and returns the data used by the browser:

- lists
- items
- Universal IDs
- task titles/descriptions
- current status
- creation/update/completion/cancellation/reopen timestamps
- database last-write time
- snapshot generation time

The browser performs the statistics calculations from this snapshot.

## Statistics sections

### Overview

Overview summarizes the current scope and the most useful headline records.

**Current Activity** includes current total, Open, Done, Cancelled, root/subtask counts, lifetime Universal ID information, and a deleted-entry estimate.

**Creation Records** include:

- most creations in one day
- most creations in one week
- most creations in one month
- biggest creation hour
- longest creation streak
- longest quiet streak

**Completion Records** include:

- most completions in one day
- most completions in one week
- most completions in one month
- biggest completion hour
- longest completion streak

The Timeline group shows the first and latest dated task in the selected scope.

Overview also includes:

- completion and cancellation percentages
- average/median/fastest/slowest observed completion duration
- completion-time distribution buckets
- average and median open-task age
- counts open for 7, 30, and 90+ days
- oldest currently open tasks

### Trends

Trends can group events by **day**, **week**, or **month**.

It includes:

- Created / Completed / Cancelled trends
- approximate historical backlog
- top 10 busiest months
- fastest and slowest completion months
- year-over-year monthly creation comparison

Monthly chart labels use four-digit years to avoid ambiguous labels such as `Sep 26`.

### Calendar

Calendar contains several date-oriented views:

- year activity heatmap
- Created / Completed / Cancelled / All activity modes
- detailed month calendar
- Month × Year creation heatmap
- seasonality chart showing average creation volume by month of year

Date-only imported history remains valid here because these views do not require a known clock time.

### Lists

The Lists tab compares TaskList lists using:

- Total / Open / Done / Cancelled counts
- completion percentage
- average completion duration when confirmed timestamps exist
- share of all current entries
- most active list by month

### Patterns

Patterns looks for recurring timing behavior:

- day-of-week creation/completion patterns
- hour-of-day creation/completion patterns
- weekday × hour heatmap
- average workload per active week/month
- exam/test-window statistics

Exam/test detection uses task titles containing terms such as `exam`, `test`, `midterm`, or `final`. These are contextual heuristics, so select the correct school/homework list scope before interpreting them.

### Trees & Titles

This tab analyzes hierarchy and task naming:

- deepest nesting level
- percentage of roots with subtasks
- average subtasks per root
- average direct children per parent
- largest task trees
- deepest individual tasks
- nesting-depth distribution
- common task-title words
- inferred title categories such as quiz, exam/test, reading, discussion, assignment, project, paper/essay, and lab
- reopened-task counts and recently reopened tasks

As of v1.0.5, hierarchy indexes are built in linear passes instead of repeatedly rescanning the full selected list, which substantially reduces the expensive part of rendering this tab on large datasets.

### Fun

The Fun area turns the same read-only snapshot into exploratory views. Depending on the selected subtab it includes tools such as:

- Task Roulette
- Ancient Task
- Forgotten Task
- Time Machine
- Productivity Jackpot
- Task Graveyard
- Personal Records
- On This Day
- Déjà Vu
- Slowest Task
- Night Owl
- Early Bird
- Same-Day Speedrun
- Cleanup Day

These tools do not modify tasks. They only analyze the current Stats snapshot.

## List filtering

The list selector is a multi-select Windows-style checklist.

- **All lists** is the default.
- Select one list to analyze only that list.
- Select several lists to analyze their combined scope.
- Unchecking the final selected list returns to **All lists**.

The same scope is shared across Overview, Trends, Calendar, Lists, Patterns, Trees & Titles, and Fun.

## Timestamp precision rules

TaskList data may contain either full timestamps or imported date-only values.

TaskList Stats deliberately does **not** invent a midnight time for date-only history.

Date-only values can participate in statistics that only need a calendar date, including:

- daily/monthly trends
- calendars
- year heatmaps
- seasonality
- weekday statistics

Statistics that need an actual clock time require a confirmed timestamp containing a time component, including:

- hour-of-day charts
- weekday × hour heatmaps
- biggest creation/completion hour
- completion-duration statistics
- Same-Day Speedrun and other elapsed-time Fun calculations

This prevents imported history from creating false `12:00 AM` records.

## Current-status semantics

TaskList can preserve an old `completed_at` or `cancelled_at` value even after a task later changes state.

Starting with v1.0.2, TaskList Stats treats the **current task status as authoritative** for completion/cancellation analytics:

- a task contributes to completion statistics only when its current status is `Done`
- a task contributes to cancellation statistics only when its current status is `Cancelled`
- creation statistics remain based on valid creation dates regardless of current status

This avoids stale terminal timestamps inflating completion/cancellation counts after a reopen or status correction.

## Why backlog history is approximate

TaskList stores useful current timestamps:

- `created_at`
- `updated_at`
- `completed_at`
- `cancelled_at`
- `reopened_at`

It does **not** keep a complete append-only log of every historical status transition.

For example, if a task was completed, reopened, completed again, reopened again, and completed a third time, the database does not necessarily contain every older transition needed to perfectly rebuild that history.

TaskList Stats therefore reconstructs the best available state sequence from the stored timestamps. Done and Cancelled are treated as the same closed state for backlog accounting, and a reopen adds the task back only after a stored closed state.

The result is useful for long-term trends but is explicitly labeled **Approximate Backlog Over Time**.

Current counts are not approximate.

## Exporting a snapshot

Use:

**File → Export snapshot JSON...**

The browser downloads the exact normalized snapshot currently loaded by Stats.

This is useful for debugging or offline inspection, but treat the file as private. It can contain task titles, descriptions, list names, IDs, statuses, and timestamps.

## PWA behavior

`manifest.webmanifest` allows TaskList Stats to be installed as a standalone web app on supported browsers/devices.

The service worker:

- caches the application shell/static assets
- uses network-first behavior for current static assets
- removes old versioned caches during activation
- always fetches `/api/*` from the network rather than serving database snapshots from cache

This means an installed PWA can retain its interface shell, but live statistics still require access to the Stats server.

## Optional Linux systemd service

A simple service might look like:

```ini
[Unit]
Description=TaskList Stats
After=network.target

[Service]
Type=simple
User=taskliststats
WorkingDirectory=/opt/task-list-stats
Environment=TASKLIST_DB_PATH=/srv/task-list/data/task-list.db
Environment=TASKLIST_STATS_URL=http://0.0.0.0:8712
ExecStart=/usr/bin/dotnet run --configuration Release
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Adjust paths and the service user for your machine. The service account needs read access to the TaskList database but does not need write access.

For a more production-like deployment, `dotnet publish` and run the published DLL instead of compiling on each service start.

## Security and privacy

TaskList Stats does not have its own authentication layer.

Recommended deployment model:

- keep it on your LAN, private reverse proxy, or VPN
- do not publicly port-forward the Stats service
- firewall access to trusted networks/devices
- give the service account only the filesystem permissions it needs
- keep TaskList's database and exported snapshots private
- use HTTPS when accessing it across an untrusted network

Important distinctions:

- **Database writes:** blocked by the app's read-only SQLite connection.
- **Data disclosure:** still possible if an unauthorized person can reach the web/API service.
- **Snapshot exports:** contain personal task data and should be treated like a database export.
- **Task deep links:** reveal the configured TaskList hostname to anyone who can inspect the client source.

## Troubleshooting

### `TaskList database not found`

Check `TaskListStats:DatabasePath` or `TASKLIST_DB_PATH` and make sure the process has filesystem read access.

The `/api/health` endpoint is the quickest way to confirm which server is running and whether the database file can be found.

### The page loads but shows `Database unavailable`

Open `/api/health` and `/api/snapshot` directly. A 503 response usually includes the underlying database/path error.

### Another computer cannot open Stats

Check:

- `ListenUrl` / `TASKLIST_STATS_URL`
- host firewall rules
- whether Kestrel is bound to `127.0.0.1` versus `0.0.0.0` or the LAN IP
- routing/VPN connectivity

### Task-ID links open the wrong TaskList server

Change `TASKLIST_ORIGIN` near the top of `wwwroot/app.js` to your TaskList base URL.

### Statistics differ from what you expected

Check whether:

- the correct list scope is selected
- the data is date-only rather than a confirmed timestamp
- a task has a stale historical completion/cancellation timestamp but a different current status
- you are looking at the approximate backlog rather than a current count

### The installed PWA looks stale after an update

Reload while connected to the server. The service worker is network-first and versioned releases use a new cache name, but a browser that has been offline may temporarily continue displaying its previously cached shell until it reconnects.

## Current release: v1.0.5

Recent v1.x changes:

### v1.0.5

- optimized Trees & Titles hierarchy calculations using prebuilt lookup indexes
- preserved all existing hierarchy/title statistics while avoiding repeated whole-scope rescans

### v1.0.4

- changed monthly Trends labels to full four-digit years
- added list-context guidance to Task-Title Types

### v1.0.3

- fixed approximate backlog reconstruction using stored raw state-transition timestamps
- avoided double-subtracting Done ↔ Cancelled status changes
- handled reopen transitions more carefully

### v1.0.2

- made current terminal status authoritative for completion/cancellation analytics
- prevented stale completion/cancellation timestamps from inflating statistics

### v1.0.1

- reorganized Overview records into Creation Records, Completion Records, and Timeline groups
- renamed creation records for clearer wording

### v1.0

- added completion records for day/week/month
- added longest completion streak
- added biggest creation and completion hour
- promoted the project to the 1.0 release line

Earlier 0.x releases built the core charts, heatmaps, Fun analyses, deep linking, multi-list filtering, mobile layout, custom Windows-style controls, high-DPI chart fixes, date-only timestamp handling, and performance improvements. The Git commit history contains the detailed release-by-release change notes.

## Development philosophy

TaskList Stats follows the same general philosophy as TaskList:

- boring, understandable technology
- small source tree
- no framework where browser APIs are enough
- no chart dependency for straightforward graphs
- database remains authoritative
- Stats cannot mutate TaskList data
- preserve date precision instead of inventing information
- make approximate historical reconstructions clearly labeled
