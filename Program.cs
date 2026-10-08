using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.Sqlite;
using System.Globalization;
using System.Reflection;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var consoleLogPath = Path.Combine(builder.Environment.ContentRootPath, "logs", "console.log");
builder.Logging.AddProvider(new SingleFileLoggerProvider(consoleLogPath, 10 * 1024 * 1024));

var configuredUrl = Environment.GetEnvironmentVariable("TASKLIST_STATS_URL")
    ?? builder.Configuration["TaskListStats:ListenUrl"]
    ?? "http://0.0.0.0:8712";
builder.WebHost.UseUrls(configuredUrl);

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "TaskListStats.Auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.ExpireTimeSpan = TimeSpan.FromDays(30);
        options.SlidingExpiration = true;
        options.LoginPath = "/login.html";
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            else
                context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
            else
                context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

var app = builder.Build();
var appVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

var dataDir = Path.Combine(app.Environment.ContentRootPath, "data");
Directory.CreateDirectory(dataDir);
var authPath = Path.Combine(dataDir, "auth.json");

string? setupToken = PasswordConfigured(authPath) ? null : GenerateSetupToken();
if (setupToken is not null)
{
    Console.WriteLine();
    Console.WriteLine("============================================================");
    Console.WriteLine("TASKLIST STATS FIRST-RUN SETUP TOKEN");
    Console.WriteLine();
    Console.WriteLine($"  {setupToken}");
    Console.WriteLine();
    Console.WriteLine("Enter this token on the Create Password screen.");
    Console.WriteLine("It changes each time TaskList Stats restarts until setup is complete.");
    Console.WriteLine("============================================================");
    Console.WriteLine();
}

app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.Use(async (context, next) =>
{
    var path = context.Request.Path;
    var authenticated = context.User.Identity?.IsAuthenticated == true;

    if ((path == "/" || path == "/index.html") && !authenticated)
    {
        context.Response.Redirect("/login.html");
        return;
    }

    if (path == "/login.html" && authenticated)
    {
        context.Response.Redirect("/");
        return;
    }

    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/auth/status", (HttpContext context) => Results.Ok(new
{
    version = appVersion,
    configured = PasswordConfigured(authPath),
    authenticated = context.User.Identity?.IsAuthenticated == true
}));

app.MapPost("/api/auth/setup", async (SetupRequest request, HttpContext context) =>
{
    if (PasswordConfigured(authPath))
        return Results.Conflict(new { error = "A password has already been configured." });

    if (setupToken is null)
        return Results.Conflict(new { error = "No setup token is active. Restart TaskList Stats to generate a new one." });

    if (!SetupTokenMatches(setupToken, request.SetupToken))
        return Results.Json(new { error = "Invalid setup token." }, statusCode: StatusCodes.Status401Unauthorized);

    var passwordError = ValidateNewPassword(request.Password, request.ConfirmPassword);
    if (passwordError is not null)
        return Results.BadRequest(new { error = passwordError });

    SavePassword(authPath, request.Password!);
    setupToken = null;
    await SignInOwner(context);
    return Results.Ok(new { authenticated = true });
}).RequireRateLimiting("auth");

app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context) =>
{
    if (!PasswordConfigured(authPath))
        return Results.Conflict(new { error = "No password has been configured yet." });
    if (string.IsNullOrEmpty(request.Password) || !VerifyPassword(authPath, request.Password))
        return Results.Unauthorized();

    await SignInOwner(context);
    return Results.Ok(new { authenticated = true });
}).RequireRateLimiting("auth");

app.MapPost("/api/auth/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}).RequireAuthorization();

var api = app.MapGroup("/api").RequireAuthorization();

api.MapGet("/health", () =>
{
    var path = ResolveDatabasePath(builder.Configuration);
    return Results.Ok(new
    {
        ok = File.Exists(path),
        version = appVersion,
        databaseFound = File.Exists(path),
        databaseFile = Path.GetFileName(path)
    });
});

api.MapGet("/snapshot", async () =>
{
    var dbPath = ResolveDatabasePath(builder.Configuration);
    if (!File.Exists(dbPath))
    {
        return Results.Problem(title: "TaskList database not found", detail: $"TaskList Stats could not find task-list.db. Set TaskListStats:DatabasePath in appsettings.json or the TASKLIST_DB_PATH environment variable. Resolved path: {dbPath}", statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    try
    {
        await using var connection = await OpenReadOnlyConnectionAsync(dbPath);

        var lists = new List<ListSnapshot>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT id, name, created_at FROM lists ORDER BY id;";
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) lists.Add(new ListSnapshot(reader.GetInt64(0), reader.GetString(1), reader.GetString(2)));
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
                items.Add(new ItemSnapshot(reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4), reader.IsDBNull(5) ? "" : reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.IsDBNull(8) ? null : reader.GetString(8), reader.IsDBNull(9) ? null : reader.GetString(9), reader.IsDBNull(10) ? null : reader.GetString(10), reader.IsDBNull(11) ? null : reader.GetString(11)));
            }
        }

        var eventLogAvailable = await TaskEventsAvailableAsync(connection);

        long highestUniversalId = 0;
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = "SELECT COALESCE(MAX(id), 0) FROM universal_ids;";
            highestUniversalId = Convert.ToInt64(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture);
        }

        var fileInfo = new FileInfo(dbPath);
        return Results.Ok(new StatsSnapshot(appVersion, DateTimeOffset.UtcNow.ToString("O"), fileInfo.LastWriteTimeUtc.ToString("O"), highestUniversalId, lists, items, eventLogAvailable, []));
    }
    catch (SqliteException ex)
    {
        return Results.Problem(title: "Could not read TaskList database", detail: ex.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

api.MapGet("/events", async (long? afterId, string? cursor) =>
{
    var dbPath = ResolveDatabasePath(builder.Configuration);
    if (!File.Exists(dbPath))
    {
        return Results.Problem(
            title: "TaskList database not found",
            detail: "TaskList Stats could not find task-list.db.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        await using var connection = await OpenReadOnlyConnectionAsync(dbPath);

        var requestedAfterId = Math.Max(0, afterId ?? 0);
        if (!await TaskEventsAvailableAsync(connection))
            return Results.Ok(new EventBatch(requestedAfterId > 0, 0, null, []));

        var resetRequired = false;
        EventSnapshot? anchor = null;

        if (requestedAfterId > 0)
        {
            await using var anchorCommand = connection.CreateCommand();
            anchorCommand.CommandText = """
                SELECT id, universal_id, event_type, event_at, from_status, to_status,
                       list_id, display_id, parent_display_id, title, source
                FROM task_events
                WHERE id = $afterId;
                """;
            anchorCommand.Parameters.AddWithValue("$afterId", requestedAfterId);

            await using var anchorReader = await anchorCommand.ExecuteReaderAsync();
            if (await anchorReader.ReadAsync())
                anchor = ReadEvent(anchorReader);

            if (anchor is null ||
                string.IsNullOrWhiteSpace(cursor) ||
                !string.Equals(EventCursor(anchor), cursor, StringComparison.OrdinalIgnoreCase))
            {
                resetRequired = true;
                requestedAfterId = 0;
                anchor = null;
            }
        }

        var events = new List<EventSnapshot>();
        await using (var command = connection.CreateCommand())
        {
            command.CommandText = """
                SELECT id, universal_id, event_type, event_at, from_status, to_status,
                       list_id, display_id, parent_display_id, title, source
                FROM task_events
                WHERE id > $afterId
                ORDER BY id;
                """;
            command.Parameters.AddWithValue("$afterId", requestedAfterId);

            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                events.Add(ReadEvent(reader));
        }

        var lastEvent = anchor;
        foreach (var item in events)
        {
            if (lastEvent is null || item.Id > lastEvent.Id)
                lastEvent = item;
        }

        return Results.Ok(new EventBatch(
            resetRequired,
            lastEvent?.Id ?? 0,
            lastEvent is null ? null : EventCursor(lastEvent),
            events));
    }
    catch (SqliteException ex)
    {
        return Results.Problem(
            title: "Could not read TaskList event history",
            detail: ex.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapFallbackToFile("index.html").RequireAuthorization();
app.Run();

static string ResolveDatabasePath(IConfiguration configuration)
{
    var environmentPath = Environment.GetEnvironmentVariable("TASKLIST_DB_PATH");
    var configuredPath = environmentPath ?? configuration["TaskListStats:DatabasePath"] ?? "../task-list/TaskList/data/task-list.db";
    if (Path.IsPathRooted(configuredPath)) return Path.GetFullPath(configuredPath);
    var basePath = Directory.GetCurrentDirectory();
    var candidates = new[] { configuredPath, "../task-list/TaskList/data/task-list.db", "../task-list/data/task-list.db", "../TaskList/data/task-list.db", "TaskList/data/task-list.db", "data/task-list.db" };
    foreach (var candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        var full = Path.GetFullPath(Path.Combine(basePath, candidate));
        if (File.Exists(full)) return full;
    }
    return Path.GetFullPath(Path.Combine(basePath, configuredPath));
}

static async Task<SqliteConnection> OpenReadOnlyConnectionAsync(string dbPath)
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
        await connection.OpenAsync();
        await using var pragma = connection.CreateCommand();
        pragma.CommandText = "PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;";
        await pragma.ExecuteNonQueryAsync();
        return connection;
    }
    catch
    {
        await connection.DisposeAsync();
        throw;
    }
}

static async Task<bool> TaskEventsAvailableAsync(SqliteConnection connection)
{
    await using var command = connection.CreateCommand();
    command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'task_events');";
    return Convert.ToInt64(await command.ExecuteScalarAsync(), CultureInfo.InvariantCulture) != 0;
}

static EventSnapshot ReadEvent(SqliteDataReader reader) => new(
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

static string EventCursor(EventSnapshot item)
{
    var payload = string.Join('\u001F',
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

static string GenerateSetupToken()
{
    var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(8));
    return $"{raw[..4]}-{raw[4..8]}-{raw[8..12]}-{raw[12..16]}";
}

static bool SetupTokenMatches(string expected, string? supplied)
{
    if (string.IsNullOrWhiteSpace(supplied)) return false;
    var expectedValue = expected.Replace("-", string.Empty, StringComparison.Ordinal);
    var suppliedValue = Regex.Replace(supplied, @"[\s-]", string.Empty);
    return string.Equals(expectedValue, suppliedValue, StringComparison.OrdinalIgnoreCase);
}

static bool PasswordConfigured(string authPath) => File.Exists(authPath);

static string? ValidateNewPassword(string? password, string? confirmation)
{
    if (string.IsNullOrEmpty(password) || password.Length < 8)
        return "Password must be at least 8 characters long.";
    if (password != confirmation)
        return "Passwords do not match.";
    return null;
}

static void SavePassword(string authPath, string password)
{
    const int iterations = 210_000;
    var salt = RandomNumberGenerator.GetBytes(16);
    var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, 32);
    var auth = new PasswordFile(1, iterations, Convert.ToBase64String(salt), Convert.ToBase64String(hash));
    File.WriteAllText(authPath, JsonSerializer.Serialize(auth));
}

static bool VerifyPassword(string authPath, string password)
{
    try
    {
        var auth = JsonSerializer.Deserialize<PasswordFile>(File.ReadAllText(authPath));
        if (auth is null || auth.Version != 1 || auth.Iterations < 1) return false;
        var salt = Convert.FromBase64String(auth.Salt);
        var expected = Convert.FromBase64String(auth.Hash);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, auth.Iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
    catch
    {
        return false;
    }
}

static async Task SignInOwner(HttpContext context)
{
    var identity = new ClaimsIdentity(
        [new Claim(ClaimTypes.NameIdentifier, "owner"), new Claim(ClaimTypes.Name, "Owner")],
        CookieAuthenticationDefaults.AuthenticationScheme);
    var principal = new ClaimsPrincipal(identity);
    await context.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        principal,
        new AuthenticationProperties
        {
            IsPersistent = true,
            AllowRefresh = true,
            ExpiresUtc = DateTimeOffset.UtcNow.AddDays(30)
        });
}

record LoginRequest(string? Password);
record SetupRequest(string? SetupToken, string? Password, string? ConfirmPassword);
record PasswordFile(int Version, int Iterations, string Salt, string Hash);
record ListSnapshot(long Id, string Name, string CreatedAt);
record ItemSnapshot(long UniversalId, long ListId, string DisplayId, string? ParentDisplayId, string Title, string Description, string Status, string CreatedAt, string? UpdatedAt, string? CompletedAt, string? CancelledAt, string? ReopenedAt);
record EventSnapshot(long Id, long UniversalId, string EventType, string EventAt, string? FromStatus, string? ToStatus, long ListId, string DisplayId, string? ParentDisplayId, string Title, string Source);
record EventBatch(bool ResetRequired, long LastEventId, string? Cursor, List<EventSnapshot> Events);
record StatsSnapshot(string Version, string GeneratedAtUtc, string DatabaseLastWriteUtc, long HighestUniversalId, List<ListSnapshot> Lists, List<ItemSnapshot> Items, bool EventLogAvailable, List<EventSnapshot> Events);
