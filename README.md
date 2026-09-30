> [!WARNING]
> This project is fully vibecoded, probably inefficient, but it does what I wanted lol

# TaskList Stats

**TaskList Stats v1.0.8** is a separate, read-only statistics and history explorer for the self-hosted **TaskList** database.

It is intentionally its own application instead of being built into TaskList. TaskList stays focused on managing tasks, while TaskList Stats can spend its UI and code budget on charts, heatmaps, records, historical analysis, hierarchy statistics, and experimental/fun views without bloating the main app.

The interface uses the same Windows 95-style visual language as TaskList, includes the same style of first-run password setup and login flow, and works as a normal browser app or installable PWA.

## What it does

TaskList Stats opens the existing TaskList SQLite database **read-only** and builds a browser-side snapshot containing lists, task/subtask records, timestamps, status, hierarchy IDs, and lifetime Universal ID information.

It can analyze **All lists**, one list, or any combination of lists and answer questions such as:

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

## Read-only TaskList database access

TaskList Stats does **not** create, update, or delete TaskList rows.

The TaskList SQLite database is opened with:

- `Mode=ReadOnly`
- `PRAGMA query_only = ON`

There are no TaskList-data write endpoints in the Stats API. The application reads TaskList data into a snapshot and performs its analysis in the browser.

Authentication does require one small writable Stats-owned file: `data/auth.json`. That file contains the salted password hash used to protect the Stats site; it is **not** part of the TaskList database and does not change TaskList data.

## Authentication

Starting with **v1.0.6**, TaskList Stats uses the same authentication design as TaskList.

### First-run setup

If `data/auth.json` does not exist when Stats starts, the server prints a one-time setup token to its console:

```text
============================================================
TASKLIST STATS FIRST-RUN SETUP TOKEN

  1234-ABCD-5678-EF90

Enter this token on the Create Password screen.
It changes each time TaskList Stats restarts until setup is complete.
============================================================
```

Open TaskList Stats in a browser. Instead of the statistics UI, you will see the **Create Password** screen.

Enter:

1. the setup token from the server console
2. a password of at least 8 characters
3. the same password again for confirmation

After setup, Stats writes `data/auth.json`, signs you in, and stops generating setup tokens on future starts.

TaskList Stats keeps its own authentication file and cookie, separate from the main TaskList app.

### Password storage

The plaintext password is never stored. `data/auth.json` contains a format version, PBKDF2 iteration count, random salt, and password hash.

The current implementation uses:

- PBKDF2-HMAC-SHA256
- 210,000 iterations
- 16-byte random salt
- 32-byte derived hash
- constant-time hash comparison during login

### Login session

Successful login creates a persistent ASP.NET Core cookie named:

```text
TaskListStats.Auth
```

The cookie is:

- `HttpOnly`
- `SameSite=Strict`
- `Secure` when the request itself uses HTTPS
- valid for up to 30 days
- sliding, so active sessions renew

**File → Log Out** clears the Stats session and returns to the login page.

If the session expires while Stats is already open, the next snapshot refresh returns to Login instead of incorrectly reporting a database outage.

### Login rate limiting

Password setup and login are rate-limited per source IP to 5 attempts per minute with no request queue. A rate-limited client receives HTTP `429 Too Many Requests`.

## Technology stack

- C# / ASP.NET Core Minimal API
- .NET 10
- ASP.NET Core cookie authentication and rate limiting
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
Program.cs                server, authentication, database reader, and API
appsettings.json          database path and listen-address configuration
README.md                 setup, behavior, security, and release documentation

data/                     runtime-created Stats-owned data directory
  auth.json               salted password hash after first-run setup

wwwroot/
  index.html              application shell and statistics panels
  login.html              TaskList-style login / first-run setup page
  login.js                login, setup-token, and return-URL behavior
  auth.css                login/setup page styling
  style.css               Windows 95-style Stats UI and responsive layout
  app.js                  core data handling and statistics rendering
  charts.js               chart drawing and chart interactions
  fun.js                  Fun-tab analyses
  records-v1.js           v1.x records/status/backlog/tree/auth compatibility layer
  manifest.webmanifest    installable-PWA metadata
  sw.js                   service worker and static-asset cache
  icons/stats.svg         app/favicon icon
```

## Requirements

For the server:

- .NET 10 SDK/runtime
- a TaskList `task-list.db` SQLite database
- read permission to the TaskList database file and its parent path
- write permission to the TaskList Stats working directory so `data/auth.json` can be created

For the client:

- a modern desktop or mobile browser
- JavaScript enabled

There is no Node.js/npm build step and no frontend package manager.

## First-time installation

```bash
git clone https://github.com/RotatingWires/task-list-stats.git
cd task-list-stats
dotnet restore
dotnet run
```

On the first run, copy the setup token printed in the console, open the Stats URL, and create the Stats password.

## Configuration

### `appsettings.json`

A typical configuration looks like:

```json
{
  "TaskListStats": {
    "DatabasePath": "/srv/task-list/data/task-list.db",
    "ListenUrl": "http://0.0.0.0:8712"
  }
}
```

`0.0.0.0` listens on all interfaces. Authentication protects the application, but a LAN/VPN firewall and HTTPS are still recommended.

### Environment variables

Environment variables override `appsettings.json`:

```bash
export TASKLIST_DB_PATH=/srv/task-list/data/task-list.db
export TASKLIST_STATS_URL=http://0.0.0.0:8712
```

| Variable | Purpose |
| --- | --- |
| `TASKLIST_DB_PATH` | Full or relative path to TaskList's SQLite database |
| `TASKLIST_STATS_URL` | Kestrel listen URL, e.g. `http://0.0.0.0:8712` |

If no usable database path is configured, the server also checks several common relative TaskList locations before returning an error.

## Configure TaskList deep links

Whenever Stats displays a task ID, it can link directly back into TaskList using:

```text
/task/<UniversalID>
```

TaskList opens the correct list, switches to **All**, scrolls to the task, and highlights it.

The TaskList origin is currently defined near the top of `wwwroot/app.js`:

```javascript
const TASKLIST_ORIGIN = 'http://tasklist.lehighradio.com:8711';
```

Change that constant if your TaskList instance uses a different hostname, IP, port, or HTTPS URL.

## API endpoints

Authentication endpoints are available before login. Data-bearing Stats endpoints require an authenticated session.

### `GET /api/auth/status`

Returns whether a password has been configured and whether the current request is authenticated.

### `POST /api/auth/setup`

First-run only. Accepts:

```json
{
  "setupToken": "1234-ABCD-5678-EF90",
  "password": "example password",
  "confirmPassword": "example password"
}
```

A successful setup writes `data/auth.json` and signs the browser in.

### `POST /api/auth/login`

Accepts a JSON object containing `password`. A successful login issues the Stats authentication cookie.

### `POST /api/auth/logout`

Requires authentication and clears the authentication cookie.

### `GET /api/health`

Requires authentication. Reports whether the configured TaskList database can be found and returns the server version.

### `GET /api/snapshot`

Requires authentication. Opens the TaskList database read-only and returns the data used by the browser:

- lists
- items
- Universal IDs
- task titles/descriptions
- current status
- creation/update/completion/cancellation/reopen timestamps
- database last-write time
- snapshot generation time

Unauthenticated data API requests return HTTP `401` rather than an HTML login page.

## Statistics sections

### Overview

Overview summarizes current activity, creation/completion records, completion behavior, backlog aging, completion-time buckets, and oldest open tasks.

Creation Records include most creations in one day/week/month, biggest creation hour, longest creation streak, and longest quiet streak.

Completion Records include most completions in one day/week/month, biggest completion hour, and longest completion streak.

On narrow mobile screens, record labels and values use balanced columns instead of allowing long record values to collapse the label column; on very narrow screens they stack vertically.

### Trends

Trends can group events by **day**, **week**, or **month** and includes Created / Completed / Cancelled trends, Approximate Backlog Over Time, busiest months, completion-speed months, and year-over-year monthly creation comparison.

Monthly labels use four-digit years such as `Sep 2026`.

### Calendar

Calendar includes the year activity heatmap, Created/Completed/Cancelled/All-activity modes, month calendar, Month × Year creation heatmap, and seasonality chart.

### Lists

The Lists tab compares TaskList lists using current counts, completion percentage, completion duration, share of current entries, and most-active-list-by-month history.

### Patterns

Patterns includes day-of-week and hour-of-day creation/completion charts, weekday × hour heatmap, workload rhythm metrics, and exam/test-window statistics.

Exam/test detection is a title heuristic, so select the appropriate school/homework list scope before interpreting those metrics.

### Trees & Titles

Trees & Titles analyzes nesting depth, roots with subtasks, direct-child/subtask averages, largest trees, deepest tasks, task-title categories, common words, and reopened-task information.

Since v1.0.5, hierarchy indexes are built in linear passes instead of repeatedly rescanning the selected scope, substantially improving this tab on large lists.

### Fun

The Fun area uses the same read-only snapshot for exploratory record/history tools such as Task Roulette. These analyses never mutate tasks.

## List filtering

The list selector is a multi-select Windows-style checklist.

- **All lists** is the default.
- Select one list to analyze only that list.
- Select several lists to analyze their combined scope.
- Unchecking the final selected list returns to **All lists**.

The selected scope is shared across the Stats tabs.

## Timestamp precision rules

TaskList data may contain full timestamps or imported date-only values. TaskList Stats deliberately does **not** invent a midnight time for date-only history.

Date-only values can participate in calendar-date statistics such as daily/monthly trends, calendars, heatmaps, seasonality, and weekday statistics.

Statistics that require an actual clock time use only confirmed timestamps containing a time component, including hour-of-day charts, weekday × hour heatmaps, biggest creation/completion hour, completion-duration statistics, and elapsed-time Fun calculations.

## Current-status semantics

TaskList can preserve an old `completed_at` or `cancelled_at` value even after a task later changes state.

Starting with v1.0.2, Stats treats the **current task status as authoritative** for completion/cancellation analytics:

- a task contributes to completion statistics only when its current status is `Done`
- a task contributes to cancellation statistics only when its current status is `Cancelled`
- creation statistics remain based on valid creation dates regardless of current status

## Why backlog history is approximate

TaskList stores useful timestamps but does not keep a complete append-only log of every historical status transition.

Stats reconstructs the best available state sequence. Done and Cancelled are treated as the same closed state for backlog accounting, while a reopen adds the task back only after a stored closed state.

Repeated older reopen cycles cannot always be reconstructed exactly, so the chart is explicitly named **Approximate Backlog Over Time**. Current counts are not approximate.

## Exporting a snapshot

Use **File → Export snapshot JSON...** to download the normalized snapshot currently loaded by Stats. Treat exports as private because they can contain task titles, descriptions, list names, IDs, statuses, and timestamps.

## Logging out

Use **File → Log Out**. Stats clears its authentication cookie and returns to the login screen.

## PWA behavior

The service worker:

- caches the application shell and login/setup assets
- uses network-first behavior for current static assets
- removes old versioned caches during activation
- always fetches `/api/*` from the network rather than serving API data from cache

The cached shell does not contain the TaskList snapshot. Live task data still requires an authenticated request to the Stats server.

## Optional Linux systemd service

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

The service account needs read access to the TaskList database and write access to the Stats working directory for `data/auth.json`.

## Security and privacy

Authentication reduces accidental/public access to the Stats UI and API, but it is not a substitute for good network security.

Recommended deployment model:

- use HTTPS when crossing an untrusted network
- prefer LAN, VPN, or a private reverse proxy
- firewall the Stats service to the devices/networks that need it
- keep `data/auth.json`, TaskList's database, and exported snapshots private
- give the Stats service account only the filesystem permissions it needs

Important distinctions:

- **TaskList database writes:** blocked by read-only SQLite mode and `PRAGMA query_only`.
- **Stats auth storage:** Stats writes only its own `data/auth.json` credential file.
- **Passwords:** plaintext passwords are never stored; only a salted PBKDF2 hash is saved.
- **Sessions:** the cookie is HttpOnly and SameSite=Strict; use HTTPS if the network is not trusted.
- **Snapshot exports:** contain personal task data and should be treated like a database export.

## Troubleshooting

### I only see Create Password

That is expected on the first run. Look at the TaskList Stats server console for the current setup token. If Stats restarts before setup finishes, the previous token stops working and a new one is printed.

### Login says "Too many attempts"

Setup and login allow 5 attempts per source IP per minute. Wait for the one-minute window to pass before retrying.

### `/api/health` or `/api/snapshot` returns 401

Those endpoints require a valid Stats login session. Log in through `/login.html` first.

### `TaskList database not found`

Check `TaskListStats:DatabasePath` or `TASKLIST_DB_PATH` and ensure the process has filesystem read access.

### The page shows `Database unavailable`

If the session expired, v1.0.6 and later return you to Login automatically. Otherwise, check `/api/health` and `/api/snapshot` after logging in; a 503 response normally includes the database/path error.

### Another computer cannot open Stats

Check the listen URL, host firewall, Kestrel bind address, routing/VPN connectivity, and any HTTPS/reverse-proxy configuration.

### Task-ID links open the wrong TaskList server

Change `TASKLIST_ORIGIN` near the top of `wwwroot/app.js`.

### Statistics differ from what you expected

Check the selected list scope, date-only versus full timestamps, current status versus stale historical terminal timestamps, and whether the value comes from the approximate backlog reconstruction.

### The installed PWA looks stale after an update

Reload while connected to the server. The service worker is network-first and each release uses a new cache name.

## Current release: v1.0.8

### v1.0.8

- removed the extra mobile top gap above the main blue title bar
- removed the same inherited top gap from the mobile login/setup window
- restored the centered **Log In / Create Password** title on mobile login/setup screens
- prevented long Overview record values from crushing labels into extremely narrow columns on mobile
- stack Overview record labels/values on very narrow screens for readability
- bumped UI, login, server/snapshot, assembly, README, and PWA cache metadata to v1.0.8

### v1.0.7

- fixed File-menu hover/focus highlighting so Refresh, Export snapshot JSON..., and Log Out fill the full menu row
- preserved the content-sized File menu width and existing command behavior

### v1.0.6

- added the TaskList-style first-run setup-token and password-creation flow
- added a matching Windows 95-style login screen
- stored Stats credentials as a salted PBKDF2-SHA256 hash in Stats-owned `data/auth.json`
- added a persistent/sliding HttpOnly SameSite=Strict Stats authentication cookie
- rate-limited setup/login to 5 attempts per source IP per minute
- protected Stats data API endpoints and application routes behind authentication
- added **File → Log Out**
- redirect expired sessions back to Login instead of reporting a false database outage
- added login/setup assets to the PWA shell cache
- ignored runtime/private Stats data in Git
- preserved read-only access to the TaskList SQLite database and all existing statistics behavior

### v1.0.5

- optimized Trees & Titles hierarchy calculations using prebuilt lookup indexes
- preserved existing hierarchy/title statistics while avoiding repeated whole-scope rescans

### v1.0.4

- changed monthly Trends labels to full four-digit years
- added list-context guidance to Task-Title Types

### v1.0.3

- fixed approximate backlog reconstruction using stored raw state-transition timestamps
- avoided double-subtracting Done ↔ Cancelled status changes

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

Earlier 0.x releases built the core charts, heatmaps, Fun analyses, deep linking, multi-list filtering, mobile layout, custom Windows-style controls, high-DPI chart fixes, date-only timestamp handling, and performance improvements. The Git commit history contains detailed release-by-release notes.

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
