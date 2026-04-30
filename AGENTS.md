# AGENTS.md

Guidelines for agentic coding assistants working in the Cinephage codebase.

## Prerequisites

- **Node.js 22+** (CI uses 22, devcontainer uses 24)
- **npm** (package-lock.json present — use `npm ci`)
- Optional: **ffmpeg/ffprobe** for media info extraction

## Build/Lint/Test Commands

```bash
npm run dev              # Start dev server
npm run dev:host         # Start dev server accessible on LAN (devcontainer)
npm run build            # Production build (sets NODE_OPTIONS=--max-old-space-size=8192)
npm start                # Run production server (node server.js)
npm run check            # TypeScript + Svelte type checking
npm run lint             # ESLint + Prettier validation
npm run lint:fix         # Auto-fix lint issues
npm run format           # Auto-format code with Prettier
npm run test             # Run all tests once
npm run test:unit        # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run test:live        # Run live network tests (hits real APIs)
npm run deps:audit       # Dependency audit (unused/unlisted packages)

# Database utilities
npm run db:reset         # Delete SQLite database (recreated on next startup)
npm run db:info          # Show current schema version

# Run a single test file
npx vitest run path/to/test.ts

# Run tests matching a pattern
npx vitest run -t "test name pattern"

# Run tests in a specific directory
npx vitest run src/lib/server/monitoring
```

**CI Pipeline:** Four parallel jobs — `lint`, `typecheck`, `test:coverage`, `build`. The `typecheck` job runs `rm -rf src/lib/paraglide && npm run build` first because `npm run check` requires generated Paraglide files.

## Code Style

### Formatting (Prettier)

- **Tabs** for indentation, **single quotes**, **no trailing commas**, **print width**: 100
- Plugins: `prettier-plugin-svelte`, `prettier-plugin-tailwindcss`
- Tailwind stylesheet: `src/routes/layout.css`
- Run `npm run format` before committing

### ESLint Specifics

- `no-console` is **error** in all source files (`.ts`, `.js`, `.svelte`, `.svelte.ts`, `.svelte.js`)
- `@typescript-eslint/no-explicit-any` is **off** in test files
- Underscore-prefixed unused variables are allowed (`^_` pattern)

### Imports

Always include `.js` extension in relative imports for ES modules (`import { foo } from './bar.js'`). Node built-ins use `node:` prefix (`import { randomUUID } from 'node:crypto'`).

### TypeScript

- **Strict mode** is enabled
- **Zod v4** is used (`^4.3.6`) — API differs from v3 (e.g., `safeParse` still works but check migration notes if adding new schema features)
- Runtime validation uses Zod schemas from `src/lib/validation/schemas.ts`
- Derive types from Drizzle schema using `$inferSelect` and `$inferInsert`

### Naming Conventions

- Files: kebab-case (`upgradeable-specification.ts`)
- Svelte components: PascalCase (`IndexerModal.svelte`)
- Database tables: camelCase plural (`movies`, `episodeFiles`)

## Error Handling

Use the `AppError` hierarchy from `$lib/errors`:

- `ValidationError` — invalid input (400)
- `NotFoundError` — missing resource (404)
- `ExternalServiceError` — TMDB, indexer failures (502)
- `ConfigurationError` — missing/invalid config (500)
- `CloudflareBypassError` — Cloudflare bypass failed (503)
- `InvalidNzbError` — malformed NZB (400)
- `isAppError(error)` — type guard for catch blocks

## Svelte 5 Patterns

### Modal Form Pattern

Initialize form state with defaults, sync from props in `$effect` when modal opens:

```svelte
<script lang="ts">
	let formData = $state({ name: '', priority: 25 });

	$effect(() => {
		if (open) {
			formData = {
				name: indexer?.name ?? '',
				priority: indexer?.priority ?? 25
			};
		}
	});
</script>
```

## API Routes

Always use Zod `safeParse()` for input validation — see `src/lib/validation/schemas.ts` for available schemas.

## Backend Services

All background services implement the `BackgroundService` interface (`start()` must return immediately — use `setImmediate` for async work). Services use lazy singleton getters and are registered in `hooks.server.ts` via `ServiceManager`.

## Dev Server Behavior

In dev mode, Vite lazily loads modules on first request. A custom `eagerInitPlugin` in `vite.config.ts` automatically pings `/health` when the dev server starts, forcing `hooks.server.ts` to load and starting all background services immediately. If this fails, services start on the first real request.

## Database

- **Definition**: `src/lib/server/db/schema.ts` (Drizzle ORM)
- **Sync Logic**: `src/lib/server/db/schema-sync.ts` (embedded migrations)
- `better-sqlite3` is externalized from Vite's SSR bundling (`vite.config.ts` `ssr.external`) — do not attempt to bundle it

### Adding Tables/Columns

1. Add Drizzle definition to `schema.ts`
2. Add CREATE TABLE in `schema-sync.ts` TABLE_DEFINITIONS
3. For existing databases: increment CURRENT_SCHEMA_VERSION and add migration to SCHEMA_UPDATES
4. Run `npm run db:reset` then `npm run dev` to test

## Testing

- **Assertions required**: Vitest config has `requireAssertions: true` — every test must contain at least one `expect`/`assert`
- **Svelte component tests excluded**: `src/**/*.svelte.{test,spec}.{js,ts}` are excluded from vitest — don't write them
- **Naming**: `.test.ts` only, never `.spec.ts`
- **No `__tests__/` directories**: Tests are colocated with source files
- **Environment**: Node (not jsdom/browser)
- **Setup file**: `src/test/setup.ts` — mocks `$env/dynamic/private` and loads `.env`
- **DB tests**: Use `createTestDb()` / `destroyTestDb()` from `src/test/db-helper` for per-suite isolation. Use `clearTestDb()` to wipe data between tests. Never mock `$lib/server/db` when a real in-memory DB works.
- **Avoid `as any`**: Use typed fixture functions. For private methods, use `@ts-expect-error` with a comment.
- **Coverage thresholds** (enforced in CI): statements: 21%, branches: 15%, functions: 22%, lines: 21%
- **Live tests**: Must use `describe.skipIf()` gated on `LIVE_TESTS=true`. Run with `npm run test:live`.
- **No dead tests**: Never commit placeholder or skipped tests.

### Database Isolation

```typescript
import { createTestDb, destroyTestDb, createDbMock, type TestDatabase } from '../../../test/db-helper';

const testDb = createTestDb();

vi.mock('$lib/server/db', () => createDbMock(testDb));

afterAll(() => { destroyTestDb(testDb); });
```

## Internationalization (Paraglide)

Uses `@inlang/paraglide-js`. Generated files live in `src/lib/paraglide/` and are created during build. **Type checking requires these generated files** — if you get type errors about missing paraglide modules, run `npm run build` first.

## Commit Convention

Use conventional commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`.

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks.server.ts` | Server startup, service initialization, request handling |
| `src/lib/server/db/schema.ts` | Database schema definitions |
| `src/lib/server/db/schema-sync.ts` | Schema migrations |
| `src/lib/validation/schemas.ts` | Zod validation schemas |
| `src/lib/errors/index.ts` | Error classes (AppError hierarchy) |
| `src/lib/logging/index.ts` | Logger utility |
| `src/test/db-helper.ts` | Test database utilities |
| `vite.config.ts` | Vite config with eager init plugin, coverage thresholds |
| `svelte.config.js` | SvelteKit config with CSRF trusted origins |
| `server.js` | Custom production entrypoint (wraps adapter-node, loads dotenv) |
| `.env.example` | All environment variables documented |

## Domain-Specific Guides

Several subdirectories contain their own `AGENTS.md` with deeper architectural context:

| Domain | Path |
|--------|------|
| Indexers | `src/lib/server/indexers/AGENTS.md` |
| Live TV / IPTV | `src/lib/server/livetv/AGENTS.md` |
| Monitoring / Specifications | `src/lib/server/monitoring/AGENTS.md` |
| Streaming / Usenet | `src/lib/server/streaming/AGENTS.md` |
| Subtitles | `src/lib/server/subtitles/AGENTS.md` |
| Library | `src/lib/server/library/AGENTS.md` |
| Download Clients | `src/lib/server/downloadClients/AGENTS.md` |

## Devcontainer

A devcontainer is available (`.devcontainer/`). Optional sidecars for integration testing:

```bash
cd .devcontainer
docker compose --profile download-client up -d transmission qbittorrent
docker compose --profile usenet-client up -d sabnzbd
```

Sidecar ports: Transmission `9091`, qBittorrent `8081`, SABnzbd `8080`.
