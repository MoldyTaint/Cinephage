[< Back to Index](../INDEX.md) | [Architecture](architecture.md) | [Testing](testing.md)

# Contributing Guide

Want to contribute to Cinephage? Here's everything you need to know.

---

## Development Setup

### Prerequisites

- Node.js 20 or higher
- npm 10 or higher
- A running instance of qBittorrent (for download client testing)

### Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/MoldyTaint/cinephage.git
   cd cinephage
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment example and configure:

   ```bash
   cp .env.example .env
   ```

4. Run database migrations:

   ```bash
   npx drizzle-kit push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

---

## Development Workflow

### Code Style

- We use **Prettier** for code formatting and **ESLint** for linting
- Run `npm run format` before committing to ensure consistent formatting
- Run `npm run lint` to check for linting issues

### Running Tests

```bash
npm run test        # Run all tests
npm run test:watch  # Run tests in watch mode
```

### Type Checking

```bash
npm run check       # Run svelte-check for TypeScript errors
```

### Building

```bash
npm run build       # Build for production
```

---

## Project Structure

See [Architecture Overview](architecture.md) for a detailed breakdown of the codebase structure.

Key directories:
- `src/routes/api/` - REST API endpoints
- `src/lib/server/` - Backend business logic
- `src/lib/components/` - Svelte components
- `data/indexers/definitions/` - Cardigann YAML indexers

---

## Svelte 5 Patterns

Cinephage uses Svelte 5 with runes. Key patterns:

### Props and Reactivity

```svelte
<script lang="ts">
    // Use $props() for component props
    let { data } = $props();

    // For mutable state that syncs from props, use $effect
    let localValue = $state('');
    $effect(() => {
        localValue = data.value ?? '';
    });

    // For read-only computed values, use $derived
    const computed = $derived(data.value * 2);
</script>
```

### Modal Form Pattern

```svelte
<script lang="ts">
    // Initialize with defaults (not prop values)
    let name = $state('');
    let enabled = $state(true);

    // Sync from props when modal opens
    $effect(() => {
        if (open) {
            name = prop?.name ?? '';
            enabled = prop?.enabled ?? true;
        }
    });
</script>
```

---

## Commit Messages

We follow conventional commit messages:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or modifications
- `chore:` Build process or auxiliary tool changes

Example: `feat: add subtitle auto-download scheduler`

---

## Pull Request Process

1. Fork the repository and create your branch from `main`
2. Make your changes following the code style guidelines
3. Add or update tests as needed
4. Ensure all tests pass: `npm run test`
5. Ensure type checking passes: `npm run check`
6. Run formatting: `npm run format`
7. Submit a pull request with a clear description

---

## Adding New Indexers

Cinephage uses a Cardigann-style YAML definition system for indexers.

### Creating a Definition

1. Create a new YAML file in `data/indexers/definitions/`
2. Follow the existing patterns in other definition files
3. Test the indexer thoroughly with different search queries
4. Add appropriate rate limiting settings

### Definition Structure

```yaml
id: example-indexer
name: Example Indexer
description: An example indexer definition
language: en-US
type: public
protocol: torrent

caps:
  modes:
    search: [q]
    movie-search: [q, imdbid]
  categories:
    '2000': Movies
    '5000': TV

links:
  - https://example.com

search:
  paths:
    - path: /api/search
      method: get
  inputs:
    query: '{{ .Query.Q }}'

  response:
    type: json
  rows:
    selector: results

  fields:
    title:
      selector: name
    download:
      selector: torrent_url
    size:
      selector: size
    seeders:
      selector: seeds
```

See the [Prowlarr/Indexers](https://github.com/Prowlarr/Indexers) repository for reference implementations.

---

## Adding New Subtitle Providers

Subtitle providers are implemented in `src/lib/server/subtitles/providers/`.

### Steps

1. Create a new provider file (e.g., `newprovider.ts`)
2. Implement the `SubtitleProvider` interface
3. Add rate limiting configuration
4. Register the provider in the provider manager
5. Add UI configuration in the settings page

---

## Key Services to Understand

Before contributing, familiarize yourself with these core services:

| Service | Location | Purpose |
|---------|----------|---------|
| `SearchService` | `src/lib/server/indexers/` | Multi-indexer search |
| `ImportService` | `src/lib/server/library/` | File import handling |
| `ScoringService` | `src/lib/server/scoring/` | Release scoring |
| `MonitoringScheduler` | `src/lib/server/monitoring/` | Automated tasks |
| `DownloadClientManager` | `src/lib/server/downloadClients/` | Download client integration |

See [Architecture](architecture.md) for the full system overview.

---

## Reporting Issues

When reporting issues, please include:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or error messages
- Your environment (OS, Node version, etc.)

---

## License

By contributing to Cinephage, you agree that your contributions will be licensed under the GNU General Public License v3.0.

---

**See also:** [Architecture](architecture.md) | [Testing](testing.md) | [Troubleshooting](../troubleshooting.md)
