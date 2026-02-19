# AGENTS.md

Guidelines for agentic coding assistants working in the Cinephage codebase.

## Build/Lint/Test Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm start                # Run production server
npm run check            # TypeScript + Svelte type checking
npm run lint             # ESLint + Prettier validation
npm run lint:fix         # Auto-fix lint issues
npm run format           # Auto-format code with Prettier
npm run test             # Run all tests once
npm run test:unit        # Run tests in watch mode

# Run a single test file
npx vitest run path/to/test.ts

# Run tests matching a pattern
npx vitest run -t "test name pattern"

# Run tests in a specific directory
npx vitest run src/lib/server/monitoring
```

## Code Style

### Formatting (Prettier)

- **Tabs** for indentation (not spaces)
- **Single quotes** for strings
- **No trailing commas**
- **Print width**: 100 characters
- Plugins: `prettier-plugin-svelte`, `prettier-plugin-tailwindcss`

Run `npm run format` before committing.

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

| Type                     | Convention           | Example                                         |
| ------------------------ | -------------------- | ----------------------------------------------- |
| Variables/functions      | camelCase            | `movieCount`, `getMovieById`                    |
| Classes/interfaces/types | PascalCase           | `MovieUpgradeableSpecification`, `MovieContext` |
| Constants                | SCREAMING_SNAKE_CASE | `CURRENT_SCHEMA_VERSION`, `SECURITY_HEADERS`    |
| Files                    | kebab-case           | `upgradeable-specification.ts`                  |
| Svelte components        | PascalCase           | `IndexerModal.svelte`                           |
| Database tables          | camelCase (plural)   | `movies`, `episodeFiles`                        |

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

## Testing

### Structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('MyService', () => {
	let service: MyService;

	beforeEach(() => {
		service = new MyService();
	});

	it('should do something', async () => {
		const result = await service.doSomething();
		expect(result).toBe(true);
	});
});
```

### Mocking

```typescript
// Mock a module
vi.mock('$lib/server/quality', () => ({
	qualityFilter: {
		getProfile: vi.fn(async (id: string) => TEST_PROFILES[id] ?? null)
	}
}));

// Mock partial types in tests (allowed by ESLint)
const mockMovie = { id: '1', title: 'Test' } as any;
```

### Test File Location

Test files are placed **adjacent to source files**:

```
src/lib/server/monitoring/specifications/
├── UpgradeableSpecification.ts
└── UpgradeableSpecification.test.ts
```

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

| File                               | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `src/hooks.server.ts`              | Server startup, service initialization, request handling |
| `src/lib/server/db/schema.ts`      | Database schema definitions                              |
| `src/lib/server/db/schema-sync.ts` | Schema migrations                                        |
| `src/lib/validation/schemas.ts`    | Zod validation schemas                                   |
| `src/lib/errors/index.ts`          | Error classes (AppError hierarchy)                       |
| `src/lib/logging/index.ts`         | Logger utility                                           |
| `CLAUDE.md`                        | Architecture overview and common patterns                |
