# TaskList Stats

**TaskList Stats v0.9** is a separate, read-only statistics app for the self-hosted **TaskList** database.

It intentionally stays separate from TaskList so charts, heatmaps, historical analysis, reporting, and experimental views do not add bloat to the main task app.

## v0.9

- Standardized current branding to **TaskList** and **TaskList Stats** across the UI, PWA metadata, product metadata, and documentation.
- Changed the Stats page background from teal to the same gray desktop surface used by TaskList.
- Added more bottom padding to the main tabs and Fun subtabs so labels no longer look clipped against the lower bevel.
- Added tap/click explanations for labels that previously depended on desktop hover tooltips.
- Added tap-to-inspect chart tooltips while retaining pointer hover behavior on desktop.
- Widened the Hour-of-Day chart and its grouped bars so values are easier to read and tap; tooltips include the actual hour plus Created/Completed counts.
- Fixed the Help dropdown width so `About TaskList Stats` is no longer truncated.
- Added **Night Owl**, **Early Bird**, **Same-Day Speedrun**, and **Cleanup Day** to Fun.

## v0.8

- Changed the app shell to a fixed-height desktop-style window so the page itself stays fixed and only the Stats workspace scrolls.
- Made canvas charts horizontally scrollable when their readable minimum width is wider than the viewport, preventing mobile label/value collisions.
- Added larger minimum widths for completion, trend, weekday/hour, seasonality, list-share, nesting-depth, and task-type charts.
- Fixed the mobile Month Calendar so its seven columns scroll inside the Calendar panel instead of forcing the whole page wider.
- Kept year, month/year, and weekday/hour heatmaps contained inside their own horizontal scroll areas.
- Standardized Fun result presentation so spotlight-style results use the same recessed table treatment as Time Machine.
- Removed the extra Task Roulette Result titlebar and flattened its result shell to match the other Fun tools.

## v0.7

- Task-ID links open TaskList in a new tab and use clean `/task/<UniversalID>` links.
- Removed Random Day, Guess the Stat, and Fortune Cookie from Fun.
- Increased Fun description and Déjà Vu table text sizes.
- Clarified Time Machine by separating the event on the selected date from each task's current status.
- Fixed bottom-edge presentation for Task Graveyard and Slowest Task.
- Expanded Personal Records, removed Highest Universal ID, and added additional day/month/tree/title records.
- On This Day now shows full month/day/year event dates.

## v0.6

- Task IDs shown in Stats deep-link into TaskList, selecting the correct list, switching to **All**, scrolling to the task, and highlighting it.
- Fixed high-DPI canvas charts growing taller after repeated list-filter changes.
- Expanded **Fun** with Task Roulette, Ancient Task, Forgotten Task, Time Machine, Productivity Jackpot, Task Graveyard, Personal Records, On This Day, Déjà Vu, Slowest Task, Speedrun, Random Day, Guess the Stat, and Task Fortune Cookie.
- Fun features remain local and use the read-only Stats snapshot.

## Stack

- C# / ASP.NET Core Minimal API
- Kestrel
- Microsoft.Data.Sqlite
- Plain HTML/CSS/JavaScript
- SQLite opened in **read-only** mode
- No ORM
- No frontend framework
- No chart library

The interface follows the same Windows 95-style visual language as TaskList.

## Statistics

### Overview

- Current total / Open / Done / Cancelled counts
- Root tasks vs subtasks
- Highest Universal ID / lifetime-entry count
- Approximate deleted-entry count
- Busiest month, week, and day
- Longest quiet streak
- Longest active streak
- First and latest dated task
- Completion percentage and cancellation percentage
- Average / median / fastest / slowest observed completion time
- Completion-time buckets
- Average / median open-task age
- Open for 7 / 30 / 90+ days
- Oldest currently open tasks

### Trends

- Created / completed / cancelled trends grouped by day, week, or month, with pointer/tap values
- Approximate historical backlog curve
- Top 10 busiest months with created and completed counts
- Fastest and slowest completion months
- Year-over-year monthly creation comparison
- Axis labels and exact bar values on charts

### Calendar & heatmaps

- Year activity heatmap for created, completed, cancelled, or all activity
- Month calendar with daily creation/completion/cancellation counts
- Month × year heatmap for seasonality
- Average creation volume by month of year

### Lists

- Per-list total / Open / Done / Cancelled
- Completion percentage
- Average completion time
- Share of all current entries
- Most active list by month

### Time patterns

- Day-of-week creation and completion patterns
- Hour-of-day creation and completion patterns
- Weekday × hour heatmap
- Average tasks per active week / month
- Exam/test workload comparison using titles containing `exam`, `test`, `midterm`, or `final`

### Trees & titles

- Deepest nesting level
- Percentage of root tasks with subtasks
- Average subtasks per root
- Average direct children per parent
- Largest task trees
- Deepest individual tasks
- Nesting-depth distribution
- Common title words
- Simple task-type inference (quiz, exam/test, reading, discussion, assignment, project, paper/essay, lab)
- Known reopened-task count and recently reopened tasks

### Fun

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
- Speedrun
- Night Owl
- Early Bird
- Same-Day Speedrun
- Cleanup Day

## Earlier interface refinements

### v0.5

- Added a tooltip to the Weekday × Hour Heatmap explaining its event timestamps, scope, and full-history behavior.
- Renamed the month/year panel to `Month × Year Heatmap (Created Tasks)` and standardized section headings to title case.
- Fixed canvas sizing so repeatedly changing the list filter no longer causes graphs to grow.
- Enlarged the Weekday × Hour Heatmap cells and labels.
- Added the Fun tab and Task Roulette.

### v0.4

- Made the statistics UI non-selectable to behave more like desktop application chrome.
- Increased month-calendar typography and day-cell height.
- Increased and bolded canvas chart labels, axis titles, ticks, and bar values.
- Added explanatory hover text to day-of-week and hour-of-day pattern headings.
- Enlarged the weekday × hour heatmap cells and labels.
- Added the Stats bar-chart favicon.

### v0.3

- Removed the duplicate custom metric tooltip.
- Added a single chart tooltip that follows hovered data.
- Improved month labels, chart label/value size, axis margins, and grouped-bar spacing.
- Enlarged heatmaps and printed counts inside heatmap cells.
- Fixed the `Trees & Titles` menu label.

### v0.2

- Refined overview cards, chart axes/values, trend/backlog presentation, busiest-month reporting, heatmaps, legends, and 12-hour time labels.

## Historical-data limitation

TaskList stores useful current timestamps:

- `created_at`
- `updated_at`
- `completed_at`
- `cancelled_at`
- `reopened_at`

It does **not** store a complete event log of every status transition. If a task is completed, reopened, completed again, reopened again, etc., older transitions cannot all be reconstructed.

Therefore:

- Current counts are exact.
- Creation statistics are exact for records with valid creation dates.
- Current stored completion/cancellation/reopen timestamps are exact.
- The historical backlog graph is explicitly **approximate** when repeated reopen cycles occurred.
- Imported records whose creation date is `Unknown` are excluded from date-based statistics.

## Database configuration

TaskList Stats never creates or modifies TaskList tables. SQLite is opened with `Mode=ReadOnly` and `PRAGMA query_only=ON`.

Edit `appsettings.json` for your local database path and listening address. You can also override the database path with `TASKLIST_DB_PATH` and the listening URL with `TASKLIST_STATS_URL`.

## Run

Requires .NET 10.

```bash
dotnet restore
dotnet run
```

The server and client are cross-platform. They can run on Windows, Linux, or macOS; the browser/PWA works on normal desktop and mobile browsers.

## Security

v0.9 does not add a second login system. Treat it like the rest of the local TaskList deployment: keep it on your LAN/VPN and do not publicly forward the port.

The database connection itself is read-only, so the Stats app cannot intentionally edit TaskList data.

## Development philosophy

The same philosophy as TaskList:

- boring technology
- small source tree
- no frameworks where plain browser APIs work
- no chart dependency for simple graphs
- database remains authoritative
- statistics app cannot mutate the task database

## Version

TaskList Stats v0.9
