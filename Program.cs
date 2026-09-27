using Microsoft.Data.Sqlite;
using System.Globalization;

var builder = WebApplication.CreateBuilder(args);

var configuredUrl = Environment.GetEnvironmentVariable("TASKLIST_STATS_URL")
    ?? builder.Configuration["TaskListStats:ListenUrl"]
    ?? "http://0.0.0.0:8172";
builder.WebHost.UseUrls(configuredUrl);

var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/health", () =>
{
    var path = ResolveDatabasePath(builder.Configuration);
    return Results.Ok(new
    {
        ok = File.Exists(path),
        version = "0.9",
        databaseFound = File.Exists(path),
        databaseFile = Path.GetFileName(path)
    });
});

app.MapGet("/api/snapshot", async () =>
{
    var dbPath = ResolveDatabasePath(builder.Configuration);
    if (!File.Exists(dbPath))
    {
        return Results.Problem(
            title: "TaskList database not found",
            detail: $"TaskList Stats could not find task-list.db. Set TaskListStats:DatabasePath in appsettings.json or the TASKLIST_DB_PATH environment variable. Resolved path: {dbPath}",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadOnly,
            Cache = SqliteCacheMode.Shared,
            Pooling = true,
            DefaultTimeout = 5
        }.ToString();

        await using var connection = new SqliteConnection(connectionString);
        await connection.OpenAsync();

        await using (var pragma = connection.CreateCommand())
        {
            pragma.CommandText = "PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;";
            await pragma.ExecuteNonQueryAsync();
        }

        var lists = new List<ListSnapshot>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, name, created_at FROM lists ORDER BY id;";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                lists.Add(new ListSnapshot(
                    reader.GetInt64(0),
                    reader.GetString(1),
                    reader.GetString(2)));
            }
        }

        var items = new List<ItemSnapshot>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                SELECT universal_id, list_id, display_id, parent_display_id, title, description, status,
                       created_at, updated_at, completed_at, cancelled_at, reopened_at
                FROM items
                ORDER BY universal_id;
                """;
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                items.Add(new ItemSnapshot(
                    reader.GetInt64(0),
                    reader.GetInt64(1),
                    reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3),
                    reader.GetString(4),
                    reader.IsDBNull(5) ? "" : reader.GetString(5),
                    reader.GetString(6),
                    reader.GetString(7),
                    reader.IsDBNull(8) ? null : reader.GetString(8),
                    reader.IsDBNull(9) ? null : reader.GetString(9),
                    reader.IsDBNull(10) ? null : reader.GetString(10),
                    reader.IsDBNull(11) ? null : reader.GetString(11)));
            }
        }

        long highestUniversalId = 0;
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT COALESCE(MAX(id), 0) FROM universal_ids;";
            var scalar = await command.ExecuteScalarAsync();
            highestUniversalId = Convert.ToInt64(scalar, CultureInfo.InvariantCulture);
        }

        var fileInfo = new FileInfo(dbPath);
        return Results.Ok(new StatsSnapshot(
            "0.9",
            DateTimeOffset.UtcNow.ToString("O"),
            fileInfo.LastWriteTimeUtc.ToString("O"),
            highestUniversalId,
            lists,
            items));
    }
    catch (SqliteException ex)
    {
        return Results.Problem(
            title: "Could not read TaskList database",
            detail: ex.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapFallbackToFile("index.html");
app.Run();

static string ResolveDatabasePath(IConfiguration configuration)
{
    var environmentPath = Environment.GetEnvironmentVariable("TASKLIST_DB_PATH");
    var configuredPath = environmentPath
        ?? configuration["TaskListStats:DatabasePath"]
        ?? "../task-list/TaskList/data/task-list.db";

    if (Path.IsPathRooted(configuredPath))
        return Path.GetFullPath(configuredPath);

    var basePath = Directory.GetCurrentDirectory();
    var candidates = new[]
    {
        configuredPath,
        "../task-list/TaskList/data/task-list.db",
        "../task-list/data/task-list.db",
        "../TaskList/data/task-list.db",
        "TaskList/data/task-list.db",
        "data/task-list.db"
    };

    foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        var full = Path.GetFullPath(Path.Combine(basePath, candidate));
        if (File.Exists(full)) return full;
    }

    return Path.GetFullPath(Path.Combine(basePath, configuredPath));
}

record ListSnapshot(long Id, string Name, string CreatedAt);
record ItemSnapshot(
    long UniversalId,
    long ListId,
    string DisplayId,
    string? ParentDisplayId,
    string Title,
    string Description,
    string Status,
    string CreatedAt,
    string? UpdatedAt,
    string? CompletedAt,
    string? CancelledAt,
    string? ReopenedAt);
record StatsSnapshot(
    string Version,
    string GeneratedAtUtc,
    string DatabaseLastWriteUtc,
    long HighestUniversalId,
    List<ListSnapshot> Lists,
    List<ItemSnapshot> Items);
