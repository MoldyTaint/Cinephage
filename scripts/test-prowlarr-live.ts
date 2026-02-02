#!/usr/bin/env npx tsx
/**
 * Live test for new Prowlarr indexer definitions.
 * Tests actual HTTP requests and response parsing.
 *
 * Usage:
 *   npx tsx scripts/test-prowlarr-live.ts                    # Test all new indexers
 *   npx tsx scripts/test-prowlarr-live.ts thepiratebay       # Test specific indexer
 *   npx tsx scripts/test-prowlarr-live.ts --verbose          # Show detailed output
 */

import { getYamlIndexerFactory } from '../src/lib/server/indexers/loader/YamlIndexerFactory.js';
import type { IIndexer, ReleaseResult } from '../src/lib/server/indexers/types/index.js';

// ANSI colors
const c = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m'
};

// New Prowlarr indexers we added
const PROWLARR_INDEXERS = ['thepiratebay', 'nyaasi', 'torrentdownloads', 'eztv'];

// Test queries per indexer
const TEST_QUERIES: Record<string, { query: string; type: 'movie' | 'tv' | 'basic' }> = {
	thepiratebay: { query: 'matrix 1999', type: 'movie' },
	nyaasi: { query: 'attack on titan', type: 'basic' }, // Anime indexer
	torrentdownloads: { query: 'inception 2010', type: 'movie' },
	eztv: { query: 'breaking bad', type: 'tv' }
};

interface TestResult {
	indexerId: string;
	indexerName: string;
	passed: boolean;
	resultCount: number;
	duration: number;
	error?: string;
	sampleResults?: Array<{
		title: string;
		size?: string;
		seeders?: number;
	}>;
}

async function testIndexer(
	indexer: IIndexer,
	indexerId: string,
	verbose: boolean
): Promise<TestResult> {
	const startTime = Date.now();
	const testQuery = TEST_QUERIES[indexerId] || { query: 'matrix', type: 'basic' };

	console.log(
		`\n${c.cyan}Testing ${c.bold}${indexer.name}${c.reset}${c.cyan} (${indexerId})${c.reset}`
	);
	console.log(`  ${c.dim}Query: "${testQuery.query}" (${testQuery.type})${c.reset}`);

	try {
		// Perform search
		const criteria = {
			searchType: testQuery.type as 'movie' | 'tv' | 'basic',
			query: testQuery.query,
			categories: []
		};

		const results = (await Promise.race([
			indexer.search(criteria),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
			)
		])) as { releases?: ReleaseResult[] } | ReleaseResult[];

		const releases: ReleaseResult[] = Array.isArray(results) ? results : results?.releases || [];
		const duration = Date.now() - startTime;

		if (releases.length === 0) {
			return {
				indexerId,
				indexerName: indexer.name,
				passed: false,
				resultCount: 0,
				duration,
				error: 'No results returned'
			};
		}

		// Validate result structure
		const firstResult = releases[0];
		const hasTitle = !!firstResult.title;
		const hasDownload = !!(firstResult.downloadUrl || firstResult.torrent?.magnetUrl);

		if (!hasTitle) {
			return {
				indexerId,
				indexerName: indexer.name,
				passed: false,
				resultCount: releases.length,
				duration,
				error: 'Results missing title field'
			};
		}

		if (!hasDownload) {
			return {
				indexerId,
				indexerName: indexer.name,
				passed: false,
				resultCount: releases.length,
				duration,
				error: 'Results missing download/magnet URL'
			};
		}

		// Sample results for verbose output
		const sampleResults = releases.slice(0, 3).map((r: ReleaseResult) => ({
			title: r.title?.substring(0, 60) + (r.title?.length > 60 ? '...' : ''),
			size: r.size ? formatBytes(r.size) : undefined,
			seeders: r.torrent?.seeders ?? r.seeders
		}));

		if (verbose) {
			console.log(`  ${c.dim}Detailed results:${c.reset}`);
			for (const r of releases.slice(0, 5)) {
				console.log(`    - ${r.title?.substring(0, 60)}`);
				console.log(
					`      Size: ${formatBytes(r.size)}, Seeders: ${r.torrent?.seeders ?? r.seeders ?? 'N/A'}`
				);
				console.log(`      URL: ${r.downloadUrl?.substring(0, 80)}...`);
			}
			if (releases.length > 5) {
				console.log(`    ... and ${releases.length - 5} more`);
			}
		}

		return {
			indexerId,
			indexerName: indexer.name,
			passed: true,
			resultCount: releases.length,
			duration,
			sampleResults
		};
	} catch (error) {
		const duration = Date.now() - startTime;
		const errMsg = error instanceof Error ? error.message : String(error);

		// Check for common issues
		let errorDetail = errMsg;
		if (errMsg.includes('403') || errMsg.includes('Cloudflare')) {
			errorDetail = 'Cloudflare protected - needs FlareSolverr';
		} else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ENOTFOUND')) {
			errorDetail = 'Site unreachable';
		} else if (errMsg.includes('Timeout')) {
			errorDetail = 'Request timed out (30s)';
		}

		return {
			indexerId,
			indexerName: indexer.name,
			passed: false,
			resultCount: 0,
			duration,
			error: errorDetail
		};
	}
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const verbose = args.includes('--verbose') || args.includes('-v');
	const specificIndexer = args.find((a) => !a.startsWith('-'));

	console.log(
		`${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════╗${c.reset}`
	);
	console.log(
		`${c.bold}${c.cyan}║       PROWLARR INDEXERS LIVE TEST                          ║${c.reset}`
	);
	console.log(
		`${c.bold}${c.cyan}╚════════════════════════════════════════════════════════════╝${c.reset}`
	);

	// Get the factory
	console.log(`\n${c.dim}Loading YAML definitions and factory...${c.reset}`);
	const factory = await getYamlIndexerFactory();

	// Filter to Prowlarr indexers
	let indexersToTest = PROWLARR_INDEXERS;
	if (specificIndexer) {
		indexersToTest = [specificIndexer];
	}

	const results: TestResult[] = [];

	for (const indexerId of indexersToTest) {
		// Check if definition exists
		const definition = factory.getDefinition(indexerId);

		if (!definition) {
			console.log(`\n${c.yellow}⚠ Indexer "${indexerId}" not found${c.reset}`);
			results.push({
				indexerId,
				indexerName: indexerId,
				passed: false,
				resultCount: 0,
				duration: 0,
				error: 'Definition not found'
			});
			continue;
		}

		try {
			// Create indexer instance using the factory
			const config = {
				id: `test-${indexerId}`,
				name: definition.name,
				definitionId: indexerId,
				baseUrl: definition.links?.[0] || '',
				alternateUrls: [] as string[],
				protocol: (definition.protocol || 'torrent') as 'torrent' | 'usenet',
				enabled: true,
				priority: 25,
				enableAutomaticSearch: true,
				enableInteractiveSearch: true,
				settings: {}
			};

			const indexer = await factory.createIndexer(config);
			const result = await testIndexer(indexer, indexerId, verbose);
			results.push(result);

			// Display result
			if (result.passed) {
				console.log(
					`  ${c.green}✓ PASS${c.reset} - ${result.resultCount} results in ${result.duration}ms`
				);

				if (verbose && result.sampleResults) {
					console.log(`  ${c.dim}Sample results:${c.reset}`);
					for (const sample of result.sampleResults) {
						const meta = [
							sample.size,
							sample.seeders !== undefined ? `${sample.seeders} seeders` : null
						]
							.filter(Boolean)
							.join(', ');
						console.log(`    - ${sample.title}${meta ? ` (${meta})` : ''}`);
					}
				}
			} else {
				console.log(`  ${c.red}✗ FAIL${c.reset} - ${result.error}`);
			}

			// Remove from factory cache to avoid stale state
			factory.removeIndexer(config.id);
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.log(
				`\n${c.cyan}Testing ${c.bold}${definition.name}${c.reset}${c.cyan} (${indexerId})${c.reset}`
			);
			console.log(`  ${c.red}✗ FAIL${c.reset} - Failed to create indexer: ${errMsg}`);
			results.push({
				indexerId,
				indexerName: definition.name,
				passed: false,
				resultCount: 0,
				duration: 0,
				error: `Factory error: ${errMsg}`
			});
		}

		// Small delay between requests to be polite
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	// Summary
	console.log(
		`\n${c.bold}═══════════════════════════════════════════════════════════════${c.reset}`
	);
	console.log(`${c.bold}                         SUMMARY${c.reset}`);
	console.log(
		`${c.bold}═══════════════════════════════════════════════════════════════${c.reset}\n`
	);

	const passed = results.filter((r) => r.passed);
	const failed = results.filter((r) => !r.passed);

	for (const result of results) {
		const status = result.passed ? `${c.green}✓ PASS${c.reset}` : `${c.red}✗ FAIL${c.reset}`;
		console.log(
			`${status} ${result.indexerName} - ${result.resultCount} results (${result.duration}ms)${result.error ? ` - ${result.error}` : ''}`
		);
	}

	console.log(
		`\n${c.bold}Total: ${c.green}${passed.length} passed${c.reset}, ${c.red}${failed.length} failed${c.reset}`
	);

	// Exit with error code if any failed
	if (failed.length > 0) {
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(`\n${c.red}${c.bold}Fatal Error:${c.reset} ${error.message}`);
	console.error(error.stack);
	process.exit(1);
});
