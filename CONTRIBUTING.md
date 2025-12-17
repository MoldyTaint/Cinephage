# Contributing

Want to contribute? Here's how to get set up.

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

4. Start the development server:
   ```bash
   npm run dev
   ```

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

## Project Structure

```
src/
├── routes/           # SvelteKit pages and API endpoints
│   ├── api/         # REST API endpoints
│   └── ...          # Page routes
├── lib/
│   ├── components/  # Reusable Svelte components
│   ├── server/      # Server-side code
│   │   ├── db/      # Database schema and queries
│   │   ├── indexers/# Indexer system
│   │   ├── downloadClients/
│   │   ├── library/ # Library management
│   │   ├── monitoring/
│   │   ├── quality/ # Quality scoring
│   │   ├── scoring/ # Release scoring
│   │   └── subtitles/
│   ├── types/       # TypeScript types
│   ├── utils/       # Utility functions
│   └── stores/      # Svelte stores
├── test/            # Test setup and utilities
data/
├── indexers/        # Cardigann YAML indexer definitions
```

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

## Pull Request Process

1. Fork the repository and create your branch from `main`
2. Make your changes following the code style guidelines
3. Add or update tests as needed
4. Ensure all tests pass: `npm run test`
5. Ensure type checking passes: `npm run check`
6. Run formatting: `npm run format`
7. Submit a pull request with a clear description

## Adding New Indexers

Cinephage uses a Cardigann-style YAML definition system for indexers:

1. Create a new YAML file in `data/indexers/definitions/`
2. Follow the existing patterns in other definition files
3. Test the indexer thoroughly with different search queries
4. Add appropriate rate limiting settings

## Reporting Issues

When reporting issues, please include:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or error messages
- Your environment (OS, Node version, etc.)

## License

By contributing to Cinephage, you agree that your contributions will be licensed under the GNU General Public License v3.0.
