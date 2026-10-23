> [!WARNING]
> This project is fully vibecoded, probably inefficient, but it does what I wanted lol

# TaskList Stats v2.1.26

A separate, read-only statistics dashboard for [TaskList](https://github.com/RotatingWires/task-list), with charts, calendars, task history, comparisons, activity sessions, and milestones.

**[Full manual](MANUAL.md)** — complete setup, screenshots, statistics reference, API, troubleshooting, and release notes, preserved from the original README.

## Quickstart

Requires the **.NET 10 SDK** and an existing TaskList `task-list.db`. Clone the repository:

```sh
git clone https://github.com/RotatingWires/task-list-stats.git
cd task-list-stats
```

Set `appsettings.json` to your TaskList database path and listen address. For checkouts in neighboring folders:

```json
{
  "TaskListStats": {
    "DatabasePath": "../task-list/data/task-list.db",
    "ListenUrl": "http://127.0.0.1:8712"
  }
}
```

```sh
dotnet restore
dotnet run
```

Open **http://127.0.0.1:8712**. Enter the setup token printed in the server console, choose and confirm a password of at least 8 characters, then log in. Select lists and a statistics tab; use **Refresh** for updated data.

The service needs read access to the TaskList database and its parent path, including WAL/SHM sidecars when present, plus write access to its own `data/auth.json` and `logs/console.log`.

## Security and privacy

Recommended deployment:

- use HTTPS across untrusted networks
- prefer LAN, VPN, or a private reverse proxy
- firewall Stats to networks/devices that need it
- keep `data/auth.json`, the TaskList database, and exported snapshots private
- give the Stats service account only the filesystem permissions it needs

Important distinctions:

- **TaskList database:** all connections use read-only SQLite mode with `PRAGMA query_only`; Stats does not edit task/history data or notification state.
- **Stats auth storage:** Stats writes its own `data/auth.json` credential file.
- **Passwords:** plaintext passwords are never stored.
- **Sessions:** the cookie is HttpOnly and SameSite=Strict; use HTTPS if the network is not trusted.
- **Exports:** snapshot JSON contains personal task data and should be protected like a database export.

The quickstart uses plain HTTP on loopback. HTTP does not encrypt passwords, session cookies, or task data in transit. For LAN access, change `ListenUrl` to `http://0.0.0.0:8712` and connect using the server's actual address; use HTTPS across untrusted networks.

Passwords use salted PBKDF2-HMAC-SHA256 hashes with 210,000 iterations. Sessions last up to 30 days, slide while active, and are marked Secure when the request uses HTTPS. Setup/login permits 5 attempts per source IP per minute. The setup token is console-only and excluded from file logging.

See the manual for [authentication](MANUAL.md#authentication), [statistics sections](MANUAL.md#statistics-sections), [configuration overrides](MANUAL.md#requirements-and-running), and [troubleshooting](MANUAL.md#troubleshooting).
