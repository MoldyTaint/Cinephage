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
npm run preview          # Preview production build
npm run check            # TypeScript + Svelte type checking
npm run check:watch      # Type checking in watch mode
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

Config lives in `.prettierrc`:
- **Tabs** for indentation
- **Single quotes** for strings
- **No trailing commas**
- **Print width**: 100 characters
- **Plugins**: `prettier-plugin-svelte`, `prettier-plugin-tailwindcss`
- **Tailwind stylesheet**: `src/routes/layout.css`

Run `npm run format` before committing.

### ESLint Specifics

- `no-console` is **error** in source files (including `.svelte`)
- `@typescript-eslint/no-explicit-any` is **off** in test files
- Svelte-specific overrides: `svelte/no-navigation-without-resolve`, `svelte/prefer-writable-derived`, and `svelte/valid-prop-names-in-kit-pages` are disabled
- Underscore-prefixed unused variables are allowed (`^_` pattern)

### Imports

```typescript
// 1. External packages (Node built-ins use node: prefix)
import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

// 2. Internal imports using $lib alias
import { logger } from '$lib/logging';
import { ValidationError } from '$lib/errors';
import type { MovieContext } from '$lib/server/monitoring/specifications/types';

// 3. Relative imports (same directory)
import { reject, accept } from './utils.js';
```

Always include `.js` extension in imports for ES modules.

### TypeScript

- **Strict mode** is enabled
- Use **Zod schemas** (`src/lib/validation/schemas.ts`) for runtime validation
- Derive types from Drizzle schema using `$inferSelect` and `$inferInsert`:

```typescript
export type MovieRecord = typeof movies.$inferSelect;
export type NewMovieRecord = typeof movies.$inferInsert;
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Variables/functions | camelCase | `movieCount`, `getMovieById` |
| Classes/interfaces/types | PascalCase | `MovieUpgradeableSpecification`, `MovieContext` |
| Constants | SCREAMING_SNAKE_CASE | `CURRENT_SCHEMA_VERSION`, `SECURITY_HEADERS` |
| Files | kebab-case | `upgradeable-specification.ts` |
| Svelte components | PascalCase | `IndexerModal.svelte` |
| Database tables | camelCase (plural) | `movies`, `episodeFiles` |

## Error Handling

Use the `AppError` hierarchy from `$lib/errors`:

```typescript
import { ValidationError, NotFoundError, ExternalServiceError, isAppError } from '$lib/errors';

// Throw typed errors
throw new ValidationError('Invalid input', { field: 'name' });
throw new NotFoundError('Movie', movieId);
throw new ExternalServiceError('TMDB', 'Rate limit exceeded', 429);

// Type guard for catch blocks
if (isAppError(error)) {
	return json({ error: error.message, code: error.code }, { status: error.statusCode });
}
```

## Svelte 5 Patterns

### Component Props

```svelte
<script lang="ts">
	interface Props {
		open: boolean;
		data: Movie;
		onSave: (movie: Movie) => void;
		onClose: () => void;
	}

	let { open, data, onSave, onClose }: Props = $props();
</script>
```

### Reactive State

```svelte
<script lang="ts">
	let count = $state(0);
	let name = $state('');

	const doubled = $derived(count * 2);
	const isValid = $derived(name.length > 0);

	$effect(() => {
		console.log('Name changed:', name);
	});
</script>
```

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

### Structure

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { indexerCreateSchema } from '$lib/validation/schemas';
import { ValidationError } from '$lib/errors';

export const GET: RequestHandler = async () => {
	const items = await service.getAll();
	return json(items);
};

export const POST: RequestHandler = async ({ request }) => {
	let data: unknown;
	try {
		data = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const result = indexerCreateSchema.safeParse(data);
	if (!result.success) {
		return json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
	}

	// Use result.data (typed and validated)
	const created = await service.create(result.data);
	return json({ success: true, data: created });
};
```

### Validation

Always use Zod `safeParse()` for input validation:

```typescript
const result = mySchema.safeParse(input);
if (!result.success) {
	return json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 });
}
// result.data is now typed
```

## Backend Services

### BackgroundService Interface

All background services implement:

```typescript
interface BackgroundService {
	readonly name: string;
	readonly status: 'pending' | 'starting' | 'ready' | 'error';
	start(): void; // Must return immediately (use setImmediate for async work)
	stop(): Promise<void>;
}
```

### Singleton Pattern

Services use lazy initialization via getters:

```typescript
let _instance: MyService | null = null;

export function getMyService(): MyService {
	if (!_instance) {
		_instance = new MyService();
	}
	return _instance;
}
```

### Service Registration

Services are registered in `hooks.server.ts` via ServiceManager:

```typescript
const serviceManager = getServiceManager();
serviceManager.register(getDownloadMonitor());
serviceManager.register(getMonitoringScheduler());
```

## Dev Server Behavior

In dev mode, Vite lazily loads modules on first request. A custom `eagerInitPlugin` in `vite.config.ts` automatically pings `/health` when the dev server starts, forcing `hooks.server.ts` to load and starting all background services immediately. If this fails, services start on the first real request.

## Database

### Schema Location

- **Definition**: `src/lib/server/db/schema.ts` (Drizzle ORM)
- **Sync Logic**: `src/lib/server/db/schema-sync.ts` (embedded migrations)

### Adding Tables/Columns

1. Add Drizzle definition to `schema.ts`
2. Add CREATE TABLE in `schema-sync.ts` TABLE_DEFINITIONS
3. For existing databases: increment CURRENT_SCHEMA_VERSION and add migration to SCHEMA_UPDATES
4. Run `npm run db:reset` then `npm run dev` to test

### Queries

```typescript
import { db } from '$lib/server/db';
import { movies } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Select
const movie = await db.select().from(movies).where(eq(movies.id, id));

// Insert
await db.insert(movies).values({ title: 'Test', tmdbId: 123 });

// Update
await db.update(movies).set({ monitored: true }).where(eq(movies.id, id));
```

### Native Module Externalization

`better-sqlite3` is externalized from Vite's SSR bundling (`vite.config.ts` `ssr.external`). Do not attempt to bundle it.

## Testing

### Test Conventions

- **Naming**: Always `.test.ts`, never `.spec.ts`
- **Environment**: Node (not jsdom/browser)
- **Setup file**: `src/test/setup.ts` — mocks `$env/dynamic/private` and loads `.env`
- **DB tests**: Use `createTestDb()` / `destroyTestDb()` from `src/test/db-helper` for per-suite isolation. Never mock `$lib/server/db` when a real in-memory DB works.
- **Avoid `as any`**: Use typed fixture functions for test data. If testing private methods, use `@ts-expect-error` with a comment.
- **Coverage**: Run `npm run test:coverage` before committing. Thresholds are enforced in CI:
  - statements: 21%, branches: 15%, functions: 22%, lines: 21%
- **Live tests**: Tests hitting real APIs must use `describe.skipIf()` gated on `LIVE_TESTS=true`. Run with `npm run test:live`.
- **No dead tests**: Never commit placeholder or skipped tests.
- **No `__tests__/` directories**: Tests are colocated with source files.

### Structure

```typescript
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createTestDb, destroyTestDb, createDbMock, type TestDatabase } from '../../../test/db-helper';

let testDb: TestDatabase;

beforeAll(() => { testDb = createTestDb(); });
afterAll(() => { destroyTestDb(testDb); });

describe('MyService', () => {
	it('should do something', async () => {
		const result = await service.doSomething();
		expect(result).toBe(true);
	});
});
```

### Database Isolation

```typescript
import { createTestDb, destroyTestDb, createDbMock, type TestDatabase } from '../../../test/db-helper';

const testDb = createTestDb();

vi.mock('$lib/server/db', () => createDbMock(testDb));

afterAll(() => { destroyTestDb(testDb); });
```

### Mocking

```typescript
// Mock external services only (not internal DB)
vi.mock('$lib/server/quality', () => ({
	qualityFilter: {
		getProfile: vi.fn(async (id: string) => TEST_PROFILES[id] ?? null)
	}
}));

// Use typed fixture functions instead of 'as any'
function createTestMovie(overrides: Partial<Movie> = {}): Movie {
	return { id: '1', title: 'Test', ...overrides };
}
```

### Test File Location

Test files are placed **adjacent to source files**:

```
src/lib/server/monitoring/specifications/
├── UpgradeableSpecification.ts
└── UpgradeableSpecification.test.ts
```

## Internationalization (Paraglide)

The project uses `@inlang/paraglide-js` for i18n. Generated files live in `src/lib/paraglide/` and are created during build. **Type checking requires these generated files** — if you get type errors about missing paraglide modules, run `npm run build` first.

## Commit Convention

Use conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting (no code change)
- `refactor:` - Code restructuring
- `test:` - Adding/updating tests
- `chore:` - Maintenance tasks

Example: `feat: add subtitle auto-download scheduler`

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
| `src/test/setup.ts` | Vitest setup (env mocking) |
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
