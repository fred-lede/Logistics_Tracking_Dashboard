# Cross-Platform Native-Free Packaging Design

## Goal

Allow a Mac mini M4 development machine to build distributables for macOS, Windows, and Ubuntu from one workspace without compiling separate native Node modules for each target platform.

The main product behavior remains the same: a single-user Electron dashboard with a local package database, carrier refreshes, notification settings, LLM settings, and local background execution.

## Current Constraint

The app currently uses Prisma 7 with `@prisma/adapter-better-sqlite3` and `better-sqlite3`.

`better-sqlite3` ships a native `.node` binary. That binary is tied to operating system, CPU architecture, Node ABI, and Electron ABI. The current `scripts/rebuild-standalone-native.cjs` script correctly blocks cross-compilation when the host platform and target platform differ. This prevents a Mac mini M4 from reliably producing Windows and Linux packages using the current database driver.

electron-builder can target multiple platforms from one command, but native dependencies are the core exception. The design must remove that exception instead of trying to work around it with fragile copied binaries.

## Recommended Approach

Replace the native SQLite driver path with a packaging-safe database path that does not require per-target native module rebuilds.

Keep SQLite as the product database format unless implementation research proves Prisma cannot support a native-free SQLite runtime in this Electron + Next standalone shape. If that happens, the fallback is to isolate database access behind a small repository layer and swap Prisma for a pure JavaScript or WASM SQLite implementation while preserving the existing API route behavior.

## Architecture

### Database Runtime

The database layer should be centralized behind `src/lib/prisma.ts` or a successor module such as `src/lib/db/client.ts`.

Responsibilities:

- Resolve the database file path for development and packaged Electron runtime.
- Create the database client once per process.
- Avoid importing `better-sqlite3` or any native SQLite adapter.
- Expose the same query surface currently used by API routes where possible.
- Keep production data in the app user data directory, not inside the read-only packaged app.

The preferred first implementation path is:

1. Remove `@prisma/adapter-better-sqlite3` and `better-sqlite3`.
2. Use Prisma's supported SQLite path without a manually supplied `better-sqlite3` adapter if compatible with Prisma 7 and the generated client mode used by this app.
3. Keep `DATABASE_URL` as the configuration contract, defaulting to `file:./dev.db` in development.
4. In packaged Electron, set or derive `DATABASE_URL` to point at the user data database file before the Next standalone server starts.

If Prisma 7 requires an adapter in this project shape and no native-free SQLite adapter is available, use the fallback repository layer:

- Add a small data access module for package, notification, contact, log, and LLM settings operations.
- Back it with a pure JS/WASM SQLite library.
- Preserve API route response shapes and existing component contracts.
- Replace direct `prisma.*` calls incrementally but in one migration branch.

### Schema Design

The existing schema can remain functionally compatible:

- `Package`
- `NotificationSetting`
- `NotificationChannel`
- `NotificationContact`
- `NotificationLog`
- `LLMSetting`

The implementation should not introduce a remote database or multi-user account model.

For JSON-like fields currently stored as strings, keep the stored representation stable for migration safety:

- `partNumbers`
- `events`
- `subPackages`
- `config`
- `notifyOnStatuses`

Add or consolidate helper functions for parse/stringify behavior rather than scattering manual JSON parsing. This keeps the database migration small while improving resilience around bad JSON.

### Packaging Flow

Remove the native rebuild step from package scripts once the native dependency is gone.

Target scripts should become conceptually:

- `package:mac`: build app, then `electron-builder --mac --publish=never`
- `package:win`: build app, then `electron-builder --win --publish=never`
- `package:linux`: build app, then `electron-builder --linux --publish=never`
- `package:all`: build app once, then `electron-builder --mac --win --linux --publish=never`

`electron-builder.yml` should no longer depend on `npmRebuild: false` as a native-module workaround. It can remain `false` only if no production dependency requires rebuild.

The `scripts/rebuild-standalone-native.cjs` file should be deleted or left unused only if a short historical note is needed during transition. Prefer deleting it after scripts no longer reference it.

### Electron Runtime

The Electron main process should own packaged runtime paths:

- Detect packaged mode.
- Ensure the app data directory exists.
- Set `DATABASE_URL` for the spawned Next server to a writable SQLite file.
- Keep development mode on the local workspace database unless the user explicitly configures another path.

This avoids writes inside `.app`, `.exe` installation folders, AppImage mount paths, or Debian package-owned directories.

## Build Tool Expectations

After removing native Node modules, Mac mini M4 should be able to build all three targets from one source tree in principle.

Remaining platform tool requirements are external packaging concerns:

- Windows NSIS/portable packaging may require electron-builder downloads and Wine-related tooling.
- Linux AppImage/deb packaging may require electron-builder helper binaries or containerized tooling.
- macOS signing and notarization remain macOS-only concerns and are separate from this design.

The implementation should document any local tool prerequisites discovered during verification.

## Migration And Compatibility

No user-facing data model change is intended.

Migration requirements:

- Existing SQLite data should remain readable.
- Existing Prisma migrations should remain valid if Prisma remains the runtime.
- If the fallback repository layer replaces Prisma, write a compatibility migration or startup initializer that creates the same tables and preserves existing rows.
- Do not delete user databases during package startup.

## Testing

Verification should include:

- Unit tests with `npm test`.
- Lint with `npm run lint` if the current lint baseline is expected to pass.
- Next/Electron build with `npm run build`.
- Individual package commands for macOS, Windows, and Linux.
- Final combined package command with `npm run package:all`.

Database-specific tests should cover:

- Client initialization without `better-sqlite3`.
- Package CRUD.
- Notification channel/contact CRUD.
- JSON helper behavior for malformed event/config data.
- Packaged-mode database path resolution.

## Risks

Prisma 7 may still rely on engine binaries or a driver path that is not fully native-free in this Electron standalone configuration. If so, the fallback repository layer becomes necessary.

electron-builder may still need additional host tools for Windows or Linux installer formats. Those are packaging toolchain requirements, not app native module requirements.

Changing the database runtime touches shared API behavior. Keep changes narrow and verify existing dashboard, settings, notification, and LLM routes.

## Out Of Scope

- Cloud sync.
- Multi-user authentication.
- Changing carriers or notification provider behavior.
- Replacing Electron.
- Signing, notarization, or release publishing automation.

## Verified Packaging Notes

Implementation replaced the Prisma native SQLite runtime with a small SQL.js-backed
database facade. The app intentionally loads `sql.js/dist/sql-asm.js` instead of
the WASM build because Next/Turbopack traces the sql.js WASM loader into the
standalone server bundle and fails during packaging analysis. The asm.js build is
slower than WASM, but keeps the database runtime pure JavaScript and avoids
cross-platform native module or WASM asset handling in the Electron standalone
package.

On Mac mini M4, the following commands were verified after the migration:

- `npm test`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `npm run package:mac`
- `npm run package:win`
- `npm run package:linux`
- `npm run package:all`

`npm run lint` still reports the existing repository lint baseline, including
CommonJS Electron files and generated/release output. That lint cleanup is
separate from the native-free packaging migration.
