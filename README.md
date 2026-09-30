> [!WARNING]
> This project is fully vibecoded, probably inefficient, but it does what I wanted lol

# TaskList Stats

**TaskList Stats v1.0.10** is a separate, read-only statistics and history explorer for the self-hosted **TaskList** database.

TaskList stays focused on creating and managing tasks. TaskList Stats reads the same SQLite database and provides charts, records, calendars, hierarchy analysis, pattern analysis, and experimental/fun views without adding that weight to the main TaskList app.

The interface uses the same Windows 95-style visual language as TaskList, includes TaskList-style first-run password setup/login, and can run as a normal browser app or installable PWA.

## What it does

TaskList Stats can analyze **All lists**, one list, or any combination of lists. Tasks and subtasks are both included in the selected scope.

It can answer questions such as:

- How many current entries are Open, Done, or Cancelled?
- How many root tasks and subtasks exist?
- What days, weeks, months, weekdays, and hours are busiest?
- What are the creation and completion records for the selected lists?
- How old is the current backlog?
- How has the approximate backlog changed over time?
- Which lists are most active?
- How deep are task trees and which roots have the largest subtrees?
- What title categories and common words appear most often?
- Which tasks were unusually fast, slow, old, reopened, or otherwise interesting?
- Which exact tasks were created, completed, or cancelled on a calendar day?

## Read-only TaskList database access

TaskList Stats does **not** create, update, or delete TaskList rows.

The TaskList SQLite database is opened with:

- `Mode=ReadOnly`
- `PRAGMA query_only = ON`

There are no TaskList-data write endpoints in the Stats API. The server reads TaskList into a snapshot and the browser performs the statistics against that snapshot.

Authentication does require one small writable Stats-owned file:

```text
data/auth.json
```

That file stores the Stats password hash. It is not part of the TaskList database and does not change TaskList data.

## Authentication

TaskList Stats uses the same basic authentication design as TaskList.

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

The project intentionally keeps a small source tree and avoids release-specific compatibility/override files.

```text
TaskListStats.csproj      .NET project, dependency, and authoritative release version
Program.cs                server, authentication, read-only DB reader, and API
appsettings.json          database path and listen-address configuration
README.md                 setup, behavior, security, and release documentation

data/                     runtime-created private Stats data (ignored by Git)
  auth.json               salted password hash after first-run setup

wwwroot/
  index.html              main application shell and statistics panels/dialogs
  app.js                  shared state, date/data helpers, table/card helpers
  overview.js             Overview records, completion behavior, and aging stats
  history.js              Trends, backlog reconstruction, Calendar, and Lists
  calendar-details.js     Calendar day drill-down dialog and task/event lists
  calendar-details.css    Calendar drill-down interaction/dialog styling
  patterns.js             Patterns plus Trees & Titles analysis
  ui.js                   navigation, filtering, session handling, and startup
  charts.js               shared Canvas chart drawing and interactions
  fun.js                  Fun-tab analyses such as Task Roulette
  style.css               main Windows 95-style UI and responsive layout
  login.html              login / first-run setup page
  login.js                login, setup-token, and return-URL behavior
  auth.css                login/setup-specific styling
  manifest.webmanifest    installable-PWA metadata
  sw.js                   network-first service worker/static cache
  icons/stats.svg         app/favicon icon
```

There are no release-specific JavaScript monkey-patch files. New behavior belongs in the normal source module that owns it.

## Version handling

`TaskListStats.csproj` is the authoritative application version.

At runtime the server reads its assembly version and returns it through the auth-status and snapshot APIs. Login and the main UI use that returned version, so release labels do not drift independently.

The service worker uses a stable network-first shell cache instead of embedding the release number in the cache name.

## Requirements and running

Server requirements:

- .NET 10 SDK/runtime
- a TaskList `task-list.db` SQLite database
- read permission to the TaskList database and its parent path
- write permission to the Stats working directory for `data/auth.json`

Run:

```bash
git clone https://github.com/RotatingWires/task-list-stats.git
cd task-list-stats
dotnet restore
dotnet run
```

A typical `appsettings.json` is:

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

The TaskList origin is defined near the top of `wwwroot/app.js`:

```javascript
const TASKLIST_ORIGIN = 'http://tasklist.lehighradio.com:8711';
```

Change it if your TaskList instance uses another host, port, or protocol.

## Statistics sections

### Overview

Overview contains current counts, Creation Records, Completion Records, timeline records, completion behavior, open-task aging, completion-time buckets, and oldest open tasks.

Creation Records include most creations in a month/week/day, biggest creation hour, longest creation streak, and longest quiet streak. Completion Records include the matching completion records and longest completion streak.

### Trends

Trends includes Created / Completed / Cancelled history, Approximate Backlog Over Time, busiest months, completion-speed months, and year-over-year monthly creation comparison.

Monthly labels use full years such as `Sep 2026`.

### Calendar

Calendar includes:

- year activity heatmap with Created/Completed/Cancelled/All-activity modes
- month calendar
- Month × Year creation heatmap
- seasonality chart
- clickable month-calendar days that open a dialog showing the exact tasks created, completed, and cancelled on that day

The day-details dialog uses the same current list scope as the Calendar itself. Its counts therefore match the day cell.

### Lists

Lists compares the selected lists using current counts, completion percentage, completion duration, share of current entries, and most-active-list-by-month history.

### Patterns

Patterns contains day-of-week and hour-of-day creation/completion charts, the weekday × hour heatmap, workload rhythm metrics, and exam/test-window statistics.

Exam/test detection is based on task titles, so select the appropriate school/homework list scope before interpreting those metrics.

### Trees & Titles

Trees & Titles analyzes nesting depth, roots with subtasks, direct-child averages, largest trees, deepest tasks, title categories, common words, and reopened tasks.

Task-Title Types is also a title heuristic and displays the same school/homework list-context reminder used by Exam / Test Windows.

Hierarchy counts are built from lookup indexes rather than repeatedly rescanning the entire selected scope.

### Fun

The Fun area uses the same read-only snapshot for exploratory history/record tools. Task Roulette includes hierarchy and timing details for a randomly selected task.

The non-obvious Roulette statistics have explanatory hover/tap tooltips, including Universal ID, Type, Nesting depth, Parent, Direct children, Descendants, Siblings, Root tree size, Current age, and Terminal time.

## List filtering

The list selector is a multi-select Windows-style checklist.

- **All lists** is the default.
- Select one list to analyze only that list.
- Select several lists to analyze their combined scope.
- Unchecking the final selected list returns to **All lists**.

The selected scope is shared across all Stats tabs.

## Timestamp precision rules

TaskList history can contain full timestamps or imported date-only values. Stats deliberately does **not** invent a midnight time for date-only history.

Date-only values can participate in calendar-date statistics such as daily/monthly trends, calendars, heatmaps, seasonality, and weekday counts.

Statistics requiring an actual clock time only use confirmed timestamps containing a time component. This includes hour-of-day charts, weekday × hour heatmaps, biggest creation/completion hour, completion-duration metrics, and elapsed-time Fun calculations.

## Current-status semantics

TaskList can preserve an old `completed_at` or `cancelled_at` value after a task later changes state.

For normal completion/cancellation analytics, **current status is authoritative**:

- a task contributes to completion statistics only when its current status is `Done`
- a task contributes to cancellation statistics only when its current status is `Cancelled`
- creation statistics use valid creation dates regardless of current status

This prevents something accidentally marked Done and then changed to Cancelled from still inflating completion statistics.

The Calendar day dialog uses these same normalized dates, so its task lists match the counts displayed in the Calendar cells.

## Why backlog history is approximate

Backlog is different from ordinary completion statistics because it reconstructs historical state.

Stats uses the stored raw creation/completion/cancellation/reopen timestamps to build state transitions in timestamp order:

- entering Open adds the task
- entering Done or Cancelled closes it once
- switching Done ↔ Cancelled remains closed and does not subtract twice
- Reopen adds it back after a closed state

TaskList does not keep a complete append-only status-event log, so repeated older reopen cycles cannot always be reconstructed exactly.

## Exporting a snapshot

Use **File → Export snapshot JSON...** to download the normalized snapshot loaded by Stats.

Treat exports as private because they can contain task titles, descriptions, list names, IDs, statuses, and timestamps.

## PWA behavior

The service worker caches the application shell and login/setup assets, uses network-first behavior for current same-origin static assets, always fetches `/api/*` from the network, and uses cached files only as an offline fallback.

The shell cache does not contain the live TaskList snapshot. Live task data still requires an authenticated request to the Stats server.

## Security and privacy

Recommended deployment:

- use HTTPS across untrusted networks
- prefer LAN, VPN, or a private reverse proxy
- firewall the Stats service to networks/devices that need it
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

Check the selected list scope, task vs subtask expectations, date-only vs full timestamp history, current status vs preserved old terminal timestamps, and whether the value comes from approximate backlog reconstruction.

## Current release: v1.0.10

### v1.0.10

- Added explanatory hover/tap tooltips to the non-obvious Task Roulette hierarchy/time statistics while leaving obvious date/status/description fields uncluttered.
- Reused the existing Stats touch-help system for Roulette tooltips instead of adding a separate interaction model.
- Added clickable Calendar month-day drill-down that opens a Windows-style dialog for the selected date.
- Show Created, Completed, and Cancelled groups with counts plus List, clickable Task ID, title, and current status for every matching task.
- Keep Calendar drill-down aligned with the active multi-list scope and the existing current-status completion/cancellation semantics.
- Added dedicated `calendar-details.js` and `calendar-details.css` purpose-based files; no release-specific override or monkey-patch layer was introduced.
- Added the Calendar drill-down assets to the stable network-first PWA shell cache.
- Bumped TaskList Stats project/assembly metadata to v1.0.10.

### v1.0.9

- removed the release-specific `records-v1.js` compatibility/override layer
- split the browser application into purpose-based `app.js`, `overview.js`, `history.js`, `patterns.js`, and `ui.js` modules
- moved Overview records, current-status normalization, historical backlog reconstruction, and optimized Trees & Titles logic into their normal modules
- made File → Log Out and the Task-Title Types context note normal static UI
- moved File-menu and mobile-record fixes into `style.css`
- removed the stale frontend version constant and made the .NET assembly/project version the runtime source for login/main labels
- changed the service worker to a stable network-first shell cache

### v1.0.8

- removed the extra mobile top gap above the main and login title bars
- restored the centered mobile Log In / Create Password title
- fixed cramped Overview record text on mobile

### v1.0.7

- fixed File-menu hover/focus highlighting to fill the whole command row

### v1.0.6

- added TaskList-style setup-token/password authentication
- added login rate limiting, cookie sessions, protected data APIs, and File → Log Out

### v1.0.5

- optimized Trees & Titles hierarchy calculations with lookup indexes

### v1.0.4

- changed monthly Trends labels to full four-digit years
- added list-context guidance to Task-Title Types

### v1.0.3

- fixed approximate backlog reconstruction using stored raw state-transition timestamps
- avoided double-subtracting Done ↔ Cancelled changes

### v1.0.2

- made current terminal status authoritative for completion/cancellation analytics

### v1.0.1

- reorganized Overview records into Creation Records, Completion Records, and Timeline groups

### v1.0

- added completion records for day/week/month
- added longest completion streak and biggest creation/completion hour
- promoted the project to the 1.0 release line

Earlier 0.x releases built the core charts, heatmaps, Fun analyses, deep linking, multi-list filtering, mobile layout, custom controls, date-only timestamp handling, and performance improvements. The Git commit history contains the detailed release-by-release notes.

## Development philosophy

- keep the source tree small
- prefer normal source edits over version-specific patch files
- do not monkey-patch or reassign existing functions to bolt on release behavior
- keep the TaskList database authoritative and read-only from Stats
- preserve timestamp precision instead of inventing data
- label approximate historical reconstructions clearly
- use boring, understandable browser/.NET features before adding dependencies
