#!/usr/bin/env npx tsx
/**
 * YAML Indexer Test Suite
 *
 * Validates YAML indexer definitions and tests live search functionality.
 * Works directly from YAML files without requiring database configuration.
 *
 * Usage:
 *   npx tsx scripts/test-yaml-indexers.ts --validate         # Validate YAML schemas only
 *   npx tsx scripts/test-yaml-indexers.ts --live             # Live search tests only
 *   npx tsx scripts/test-yaml-indexers.ts --all              # Both validation and live tests
 *   npx tsx scripts/test-yaml-indexers.ts -i <id>            # Test specific indexer
 *   npx tsx scripts/test-yaml-indexers.ts --type public      # Filter by access type
 *   npx tsx scripts/test-yaml-indexers.ts -v                 # Verbose output
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { performance } from 'perf_hooks';

// =============================================================================
// ANSI Colors
// =============================================================================

const c = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	bgRed: '\x1b[41m',
	bgGreen: '\x1b[42m',
	bgYellow: '\x1b[43m'
};

// =============================================================================
// Test Configuration
// =============================================================================

const DEFINITIONS_PATH = 'data/indexers/definitions';

/** Well-known test media items */
const TEST_MEDIA = {
	movies: [
		{
			title: 'The Matrix',
			year: 1999,
			tmdbId: 603,
			imdbId: 'tt0133093'
		},
		{
			title: 'Inception',
			year: 2010,
			tmdbId: 27205,
			imdbId: 'tt1375666'
		}
	],
	tvShows: [
		{
			// Game of Thrones - works with EZTV IMDB lookup
			title: 'Game of Thrones',
			year: 2011,
			tmdbId: 1399,
			tvdbId: 121361,
			imdbId: 'tt0944947',
			season: 1,
			episode: 1
		},
		{
			title: 'Breaking Bad',
			year: 2008,
			tmdbId: 1396,
			tvdbId: 81189,
			imdbId: 'tt0903747',
			season: 1,
			episode: 1
		}
	]
};

// =============================================================================
// CLI Parsing
// =============================================================================

interface TestOptions {
	validate: boolean;
	live: boolean;
	indexer?: string;
	type?: 'public' | 'semi-private' | 'private';
	verbose: boolean;
	timeout: number;
	help: boolean;
}

function parseArgs(): TestOptions {
	const args = process.argv.slice(2);
	const options: TestOptions = {
		validate: false,
		live: false,
		verbose: false,
		timeout: 30000,
		help: false
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '--validate':
			case '-V':
				options.validate = true;
				break;
			case '--live':
			case '-L':
				options.live = true;
				break;
			case '--all':
			case '-a':
				options.validate = true;
				options.live = true;
				break;
			case '--indexer':
			case '-i':
				options.indexer = args[++i]?.toLowerCase();
				break;
			case '--type':
			case '-t':
				options.type = args[++i]?.toLowerCase() as 'public' | 'semi-private' | 'private';
				break;
			case '--verbose':
			case '-v':
				options.verbose = true;
				break;
			case '--timeout':
				options.timeout = parseInt(args[++i] ?? '30000', 10);
				break;
			case '--help':
			case '-h':
				options.help = true;
				break;
		}
	}

	// Default to both if neither specified
	if (!options.validate && !options.live) {
		options.validate = true;
		options.live = true;
	}

	return options;
}

function printHelp(): void {
	console.log(`
${c.bold}YAML Indexer Test Suite${c.reset}

${c.cyan}Usage:${c.reset}
  npx tsx scripts/test-yaml-indexers.ts [options]

${c.cyan}Options:${c.reset}
  -V, --validate       Run YAML schema validation only
  -L, --live           Run live search tests only
  -a, --all            Run both validation and live tests (default)
  -i, --indexer <id>   Test specific indexer by ID
  -t, --type <type>    Filter by access type (public, semi-private, private)
  -v, --verbose        Show detailed output
  --timeout <ms>       Request timeout in milliseconds (default: 30000)
  -h, --help           Show this help message

${c.cyan}Examples:${c.reset}
  npx tsx scripts/test-yaml-indexers.ts                    # Full test suite
  npx tsx scripts/test-yaml-indexers.ts --validate         # Schema validation only
  npx tsx scripts/test-yaml-indexers.ts -i <id> -v         # Test a specific indexer
  npx tsx scripts/test-yaml-indexers.ts --type public -L   # Live test all public indexers
`);
}

// =============================================================================
// Result Types
// =============================================================================

interface ValidationResult {
	id: string;
	name: string;
	filePath: string;
	valid: boolean;
	errors: string[];
	warnings: string[];
	type?: string;
	protocol?: string;
}

interface LiveTestResult {
	id: string;
	name: string;
	type: string;
	tests: {
		name: string;
		passed: boolean;
		duration: number;
		resultCount?: number;
		error?: string;
		details?: string;
	}[];
	overallPassed: boolean;
	skipped: boolean;
	skipReason?: string;
}

// =============================================================================
// Phase 1: YAML Validation
// =============================================================================

async function runValidation(options: TestOptions): Promise<ValidationResult[]> {
	console.log(`\n${c.bold}${c.cyan}▸ Phase 1: YAML Validation${c.reset}\n`);

	// Dynamically import to avoid issues before module resolution
	const { safeValidateYamlDefinition, formatValidationError } =
		await import('../src/lib/server/indexers/schema/yamlDefinition.js');

	const results: ValidationResult[] = [];
	const yamlFiles = findYamlFiles(DEFINITIONS_PATH);

	console.log(`  Loading definitions from ${c.dim}${DEFINITIONS_PATH}/${c.reset}...`);
	console.log(`  ${c.green}✓${c.reset} Found ${c.bold}${yamlFiles.length}${c.reset} YAML files\n`);

	console.log(`  Validating schemas...\n`);

	for (const filePath of yamlFiles) {
		const result = await validateYamlFile(filePath, safeValidateYamlDefinition, options);

		// Apply filters
		if (options.indexer && result.id.toLowerCase() !== options.indexer) {
			continue;
		}
		if (options.type && result.type !== options.type) {
			continue;
		}

		results.push(result);

		// Output result
		const relativePath = path.relative(DEFINITIONS_PATH, filePath);
		if (result.valid) {
			console.log(`  ${c.green}✓${c.reset} ${relativePath} ${c.dim}(${result.id})${c.reset}`);
			if (options.verbose && result.warnings.length > 0) {
				for (const warn of result.warnings) {
					console.log(`    ${c.yellow}⚠ ${warn}${c.reset}`);
				}
			}
		} else {
			console.log(`  ${c.red}✗${c.reset} ${relativePath}`);
			for (const error of result.errors) {
				console.log(`    ${c.red}└─ ${error}${c.reset}`);
			}
		}
	}

	// Summary
	const valid = results.filter((r) => r.valid).length;
	const invalid = results.filter((r) => !r.valid).length;

	console.log(
		`\n  ${c.bold}Summary:${c.reset} ${c.green}${valid}${c.reset}/${results.length} valid`
	);
	if (invalid > 0) {
		console.log(`           ${c.red}${invalid}${c.reset} invalid`);
	}

	return results;
}

function findYamlFiles(directory: string): string[] {
	const files: string[] = [];

	if (!fs.existsSync(directory)) {
		return files;
	}

	const entries = fs.readdirSync(directory, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			files.push(...findYamlFiles(fullPath));
		} else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
			files.push(fullPath);
		}
	}

	return files;
}

async function validateYamlFile(
	filePath: string,
	validator: (data: unknown) => {
		success: boolean;
		data?: unknown;
		error?: { issues: { path: (string | number)[]; message: string }[] };
	},
	options: TestOptions
): Promise<ValidationResult> {
	const result: ValidationResult = {
		id: path.basename(filePath, path.extname(filePath)),
		name: '',
		filePath,
		valid: false,
		errors: [],
		warnings: []
	};

	try {
		// Read and parse YAML
		const content = fs.readFileSync(filePath, 'utf-8');
		const parsed = yaml.load(content) as Record<string, unknown>;

		if (!parsed || typeof parsed !== 'object') {
			result.errors.push('Invalid YAML: not an object');
			return result;
		}

		// Extract basic info before validation
		result.id = (parsed.id as string) || result.id;
		result.name = (parsed.name as string) || result.id;
		result.type = parsed.type as string;
		result.protocol = (parsed.protocol as string) ?? 'torrent';

		// Run schema validation
		const validation = validator(parsed);

		if (!validation.success) {
			result.errors = validation.error?.issues.map(
				(issue) => `${issue.path.join('.')}: ${issue.message}`
			) ?? ['Unknown validation error'];
			return result;
		}

		result.valid = true;

		// Additional warnings for common issues
		if (options.verbose) {
			const def = parsed as Record<string, unknown>;

			// Check for empty search paths
			const search = def.search as Record<string, unknown> | undefined;
			if (search?.paths && Array.isArray(search.paths) && search.paths.length === 0) {
				result.warnings.push('No search paths defined');
			}

			// Check for missing capabilities
			const caps = def.caps as Record<string, unknown> | undefined;
			if (!caps?.modes) {
				result.warnings.push('No search modes defined in caps');
			}
		}
	} catch (error) {
		result.errors.push(error instanceof Error ? error.message : String(error));
	}

	return result;
}

// =============================================================================
// Phase 2: Live Search Testing
// =============================================================================

async function runLiveTests(
	validationResults: ValidationResult[],
	options: TestOptions
): Promise<LiveTestResult[]> {
	console.log(`\n${c.bold}${c.cyan}▸ Phase 2: Live Search Testing${c.reset}\n`);

	// Dynamically import modules
	const { YamlDefinitionLoader } =
		await import('../src/lib/server/indexers/loader/YamlDefinitionLoader.js');
	const { YamlIndexer } = await import('../src/lib/server/indexers/runtime/YamlIndexer.js');

	// Load all definitions
	const loader = new YamlDefinitionLoader();
	await loader.loadAll([DEFINITIONS_PATH]);

	const results: LiveTestResult[] = [];
	const validDefs = validationResults.filter((r) => r.valid);

	// Filter to public indexers only (unless specific indexer requested)
	const defsToTest = validDefs.filter((r) => {
		if (options.indexer) {
			return r.id.toLowerCase() === options.indexer;
		}
		if (options.type) {
			return r.type === options.type;
		}
		// Default: only test public indexers (no auth required)
		return r.type === 'public';
	});

	if (defsToTest.length === 0) {
		console.log(`  ${c.yellow}⚠ No indexers to test${c.reset}`);
		if (!options.indexer && !options.type) {
			console.log(
				`    ${c.dim}(Only public indexers are tested by default. Use --type to test others)${c.reset}`
			);
		}
		return results;
	}

	console.log(`  Testing ${c.bold}${defsToTest.length}${c.reset} indexer(s)...\n`);

	for (const defResult of defsToTest) {
		const definition = loader.getDefinition(defResult.id);

		if (!definition) {
			results.push({
				id: defResult.id,
				name: defResult.name,
				type: defResult.type || 'unknown',
				tests: [],
				overallPassed: false,
				skipped: true,
				skipReason: 'Definition not found in loader'
			});
			continue;
		}

		// Check if auth is required
		const needsAuth = definition.login && definition.type !== 'public';
		if (needsAuth && !options.indexer) {
			results.push({
				id: defResult.id,
				name: defResult.name,
				type: defResult.type || 'unknown',
				tests: [],
				overallPassed: false,
				skipped: true,
				skipReason: 'Requires authentication'
			});
			console.log(
				`  ${c.yellow}⊘${c.reset} ${c.bold}${definition.name}${c.reset} ${c.dim}(requires auth - skipped)${c.reset}`
			);
			continue;
		}

		console.log(
			`  ${c.cyan}Testing ${c.bold}${definition.name}${c.reset}${c.cyan} (${defResult.type}/${defResult.protocol})${c.reset}`
		);

		const result = await testIndexerLive(definition, YamlIndexer, options);
		results.push(result);

		// Show results
		for (const test of result.tests) {
			const status = test.passed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
			const duration = `${c.dim}(${test.duration.toFixed(0)}ms)${c.reset}`;

			let line = `  ├─ ${status} ${test.name} ${duration}`;
			if (test.resultCount !== undefined) {
				line += ` - ${test.resultCount} results`;
			}
			if (!test.passed && test.error) {
				line += `\n  │  ${c.red}${test.error}${c.reset}`;
			} else if (options.verbose && test.details) {
				line += ` ${c.dim}${test.details}${c.reset}`;
			}

			console.log(line);
		}

		const overallStatus = result.overallPassed
			? `${c.green}PASS${c.reset}`
			: `${c.red}FAIL${c.reset}`;
		console.log(`  └─ ${overallStatus}\n`);
	}

	return results;
}

async function testIndexerLive(
	definition: Record<string, unknown>,
	YamlIndexer: new (config: unknown) => {
		search(criteria: unknown): Promise<unknown[]>;
		test?(): Promise<void>;
		capabilities: {
			search?: { available: boolean };
			movieSearch?: { available: boolean; supportedParams?: string[] };
			tvSearch?: { available: boolean; supportedParams?: string[] };
		};
	},
	options: TestOptions
): Promise<LiveTestResult> {
	const result: LiveTestResult = {
		id: definition.id as string,
		name: definition.name as string,
		type: (definition.type as string) || 'public',
		tests: [],
		overallPassed: false,
		skipped: false
	};

	try {
		// Create synthetic config
		const config = {
			id: `test-${definition.id}`,
			name: definition.name as string,
			definitionId: definition.id as string,
			baseUrl: ((definition.links as string[]) ?? [])[0] || '',
			alternateUrls: [],
			protocol: (definition.protocol as string) ?? 'torrent',
			enabled: true,
			priority: 50,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			settings: {}
		};

		// Create indexer instance
		const indexer = new YamlIndexer({
			config,
			definition
		});

		const caps = indexer.capabilities;

		// Test 1: Basic Search
		if (caps.search?.available) {
			const test = await runSearchTest(
				indexer,
				'Basic Search',
				{
					searchType: 'basic',
					query: 'matrix'
				},
				options.timeout
			);
			result.tests.push(test);
		}

		// Test 2: Movie Search
		if (caps.movieSearch?.available) {
			const movie = TEST_MEDIA.movies[0];
			const criteria: Record<string, unknown> = {
				searchType: 'movie',
				query: movie.title,
				year: movie.year
			};

			// Add IDs if supported (params are in camelCase from toSearchParams)
			const params = caps.movieSearch.supportedParams || [];
			if (params.includes('imdbId')) criteria.imdbId = movie.imdbId;
			if (params.includes('tmdbId')) criteria.tmdbId = movie.tmdbId;

			const test = await runSearchTest(indexer, 'Movie Search', criteria, options.timeout);
			result.tests.push(test);
		}

		// Test 3: TV Search
		if (caps.tvSearch?.available) {
			const show = TEST_MEDIA.tvShows[0];
			const criteria: Record<string, unknown> = {
				searchType: 'tv',
				query: show.title,
				season: show.season,
				episode: show.episode
			};

			// Add IDs if supported (params are in camelCase from toSearchParams)
			const params = caps.tvSearch.supportedParams || [];
			if (params.includes('imdbId')) criteria.imdbId = show.imdbId;
			if (params.includes('tvdbId')) criteria.tvdbId = show.tvdbId;
			if (params.includes('tmdbId')) criteria.tmdbId = show.tmdbId;

			const test = await runSearchTest(indexer, 'TV Search', criteria, options.timeout);
			result.tests.push(test);
		}

		// Determine overall result
		result.overallPassed = result.tests.length > 0 && result.tests.every((t) => t.passed);
	} catch (error) {
		result.tests.push({
			name: 'Indexer Setup',
			passed: false,
			duration: 0,
			error: classifyError(error)
		});
	}

	return result;
}

async function runSearchTest(
	indexer: { search(criteria: unknown): Promise<unknown[]> },
	testName: string,
	criteria: Record<string, unknown>,
	timeout: number
): Promise<LiveTestResult['tests'][0]> {
	const start = performance.now();

	try {
		const results = await Promise.race([
			indexer.search(criteria),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
		]);

		const releases = Array.isArray(results) ? results : [];
		const duration = performance.now() - start;

		if (releases.length === 0) {
			return {
				name: testName,
				passed: false,
				duration,
				resultCount: 0,
				error: 'No results returned (selector may be outdated)'
			};
		}

		// Validate result structure
		const firstResult = releases[0] as Record<string, unknown>;
		const hasTitle = typeof firstResult.title === 'string' && firstResult.title.length > 0;
		const hasDownload = !!(firstResult.downloadUrl || firstResult.magnetUrl || firstResult.link);

		if (!hasTitle) {
			return {
				name: testName,
				passed: false,
				duration,
				resultCount: releases.length,
				error: 'Invalid result: missing title'
			};
		}

		if (!hasDownload) {
			return {
				name: testName,
				passed: false,
				duration,
				resultCount: releases.length,
				error: 'Invalid result: missing download URL'
			};
		}

		return {
			name: testName,
			passed: true,
			duration,
			resultCount: releases.length,
			details: `First: "${(firstResult.title as string).substring(0, 50)}..."`
		};
	} catch (error) {
		return {
			name: testName,
			passed: false,
			duration: performance.now() - start,
			error: classifyError(error)
		};
	}
}

function classifyError(error: unknown): string {
	const msg = error instanceof Error ? error.message : String(error);

	if (msg.includes('Timeout')) {
		return 'Request timeout (site may be slow or blocked)';
	}
	if (msg.includes('Cloudflare') || msg.includes('403')) {
		return 'Cloudflare protected (needs FlareSolverr)';
	}
	if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
		return 'Connection failed (site may be down)';
	}
	if (msg.includes('ETIMEDOUT')) {
		return 'Connection timeout (network issue)';
	}
	if (msg.includes('404')) {
		return 'Page not found (URL may have changed)';
	}
	if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
		return 'Server error (site issue)';
	}
	if (msg.includes('selector') || msg.includes('parse')) {
		return `Parse error: ${msg}`;
	}

	return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
}

// =============================================================================
// Summary
// =============================================================================

function printSummary(
	validationResults: ValidationResult[],
	liveResults: LiveTestResult[],
	options: TestOptions
): void {
	console.log(
		`\n${c.bold}${c.white}════════════════════════════════════════════════════════════════${c.reset}`
	);
	console.log(`${c.bold}                    RESULTS SUMMARY${c.reset}`);
	console.log(
		`${c.bold}${c.white}════════════════════════════════════════════════════════════════${c.reset}\n`
	);

	if (options.validate) {
		const validCount = validationResults.filter((r) => r.valid).length;
		const invalidCount = validationResults.filter((r) => !r.valid).length;
		console.log(
			`${c.cyan}Validation:${c.reset}  ${c.green}${validCount}${c.reset}/${validationResults.length} passed`
		);
		if (invalidCount > 0) {
			console.log(`             ${c.red}${invalidCount} failed${c.reset}`);
		}
	}

	if (options.live) {
		const passedCount = liveResults.filter((r) => r.overallPassed).length;
		const failedCount = liveResults.filter((r) => !r.overallPassed && !r.skipped).length;
		const skippedCount = liveResults.filter((r) => r.skipped).length;

		console.log(
			`${c.cyan}Live Tests:${c.reset}  ${c.green}${passedCount}${c.reset}/${liveResults.length - skippedCount} passed`
		);
		if (failedCount > 0) {
			console.log(`             ${c.red}${failedCount} failed${c.reset}`);
		}
		if (skippedCount > 0) {
			console.log(`             ${c.yellow}${skippedCount} skipped${c.reset}`);
		}
	}

	// List failures
	const allFailures: { id: string; reason: string }[] = [];

	for (const r of validationResults.filter((r) => !r.valid)) {
		allFailures.push({ id: r.id, reason: `Schema: ${r.errors[0]}` });
	}

	for (const r of liveResults.filter((r) => !r.overallPassed && !r.skipped)) {
		const failedTest = r.tests.find((t) => !t.passed);
		allFailures.push({
			id: r.id,
			reason: failedTest?.error || 'Unknown error'
		});
	}

	if (allFailures.length > 0) {
		console.log(`\n${c.bold}Failed:${c.reset}`);
		for (const f of allFailures) {
			console.log(`  ${c.red}✗${c.reset} ${f.id} - ${f.reason}`);
		}
	}
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
	const options = parseArgs();

	if (options.help) {
		printHelp();
		process.exit(0);
	}

	console.log(
		`\n${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════════╗${c.reset}`
	);
	console.log(
		`${c.bold}${c.cyan}║              YAML INDEXER TEST SUITE                           ║${c.reset}`
	);
	console.log(
		`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════════════╝${c.reset}`
	);

	let validationResults: ValidationResult[] = [];
	let liveResults: LiveTestResult[] = [];

	// Phase 1: Validation
	if (options.validate) {
		validationResults = await runValidation(options);
	}

	// Phase 2: Live Tests
	if (options.live) {
		// If validation wasn't run, we need to load definitions for filtering
		if (validationResults.length === 0) {
			validationResults = await runValidation({ ...options, validate: true });
		}
		liveResults = await runLiveTests(validationResults, options);
	}

	// Summary
	printSummary(validationResults, liveResults, options);

	// Exit code
	const hasFailures =
		validationResults.some((r) => !r.valid) ||
		liveResults.some((r) => !r.overallPassed && !r.skipped);

	console.log(
		`\n${c.bold}${hasFailures ? c.red : c.green}Test suite ${hasFailures ? 'completed with failures' : 'passed'}.${c.reset}\n`
	);

	process.exit(hasFailures ? 1 : 0);
}

main().catch((error) => {
	console.error(`\n${c.red}${c.bold}Fatal Error:${c.reset} ${error.message}`);
	if (error.stack) {
		console.error(`${c.dim}${error.stack}${c.reset}`);
	}
	process.exit(1);
});
