# Server Mode and PostgreSQL Migration Design

## Purpose

Add a safe server mode so the dashboard can be hosted by one computer and viewed from other computers on the same network. Add database selection between local SQLite and PostgreSQL, with a controlled migration path from SQLite to PostgreSQL.

The first release keeps remote access read-only. Management actions remain available only from the host computer or Electron shell. This lets the dashboard be shared safely without exposing package edits, notification settings, database credentials, or migration controls to other users on the network.

## Goals

- Let the user switch between standalone mode and server mode from the settings page.
- Show the current local server address and reachable LAN URLs.
- Allow remote browsers to view the dashboard and TV view in server mode.
- Block remote users from mutating package, notification, LLM, carrier, database, and system settings.
- Let the user configure SQLite or PostgreSQL as the active database mode.
- Store PostgreSQL connection settings without returning the password to the browser.
- Provide connection testing and SQLite-to-PostgreSQL migration.
- Preserve SQLite data as a backup after migration.

## Non-Goals

- Remote administrator login in the first release.
- Multi-user accounts, roles, or audit trails.
- Automatic firewall configuration.
- Automatic deletion of the SQLite database after migration.
- Live runtime database switching without an app restart.

## User Experience

The settings page gains a system section with two primary controls.

The first control selects the access mode:

- Standalone mode binds the local web server for local use.
- Server mode binds the web server so other computers can reach it.

The section shows:

- Current mode.
- Current port.
- Host-only URL, such as `http://localhost:3310`.
- LAN URLs discovered from local network interfaces, such as `http://192.168.1.23:3310`.
- A restart-required notice after changing the mode or port.

The second control selects the database mode:

- SQLite shows the current database file path.
- PostgreSQL shows host, port, database name, username, password status, and SSL mode.

PostgreSQL controls include:

- Save settings.
- Test connection.
- Dry-run migration.
- Run migration.

The migration panel shows counts for each data group and a clear success or failure message. It does not expose passwords in UI responses.

## Access Model

Local requests are management-capable. Remote requests are read-only.

A request is local when it originates from:

- `localhost`
- `127.0.0.1`
- `::1`

Remote users may access:

- Dashboard page.
- TV mode page.
- Read-only package list/status APIs needed by those pages.
- Static assets and locale files.

Remote users may not access:

- Settings page.
- Package create, update, delete, refresh, or analyze APIs.
- Notification settings, channel, contact, summary, and test APIs.
- Carrier settings APIs.
- LLM settings, model, translate, analyze, and test APIs.
- System settings, database settings, connection test, and migration APIs.

Protection must be enforced at the API/server layer. UI hiding is only a usability improvement.

When a remote user reaches a blocked page or API, the app returns either:

- A dashboard redirect or read-only message for pages.
- `403 Forbidden` JSON for APIs.

## Architecture

### System Settings

Add persisted system settings to the local settings store:

- `accessMode`: `standalone` or `server`
- `serverHost`: default `127.0.0.1` for standalone, `0.0.0.0` for server
- `serverPort`: default `3310`
- `databaseMode`: `sqlite` or `postgresql`
- `sqlitePath`: current SQLite path
- `postgresHost`
- `postgresPort`
- `postgresDatabase`
- `postgresUser`
- `postgresPassword`
- `postgresSslMode`

PostgreSQL password handling:

- Persist securely where the app already stores local configuration.
- Do not send the password back from GET APIs.
- Return only `postgresPasswordSet: boolean`.
- Allow password replacement by submitting a new password.

### Runtime Server Binding

Electron startup reads system settings before starting Next.js.

Standalone mode starts the server with a local-only host.
Server mode starts the server with a network host.

Mode and port changes require restart because the running Next.js process cannot reliably change its bound host and port without a restart.

### Reachable Address Discovery

Add a server-side helper that inspects OS network interfaces and returns non-internal IPv4 addresses. The settings API combines those addresses with the configured port to produce candidate URLs.

If no LAN address is found, the UI still shows the localhost URL and a note that no LAN interface is currently available.

### Request Origin Guard

Add a reusable server-side guard for route handlers and page-level checks:

- `isLocalRequest(headers): boolean`
- `requireLocalRequest(headers): void`
- `isMutation(method): boolean`

The guard should account for common proxy headers only when they are trustworthy in this app's deployment model. In the first release, direct socket/header host checks are preferred to avoid treating spoofable headers as authority.

Every mutating route must call the guard before changing data. Settings and migration routes must require local access for all methods.

### Database Backend

The current app uses a Prisma-like facade over SQLite through `src/lib/db`. Keep that facade as the application-facing boundary.

Add a PostgreSQL implementation behind the same facade instead of spreading database-specific code through API routes. The active facade is selected from persisted system settings at process startup.

SQLite remains the default backend. PostgreSQL mode requires a restart after saving settings.

### PostgreSQL Schema

Create PostgreSQL tables equivalent to the current app data model:

- `Package`
- `NotificationSetting`
- `NotificationChannel`
- `NotificationContact`
- `NotificationLog`
- `LLMSetting`

Preserve IDs, timestamps, JSON-as-string fields, and relationships. Use schema creation that can run safely before migration.

### Migration Flow

The migration feature copies SQLite data into PostgreSQL.

Flow:

1. Read PostgreSQL settings.
2. Test connection.
3. Ensure PostgreSQL schema exists.
4. Run dry-run counts from SQLite and current PostgreSQL.
5. On execute, copy data in dependency order:
   - Notification settings
   - LLM settings
   - Packages
   - Notification channels
   - Notification contacts
   - Notification logs
6. Use transaction boundaries where supported.
7. Use idempotent upsert semantics keyed by existing IDs.
8. Return inserted, updated, skipped, and failed counts.
9. Leave SQLite untouched.
10. Recommend switching database mode to PostgreSQL and restarting.

The migration must not partially switch the active database. Data copy and active backend selection are separate user actions.

## Error Handling

Connection test failures return concise messages:

- Host unreachable.
- Authentication failed.
- Database not found or access denied.
- SSL requirement mismatch.
- Unknown driver error.

Migration failures include:

- Step name.
- Table or data group.
- Error message.
- Whether any data was written before failure.

Passwords and full connection strings are never included in responses, logs, or UI messages.

## Internationalization

Add translation keys for all visible settings text in:

- English
- Traditional Chinese
- Simplified Chinese
- Spanish (Mexico)

The new settings section should follow existing settings page tone and density.

## Testing

Add focused tests for:

- Local request detection allows localhost and loopback addresses.
- Remote request detection blocks non-local origins.
- Mutating APIs return `403` for remote requests.
- Settings API redacts PostgreSQL password.
- PostgreSQL connection configuration validation.
- Migration dry-run counts.
- Migration preserves package, notification, contact, log, and LLM data relationships.
- Settings UI shows mode, URLs, database fields, and migration states.

Manual verification:

- Start in standalone mode and confirm local dashboard works.
- Switch to server mode, restart, and confirm LAN URL is displayed.
- Open LAN URL from another computer and confirm dashboard is visible.
- Confirm remote user cannot open settings or call mutating APIs.
- Test PostgreSQL connection with valid and invalid credentials.
- Migrate sample SQLite data to PostgreSQL and verify counts.

## Security Considerations

Server mode exposes the dashboard to the local network. The first release deliberately makes remote users read-only.

Sensitive controls require local access:

- Database credentials.
- Migration actions.
- Notification channel credentials.
- Package mutations.
- LLM settings.

Remote administrator login should be a separate future design. It should include password hashing, session expiry, CSRF protection, and a clear recovery path.

## Open Follow-Up

After this release, consider adding an optional remote admin login. That should be designed separately so authentication and session security do not get mixed into the database migration work.
