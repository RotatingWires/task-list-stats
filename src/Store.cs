using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;

/// <summary>
/// Reading TaskList's database, read-only: the snapshot of lists and tasks, the event history in pages, and the
/// connection rules. Program.cs imports these with `using static Store;`, like TaskList's Store.cs.
/// </summary>
static class Store
{
    /// <summary>Lists, tasks, deleted list names, and whether event history exists, read in one transaction.</summary>
    internal static StatsSnapshot ReadSnapshot(string dbPath, string appVersion, string taskListUrl)
    {
        using var connection = OpenReadOnlyConnection(dbPath);
        using var readTransaction = connection.BeginTransaction(deferred: true);

        var lists = new List<ListSnapshot>();
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, name, created_at FROM lists ORDER BY id;";
            using var reader = command.ExecuteReader();
            while (reader.Read()) lists.Add(new ListSnapshot(reader.GetInt64(0), reader.GetString(1), reader.GetString(2)));
        }

        var deletedLists = new List<DeletedListSnapshot>();
        if (TableExists(connection, "deleted_lists"))
        {
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT id, name FROM deleted_lists ORDER BY id;";
            using var reader = command.ExecuteReader();
            while (reader.Read())
                deletedLists.Add(new DeletedListSnapshot(reader.GetInt64(0), reader.GetString(1)));
        }

        var items = new List<ItemSnapshot>();
        using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                SELECT universal_id, list_id, display_id, parent_display_id, title, description, status,
                       created_at, updated_at, completed_at, cancelled_at, reopened_at
                FROM items
                ORDER BY universal_id;
                """;
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                items.Add(new ItemSnapshot(reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4), reader.IsDBNull(5) ? "" : reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.IsDBNull(8) ? null : reader.GetString(8), reader.IsDBNull(9) ? null : reader.GetString(9), reader.IsDBNull(10) ? null : reader.GetString(10), reader.IsDBNull(11) ? null : reader.GetString(11)));
            }
        }

        var eventLogAvailable = TableExists(connection, "task_events");

        long highestUniversalId = 0;
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT COALESCE(MAX(id), 0) FROM universal_ids;";
            highestUniversalId = Convert.ToInt64(command.ExecuteScalar(), CultureInfo.InvariantCulture);
        }

        var fileInfo = new FileInfo(dbPath);
        return new StatsSnapshot(appVersion, DateTimeOffset.UtcNow.ToString("O"), fileInfo.LastWriteTimeUtc.ToString("O"), highestUniversalId, lists, deletedLists, items, eventLogAvailable, [], taskListUrl);
    }

    /// <summary>The next page of task events after afterId; resetRequired when TaskList's history changed under the cursor.</summary>
    internal static EventBatch ReadEvents(string dbPath, long? afterId, string? cursor)
    {
        using var connection = OpenReadOnlyConnection(dbPath);
        using var readTransaction = connection.BeginTransaction(deferred: true);

        var requestedAfterId = Math.Max(0, afterId ?? 0);
        if (!TableExists(connection, "task_events"))
            return new EventBatch(requestedAfterId > 0, 0, null, []);

        var historyRevision = string.Empty;
        if (TableExists(connection, "task_history_state"))
        {
            using var history = connection.CreateCommand();
            history.CommandText = "SELECT revision FROM task_history_state WHERE id=1;";
            historyRevision = Convert.ToString(history.ExecuteScalar(), CultureInfo.InvariantCulture) ?? string.Empty;
        }

        var resetRequired = false;
        EventSnapshot? anchor = null;

        if (requestedAfterId > 0)
        {
            using var anchorCommand = connection.CreateCommand();
            anchorCommand.CommandText = """
                SELECT id, universal_id, event_type, event_at, from_status, to_status,
                       list_id, display_id, parent_display_id, title, source
                FROM task_events
                WHERE id = $afterId;
                """;
            anchorCommand.Parameters.AddWithValue("$afterId", requestedAfterId);

            using var anchorReader = anchorCommand.ExecuteReader();
            if (anchorReader.Read())
                anchor = ReadEvent(anchorReader);

            if (anchor is null ||
                string.IsNullOrWhiteSpace(cursor) ||
                !string.Equals(EventCursor(anchor, historyRevision), cursor, StringComparison.OrdinalIgnoreCase))
            {
                resetRequired = true;
                requestedAfterId = 0;
                anchor = null;
            }
        }

        var events = new List<EventSnapshot>();
        using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                SELECT id, universal_id, event_type, event_at, from_status, to_status,
                       list_id, display_id, parent_display_id, title, source
                FROM task_events
                WHERE id > $afterId
                ORDER BY id;
                """;
            command.Parameters.AddWithValue("$afterId", requestedAfterId);

            using var reader = command.ExecuteReader();
            while (reader.Read())
                events.Add(ReadEvent(reader));
        }

        var lastEvent = anchor;
        foreach (var item in events)
        {
            if (lastEvent is null || item.Id > lastEvent.Id)
                lastEvent = item;
        }

        return new EventBatch(
            resetRequired,
            lastEvent?.Id ?? 0,
            lastEvent is null ? null : EventCursor(lastEvent, historyRevision),
            events);
    }

    internal static string ResolveDatabasePath(IConfiguration configuration)
    {
        var environmentPath = Environment.GetEnvironmentVariable("TASKLIST_DB_PATH");
        var configuredPath = environmentPath ?? configuration["TaskListStats:DatabasePath"] ?? "../task-list/data/tasklist.db";
        var basePath = Directory.GetCurrentDirectory();
        var candidates = Path.IsPathRooted(configuredPath)
            ? [configuredPath]
            : new[] { configuredPath, "../task-list/data/tasklist.db", "../task-list/TaskList/data/tasklist.db", "../TaskList/data/tasklist.db", "TaskList/data/tasklist.db", "data/tasklist.db" };
        foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var full = Path.GetFullPath(Path.Combine(basePath, candidate));
            // TaskList before v1.7.22 named its database task-list.db; either name in the same folder works.
            var folder = Path.GetDirectoryName(full)!;
            foreach (var name in new[] { Path.GetFileName(full), "tasklist.db", "task-list.db" })
                if (File.Exists(Path.Combine(folder, name))) return Path.Combine(folder, name);
        }
        return Path.GetFullPath(Path.Combine(basePath, configuredPath));
    }

    internal static SqliteConnection OpenReadOnlyConnection(string dbPath)
    {
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadOnly,
            Cache = SqliteCacheMode.Private,
            Pooling = true,
            DefaultTimeout = 5
        }.ToString();

        var connection = new SqliteConnection(connectionString);
        try
        {
            connection.Open();
            using var pragma = connection.CreateCommand();
            pragma.CommandText = "PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;";
            pragma.ExecuteNonQuery();
            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    internal static bool TableExists(SqliteConnection connection, string tableName)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $tableName);";
        command.Parameters.AddWithValue("$tableName", tableName);
        return Convert.ToInt64(command.ExecuteScalar(), CultureInfo.InvariantCulture) != 0;
    }

    internal static EventSnapshot ReadEvent(SqliteDataReader reader) => new(
        reader.GetInt64(0),
        reader.GetInt64(1),
        reader.GetString(2),
        reader.GetString(3),
        reader.IsDBNull(4) ? null : reader.GetString(4),
        reader.IsDBNull(5) ? null : reader.GetString(5),
        reader.GetInt64(6),
        reader.GetString(7),
        reader.IsDBNull(8) ? null : reader.GetString(8),
        reader.GetString(9),
        reader.GetString(10));

    internal static string EventCursor(EventSnapshot item, string historyRevision)
    {
        var payload = string.Join('\u001F',
            historyRevision,
            item.Id.ToString(CultureInfo.InvariantCulture),
            item.UniversalId.ToString(CultureInfo.InvariantCulture),
            item.EventType,
            item.EventAt,
            item.FromStatus ?? string.Empty,
            item.ToStatus ?? string.Empty,
            item.ListId.ToString(CultureInfo.InvariantCulture),
            item.DisplayId,
            item.ParentDisplayId ?? string.Empty,
            item.Title,
            item.Source);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(payload)));
    }
}

record ListSnapshot(long Id, string Name, string CreatedAt);
record DeletedListSnapshot(long Id, string Name);
record ItemSnapshot(long UniversalId, long ListId, string DisplayId, string? ParentDisplayId, string Title, string Description, string Status, string CreatedAt, string? UpdatedAt, string? CompletedAt, string? CancelledAt, string? ReopenedAt);
record EventSnapshot(long Id, long UniversalId, string EventType, string EventAt, string? FromStatus, string? ToStatus, long ListId, string DisplayId, string? ParentDisplayId, string Title, string Source);
record EventBatch(bool ResetRequired, long LastEventId, string? Cursor, List<EventSnapshot> Events);
record StatsSnapshot(string Version, string GeneratedAtUtc, string DatabaseLastWriteUtc, long HighestUniversalId, List<ListSnapshot> Lists, List<DeletedListSnapshot> DeletedLists, List<ItemSnapshot> Items, bool EventLogAvailable, List<EventSnapshot> Events, string TaskListUrl);
