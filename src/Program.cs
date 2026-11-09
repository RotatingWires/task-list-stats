using static Store;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
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

// TaskList Stats options are read here; everything else (such as --urls) goes to ASP.NET Core. Same as NewsReview.
if (args is ["--version"])
{
    Console.WriteLine(Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0");
    return;
}
var hostArgs = new List<string>();
string? dataDirectoryArgument = null;
for (var i = 0; i < args.Length; i++)
{
    if (args[i] == "--data-dir" && i + 1 < args.Length) dataDirectoryArgument = args[++i];
    else hostArgs.Add(args[i]);
}

var builder = WebApplication.CreateBuilder(hostArgs.ToArray());
// --data-dir, then the TaskListStats:DataDirectory setting, then TASKLISTSTATS_DATA_DIR, then data/ next to the app.
var dataDir = Path.GetFullPath(dataDirectoryArgument ?? builder.Configuration["TaskListStats:DataDirectory"]
    ?? Environment.GetEnvironmentVariable("TASKLISTSTATS_DATA_DIR") ?? Path.Combine(builder.Environment.ContentRootPath, "data"));
Directory.CreateDirectory(dataDir);
var consoleLogPath = Path.Combine(builder.Environment.ContentRootPath, "logs", "console.log");
builder.Logging.AddProvider(new SingleFileLoggerProvider(consoleLogPath, 10 * 1024 * 1024));

// Loopback unless --urls, ASPNETCORE_URLS, or an appsettings "urls" value chooses another address.
if (string.IsNullOrEmpty(builder.Configuration["urls"]))
    builder.WebHost.UseUrls("http://127.0.0.1:8712");

// Session-cookie keys must outlive restarts, or every restart signs you out. On Windows with a loaded user profile
// (signed in and started from a terminal), they stay in that profile's ASP.NET key ring. Otherwise (Linux, including
// services under systemd ProtectHome, and Windows Task Scheduler without a loaded profile) they live in data/keys;
// Windows then uses machine-scope DPAPI, since user-scope DPAPI fails when the profile isn't loaded. Same as NewsReview.
var keysDirectory = Path.Combine(dataDir, "keys");
var profileKeyRing = OperatingSystem.IsWindows()
    && Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) is { Length: > 0 } localAppData
    && Directory.Exists(localAppData);
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("TaskListStats");
if (!profileKeyRing)
{
    dataProtection.PersistKeysToFileSystem(new DirectoryInfo(keysDirectory));
    if (OperatingSystem.IsWindows()) dataProtection.ProtectKeysWithDpapi(protectToLocalMachine: true);
}
var keyLocation = profileKeyRing ? "this Windows profile's ASP.NET key ring" : keysDirectory;

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
                context.Response.Redirect(LoginRedirect(context));
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

// Brotli or gzip for text responses (data, scripts, styles), so they cross the network several times smaller.
// HTTPS responses are left uncompressed, ASP.NET's default, which avoids compression side-channel attacks there.
builder.Services.AddResponseCompression(options =>
{
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["image/svg+xml", "application/manifest+json"]);
});

var app = builder.Build();
app.UseResponseCompression();
var appVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

var authPath = Path.Combine(dataDir, "auth.json");
app.Logger.LogInformation("TaskList Stats v{Version}, data folder {DataDirectory}.", appVersion, dataDir);
app.Logger.LogInformation("Database: {DatabasePath}, opened read-only, busy_timeout=5000 ms.", ResolveDatabasePath(builder.Configuration));
app.Logger.LogInformation("Sign-in keys: {Location}.", keyLocation);

string? setupToken = PasswordAuth.IsConfigured(authPath) ? null : PasswordAuth.GenerateSetupToken();
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

// Browser hardening: API replies are never stored, and pages and scripts are checked for changes on every load.
app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        var headers = context.Response.Headers;
        headers.CacheControl = context.Request.Path.StartsWithSegments("/api") ? "no-store" : "no-cache";
        headers.XContentTypeOptions = "nosniff";
        headers["Referrer-Policy"] = "no-referrer";
        headers.ContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
        return Task.CompletedTask;
    });
    await next();
});
// Cross-origin writes are refused before rate limiting, so they never use up login attempts.
app.Use(async (context, next) =>
{
    if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
    {
        var origin = context.Request.Headers.Origin.ToString();
        var sameOrigin = origin.Length == 0
            || (Uri.TryCreate(origin, UriKind.Absolute, out var originUri)
                && string.Equals(originUri.Authority, context.Request.Host.Value, StringComparison.OrdinalIgnoreCase));
        if (context.Request.Headers["Sec-Fetch-Site"] == "cross-site" || !sameOrigin)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { error = "Cross-origin writes are not allowed." });
            return;
        }
    }
    await next();
});
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
    configured = PasswordAuth.IsConfigured(authPath),
    authenticated = context.User.Identity?.IsAuthenticated == true
}));

app.MapPost("/api/auth/setup", async (SetupRequest request, HttpContext context) =>
{
    if (PasswordAuth.IsConfigured(authPath))
        return Results.Conflict(new { error = "A password is already configured." });

    if (setupToken is null)
        return Results.Conflict(new { error = "No setup token is active. Restart TaskList Stats to generate a new one." });

    if (!PasswordAuth.SetupTokenMatches(setupToken, request.SetupToken))
        return Results.Json(new { error = "Invalid setup token." }, statusCode: StatusCodes.Status401Unauthorized);

    var passwordError = PasswordAuth.ValidateNewPassword(request.Password, request.ConfirmPassword);
    if (passwordError is not null)
        return Results.BadRequest(new { error = passwordError });

    PasswordAuth.Save(authPath, request.Password!);
    setupToken = null;
    await PasswordAuth.SignInOwner(context);
    return Results.Ok(new { authenticated = true });
}).RequireRateLimiting("auth");

app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context) =>
{
    if (!PasswordAuth.IsConfigured(authPath))
        return Results.Conflict(new { error = "No password has been configured yet." });
    if (string.IsNullOrEmpty(request.Password) || !PasswordAuth.Verify(authPath, request.Password, out var needsRehash))
        return Results.Unauthorized();

    if (needsRehash)
    {
        PasswordAuth.Save(authPath, request.Password);
        app.Logger.LogInformation("Upgraded the saved password hash to {Iterations} PBKDF2 iterations.", PasswordAuth.Iterations);
    }

    await PasswordAuth.SignInOwner(context);
    return Results.Ok(new { authenticated = true });
}).RequireRateLimiting("auth");

app.MapPost("/api/auth/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
}).RequireAuthorization();

var api = app.MapGroup("/api").RequireAuthorization();

api.MapGet("/snapshot", () =>
{
    var dbPath = ResolveDatabasePath(builder.Configuration);
    if (!File.Exists(dbPath))
    {
        return Results.Json(new { error = $"TaskList Stats could not find TaskList's tasklist.db. Set TaskListStats:DatabasePath in appsettings.json or the TASKLIST_DB_PATH environment variable. Resolved path: {dbPath}" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    try
    {
        return Results.Ok(ReadSnapshot(dbPath, appVersion, builder.Configuration["TaskListStats:TaskListUrl"] ?? ""));
    }
    catch (SqliteException ex)
    {
        return Results.Json(new { error = $"Could not read the TaskList database: {ex.Message}" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

api.MapGet("/events", (long? afterId, string? cursor) =>
{
    var dbPath = ResolveDatabasePath(builder.Configuration);
    if (!File.Exists(dbPath))
    {
        return Results.Json(new { error = "TaskList Stats could not find TaskList's tasklist.db." }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        return Results.Ok(ReadEvents(dbPath, afterId, cursor));
    }
    catch (SqliteException ex)
    {
        return Results.Json(new { error = $"Could not read the TaskList event history: {ex.Message}" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

// An unknown API address answers 404 like NewsReview, instead of the page or 405.
app.MapFallback("/api/{**path}", () => Results.Json(new { error = "Not found" }, statusCode: StatusCodes.Status404NotFound)).RequireAuthorization();
app.MapFallbackToFile("index.html").RequireAuthorization();
app.Run();

// Signing in from the home page goes to plain /login.html, like NewsReview; only a deep link keeps a ReturnUrl.
static string LoginRedirect(RedirectContext<CookieAuthenticationOptions> context) =>
    (context.Request.Path.Value is null or "/" or "/index.html") && !context.Request.QueryString.HasValue ? "/login.html" : context.RedirectUri;

record LoginRequest(string? Password);
record SetupRequest(string? SetupToken, string? Password, string? ConfirmPassword);
