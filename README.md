# Task List Stats

**Task List Stats v0.4** is a separate, read-only statistics app for the self-hosted **Task List** database.

It intentionally stays separate from Task List so charts, heatmaps, historical analysis, and reporting do not add bloat to the main task app.

## Stack

- C# / ASP.NET Core Minimal API
- Kestrel
- Microsoft.Data.Sqlite
- Plain HTML/CSS/JavaScript
- SQLite opened in **read-only** mode
- No ORM
- No frontend framework
- No chart library

The interface follows the same Windows 95-style visual language as Task List.

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

- Created / completed / cancelled trends grouped by day, week, or month, with hover values
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

## v0.2 interface refinements

- Hidden tab-strip scrollbar while retaining horizontal scrolling on narrow screens
- Removed the static unknown-date cards and the toolbar's dated-item count
- Record cards emphasize the winning month/week/day first, with counts underneath
- Windows 95-style hover explanations for completion behavior, workload rhythm, and exam/test-window metrics
- Removed the redundant completion-timestamp count from Completion behavior
- Added Y-axis labels and exact values above bar columns
- Added hover values to the trend and backlog line charts
- Made trend/backlog charts more compact and expanded the backlog explanation
- Added Completed counts to the Top 10 busiest months table
- Clarified that the year-over-year table counts tasks created
- Enlarged activity and weekday/hour heatmap cells and aligned month labels above month/year cells
- Added Created/Completed legends to weekday and hour pattern charts
- 12-hour AM/PM time labels throughout
- Removed the reopened-at implementation note from the tree summary

## v0.3 interface refinements

- Removed the duplicate custom metric tooltip so explanatory labels use only the browser-native tooltip
- Changed canvas-chart hover cards to a single black tooltip that follows the hovered data point
- Fixed trend/backlog month labels to use readable spacing such as `May 26`
- Increased chart label/value text size and added extra axis margins so first/last labels are not clipped
- Reduced hour-chart label density and staggered close grouped-bar values to avoid overlap
- Enlarged the year activity and month × year heatmaps while keeping the weekday × hour heatmap at its existing size
- Printed counts directly inside every heatmap cell and removed heatmap hover tooltips
- Increased month-calendar text size
- Fixed the View menu label to display `Trees & Titles` with one ampersand


## v0.4 interface refinements

- Made the statistics UI non-selectable to behave more like desktop application chrome
- Increased month-calendar typography and day-cell height
- Increased and bolded canvas chart labels, axis titles, ticks, and bar values
- Added explanatory hover text to day-of-week and hour-of-day pattern headings, including scope/history behavior
- Enlarged the weekday × hour heatmap cells and labels
- Explicitly use the Stats bar-chart icon as the browser favicon
- Removed the redundant `Depth N` subtitle from the Deepest nesting level card

## Historical-data limitation

Task List stores useful current timestamps:

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

Task List Stats never creates or modifies Task List tables. SQLite is opened with `Mode=ReadOnly` and `PRAGMA query_only=ON`.

Edit `appsettings.json`:

```json
{
  "TaskListStats": {
    "DatabasePath": "../task-list/data/task-list.db",
    "ListenUrl": "http://0.0.0.0:8172"
  }
}
```

The default path assumes the two Git repositories are sibling directories:

```text
projects/
├── task-list/
│   └── data/task-list.db
└── task-list-stats/
```

You can also override it without editing the file:

### Linux / macOS

```bash
TASKLIST_DB_PATH=/path/to/task-list.db dotnet run
```

### Windows PowerShell

```powershell
$env:TASKLIST_DB_PATH = 'C:\path\to\task-list.db'
dotnet run
```

The listening URL can likewise be overridden with `TASKLIST_STATS_URL`.

## Run

Requires .NET 10.

```bash
dotnet restore
dotnet run
```

Then open:

```text
http://NAS-IP:8172
```

The server and client are cross-platform. They can run on Windows, Linux, or macOS; the browser/PWA works on normal desktop and mobile browsers.

## Security

v0.4 does not add a second login system. Treat it like the rest of the local Task List deployment: keep it on your LAN/VPN and do not publicly forward the port.

The database connection itself is read-only, so the stats app cannot intentionally edit Task List data.

## Development philosophy

The same philosophy as Task List:

- boring technology
- small source tree
- no frameworks where plain browser APIs work
- no chart dependency for simple graphs
- database remains authoritative
- statistics app cannot mutate the task database

## Version

Task List Stats v0.4
