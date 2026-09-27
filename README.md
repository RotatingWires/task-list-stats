# TaskList Stats

**TaskList Stats v0.22** is a separate, read-only statistics app for the self-hosted **TaskList** database.

It intentionally stays separate from TaskList so charts, heatmaps, historical analysis, reporting, and experimental views do not add bloat to the main task app.

## v0.22

- Make Fun render only the currently visible Fun subtab instead of recalculating every hidden Fun analysis after each button click.
- Time Machine, Ancient Task, Productivity Jackpot, Task Graveyard, and future Fun actions now share the same active-panel rendering path, preventing hidden expensive work from delaying interactive buttons.
- Optimize Personal Records tree-size and direct-child calculations from repeated whole-list scans to single-pass lookup maps.
- Keep Fun rerendering scoped to the currently selected subtab when the database snapshot or list filter changes.
- Bump server, snapshot, assembly, UI, README, and PWA cache metadata to v0.22.

## v0.21

- Simplified Night Owl, Early Bird, and Cleanup Day wording so the UI talks about times directly instead of repeatedly saying “confirmed times.”
- Matched TaskList's current mobile bottom spacing: 5px minimum plus the iOS safe-area inset, with the same left/right safe-area treatment.
- Added `--ios-top-offset` and `--ios-bottom-offset` CSS variables so the top and bottom mobile offsets can be tuned in one place.
- Set the current top offset to 0px and bottom offset to 5px to match TaskList's present values.
- Removed an older overridden mobile window min-height rule that no longer affected the current fullscreen layout.

## v0.20

- Require confirmed creation and completion clock times for all elapsed completion-duration statistics; date-only imported history remains available to date-based views without becoming fake midnight precision.
- Require confirmed clock times for Task Roulette terminal duration and Task Graveyard age-when-closed calculations.
- Fixed Calendar scope changes so the month picker follows the selected year instead of retaining a stale month from a different list/year.
- Clear stale line-chart tooltip data whenever a filtered chart has no data.
- Removed the unused `eventMaps` helper and duplicate confirmed-time/increment helpers from `fun.js`.
- Changed the server fallback listen port from the stale 8172 value to the current Stats port, 8712.
- Removed the obsolete teal root-page background and corrected README release ordering.

## v0.19

- Fixed Hour-of-Day and Weekday-by-Hour analyses so date-only imported history is not treated as midnight.
- Keep weekday-only counts date-aware, but only include events with confirmed timestamps in hour-of-day charts and heatmaps.
- Updated the busiest creation hour metric to exclude date-only history.

## v0.18

- Preserve date-only imported values such as `2026-05-12` as that exact local calendar date instead of letting JavaScript interpret them as UTC midnight and potentially shift them to the previous day.
- Keep date-only history available for calendar/day/month statistics while time-of-day tools continue to require confirmed timestamps.
- Automatically shrink long vertical Y-axis labels on compact desktop charts so labels such as `Average tasks created` are not clipped.

## v0.17

- Made the TaskList Stats window fill the entire browser viewport so no outer page background/margin is visible.
- Prevented the Hour-of-Day chart from crowding the final 10 PM and 11 PM x-axis labels together while retaining all 24 data groups.
- Kept the compact desktop chart sizing and the wider horizontally scrollable mobile chart sizing from v0.16.

## v0.16

- Removed the regular Speedrun Fun tool completely; Same-Day Speedrun remains.
- Made charts shorter and capped full-width chart frames on laptop/desktop screens.
- Kept the larger horizontally scrollable chart widths on mobile, while retaining smaller desktop minimum widths only for dense Hour-of-Day and Task-Title charts.

## v0.15

- Fixed automatic database loading by making startup one-time and independent of DOMContentLoaded timing.
- Load chart/Fun modules before the core app and render only the visible tab, preventing hidden canvases or module timing from breaking later sections.
- Restored Backlog Over Time and line-chart tooltip initialization when the Trends tab becomes visible.
- Restored full Fun-tab initialization instead of leaving only the static Task Roulette panel.
- Kept TaskList task links explicitly interactive and opening in a new tab.
- Widened the File menu so Export snapshot JSON... is not clipped.
- Changed the service worker to network-first for current app assets to prevent stale mixed-version JavaScript/CSS after updates.

## v0.14

- Speedrun and Same-Day Speedrun now require confirmed creation and completion times; date-only imported history is excluded.
- Added a 5-minute minimum elapsed time to Speedrun, Same-Day Speedrun, and the fastest-completion record.
- Cleanup Day now counts and lists only creation/completion events with confirmed times.
- Night Owl and Early Bird now ignore date-only history because time-of-day is unknown.

## v0.13

- Replaced the historical `v06-core.js`, `v07.js`, and `v09.js` patch chain with current-purpose `charts.js` and `fun.js` modules.
- Removed runtime monkey-patching of `renderAll`, chart renderers, Roulette, and table rendering.
- Kept one canonical task-link implementation in `app.js`.
- Moved line-chart tooltip behavior into the chart module; bar charts remain tooltip-free.
- Moved all active Fun behavior into one current Fun module, including Night Owl, Early Bird, Same-Day Speedrun, and Cleanup Day.
- Folded dynamically injected Fun/mobile/menu styles into `style.css`; no current module injects release-specific CSS.
- Deleted the three historical-version JavaScript files from the repository and PWA cache.

## v0.12

- Fixed the cleanup regression that left fresh page loads stuck on `Loading database...` until **File → Refresh** was clicked.
- Fixed the strict-mode line-chart tooltip binding that caused `v09.js` to stop before automatic startup finished.
- Kept line-chart hover/tap tooltips while bar charts remain tooltip-free.
- Resized the Help dropdown to fit `About TaskList Stats` without an oversized button or a truncated label.
- Restored **Night Owl**, **Early Bird**, **Same-Day Speedrun**, and **Cleanup Day** during normal initial page load.
- Bumped server, snapshot, assembly, UI, About dialog, and PWA cache metadata to v0.12.

## v0.11

- Physically removed Random Day, Guess the Stat, and Fortune Cookie code/CSS instead of creating them and hiding/removing their UI later.
- Removed the old task-link upgrade observer and query-string compatibility parsing; Stats now creates canonical `/task/<UniversalID>` links directly.
- Removed the all-canvas tooltip binding left over from v0.9; only line charts install chart tooltip behavior.
- Removed the old desktop `.chart-tooltip` implementation and the unused Roulette titlebar styles.
- Consolidated v0.8 layout/mobile CSS and v0.10 single-arrow dropdown CSS into `style.css`.
- Moved single-arrow select initialization into `app.js`.
- Deleted `v06.js`, `v08.js`, and `v10.js`; active scripts now load directly and sequentially.
- Removed stale runtime version-title setters from older feature layers.

## v0.10

- Standardized TaskList and TaskList Stats naming directly across current source and documentation.
- Removed bar-chart hover/tap tooltips while keeping line-chart hover and mobile tap-to-inspect tooltips.
- Replaced native up/down select chrome in tab controls with a single-down-arrow Win95-style wrapper matching the top List picker.
- Set the repository ListenUrl to `http://192.168.1.12:8712`.
- Bumped server/assembly metadata and the PWA cache to v0.10.

## v0.9

- Standardized current branding to **TaskList** and **TaskList Stats** across the UI, PWA metadata, product metadata, and documentation.
- Changed the Stats page background from teal to the same gray desktop surface used by TaskList.
- Added more bottom padding to the main tabs and Fun subtabs so labels no longer look clipped against the lower bevel.
- Added tap/click explanations for labels that previously depended on desktop hover tooltips.
- Added tap-to-inspect chart tooltips while retaining pointer hover behavior on desktop.
- Widened the Hour-of-Day chart and its grouped bars so values are easier to read.
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
- Average / median / fastest / slowest observed completion time from confirmed timestamp pairs
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
- Average completion time from confirmed timestamp pairs
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

TaskList Stats does not add a second login system. Treat it like the rest of the local TaskList deployment: keep it on your LAN/VPN and do not publicly forward the port.

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

TaskList Stats v0.17
