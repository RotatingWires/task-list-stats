using Microsoft.AspNetCore.Routing;
using Microsoft.Data.Sqlite;

static class MilestoneNotifications
{
    public static void MapEndpoints(RouteGroupBuilder api, Func<string> resolveDatabasePath, string viewer)
    {
        api.MapPost("/milestones/claim", async () =>
        {
            var path = resolveDatabasePath();
            if (!File.Exists(path)) return Results.Ok(Array.Empty<MilestoneNotice>());

            try
            {
                var connectionString = new SqliteConnectionStringBuilder
                {
                    DataSource = path,
                    Mode = SqliteOpenMode.ReadWrite,
                    Cache = SqliteCacheMode.Shared,
                    Pooling = true,
                    DefaultTimeout = 5
                }.ToString();

                await using var connection = new SqliteConnection(connectionString);
                await connection.OpenAsync();
                await using (var pragma = connection.CreateCommand())
                {
                    pragma.CommandText = "PRAGMA busy_timeout = 5000;";
                    await pragma.ExecuteNonQueryAsync();
                }

                await using (var exists = connection.CreateCommand())
                {
                    exists.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'milestone_notifications');";
                    if (Convert.ToInt64(await exists.ExecuteScalarAsync()) == 0)
                        return Results.Ok(Array.Empty<MilestoneNotice>());
                }

                var now = DateTimeOffset.UtcNow.ToString("O");
                var notices = new List<MilestoneNotice>();
                await using var command = connection.CreateCommand();
                command.CommandText = """
                    UPDATE milestone_notifications
                    SET viewed_at = $now, viewed_by = $viewer
                    WHERE viewed_at IS NULL
                    RETURNING kind, threshold, reached_at, historical;
                    """;
                command.Parameters.AddWithValue("$now", now);
                command.Parameters.AddWithValue("$viewer", viewer);
                await using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    notices.Add(new MilestoneNotice(
                        reader.GetString(0),
                        reader.GetInt64(1),
                        reader.GetString(2),
                        reader.GetInt64(3) != 0));
                }
                notices.Sort((a, b) => string.CompareOrdinal(a.ReachedAt, b.ReachedAt));
                return Results.Ok(notices);
            }
            catch (SqliteException ex)
            {
                return Results.Problem(
                    title: "Could not acknowledge TaskList milestone",
                    detail: ex.Message,
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        });
    }

    private sealed record MilestoneNotice(string Kind, long Threshold, string ReachedAt, bool Historical);
}
