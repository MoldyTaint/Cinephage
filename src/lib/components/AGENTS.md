# Frontend Component Architecture

## Convention

- All components live in `$lib/components/`
- Domain-prefixed PascalCase naming (e.g., `ActivityTable`, `LibraryMediaCard`)
- Every directory has a barrel `index.ts` that re-exports its components
- Import using barrel imports: `import { X } from '$lib/components/domain'` — NOT direct paths
- Sub-components for a feature live in the same directory as their parent
- Shared/generic components live in `ui/`

## Pattern: Container / Presentational

Large components (300+ lines) should be split:

- **Container** — handles fetch, state management, business logic, event handlers
- **Presentational** — receives data as `$props()`, renders UI, emits events via `onXxx` callbacks

```
Before:  DownloadClientModal.svelte (826 lines, fetches + renders + submits all in one)
After:
  downloadClients/
    DownloadClientModal.svelte     (container: fetch, state, submit)
    DownloadClientForm.svelte      (presentational: form UI)
    DownloadClientStatus.svelte    (presentational: status display)
```

## Anti-Patterns

- **NEVER** call `fetch()` directly in components — use `$lib/api/` service layer
- **NEVER** mix fetch/state/rendering in one component if it exceeds 300 lines
- **NEVER** use `import { page } from '$app/state'` — use `$app/state` in Svelte 5
- **NEVER** import components directly by path when a barrel import exists

## Svelte 5

- Use `$props()` for component props, `$state()` for local state, `$derived()` for computed values
- Callbacks use `onXxx` naming: `onClose`, `onCancel`, `onSave`
- No legacy `export let`, `$:`, or `let:` directives remain

## API Layer

All data fetching goes through `$lib/api/` modules:
- `$lib/api/activity` — activity feed and history
- `$lib/api/library` — library scans, imports, media operations
- `$lib/api/livetv` — channels, EPG, accounts
- `$lib/api/settings` — all settings CRUD
- (etc. — see `src/lib/api/` for full list)
