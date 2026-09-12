#!/usr/bin/env npx tsx
/**
 * Indexer Definition Validator and Tester
 *
 * This script validates all Cardigann YAML definitions in /data/indexers/definitions/
 * and optionally performs live search tests against the actual sites.
 *
 * Usage:
 *   npx tsx scripts/validate-indexers.ts                    # Validate all definitions
 *   npx tsx scripts/validate-indexers.ts --test             # Validate + live test
 *   npx tsx scripts/validate-indexers.ts --indexer <id>    # Test specific indexer
 *   npx tsx scripts/validate-indexers.ts --verbose          # Show detailed output
 *   npx tsx scripts/validate-indexers.ts --test --use-captcha-solver
 *       # Live test using IndexerHttp with captcha solver fallback
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { createIndexerHttp } from '../src/lib/server/indexers/http/IndexerHttp';

// ANSI color codes for terminal output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m'
};

// Required fields for a valid Cardigann definition
const REQUIRED_FIELDS = ['id', 'name', 'type', 'links', 'caps'];

interface CardigannDefinition {
	id: string;
	name: string;
	description?: string;
	type: 'public' | 'semi-private' | 'private';
	language?: string;
	encoding?: string;
	requestdelay?: number;
	links: string[];
	legacylinks?: string[];
	settings?: Array<{
		name: string;
		type: string;
		label?: string;
		default?: unknown;
	}>;
	caps: {
		modes?: Record<string, string[]>;
		categories?: Record<string, string>;
		categorymappings?: Array<{
			id: string;
			cat?: string;
			desc?: string;
			default?: boolean;
		}>;
	};
	login?: {
		method?: string;
		path?: string;
		inputs?: Record<string, string>;
		test?: {
			path?: string;
			selector?: string;
		};
	};
	search?: {
		path?: string;
		paths?: Array<{
			path?: string;
			method?: string;
			inputs?: Record<string, string>;
			categories?: string[];
		}>;
		method?: string;
		inputs?: Record<string, string>;
		rows?: {
			selector: string;
			after?: number;
			remove?: string;
		};
		fields?: Record<string, unknown>;
	};
	download?: Record<string, unknown>;
	followredirect?: boolean;
}

interface ValidationResult {
	file: string;
	indexerId: string;
	indexerName: string;
	valid: boolean;
	errors: string[];
	warnings: string[];
}

interface TestResult {
	indexerId: string;
	success: boolean;
	resultCount?: number;
	duration?: number;
	error?: string;
}

/**
 * Load and parse a YAML definition file.
 */
function loadDefinition(filePath: string): { data: unknown; error?: string } {
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const data = yaml.load(content);
		return { data };
	} catch (error) {
		return {
			data: null,
			error: `YAML parse error: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}

/**
 * Validate a Cardigann definition.
 */
function validateDefinition(data: unknown, fileName: string): ValidationResult {
	const result: ValidationResult = {
		file: fileName,
		indexerId: 'unknown',
		indexerName: 'unknown',
		valid: false,
		errors: [],
		warnings: []
	};

	if (!data || typeof data !== 'object') {
		result.errors.push('Definition is empty or not an object');
		return result;
	}

	const obj = data as Record<string, unknown>;
	result.indexerId = String(obj.id ?? 'unknown');
	result.indexerName = String(obj.name ?? 'unknown');

	// Check required fields
	for (const field of REQUIRED_FIELDS) {
		if (!(field in obj)) {
			result.errors.push(`Missing required field: ${field}`);
		}
	}

	// Validate type
	const validTypes = ['public', 'semi-private', 'private'];
	if (obj.type && !validTypes.includes(String(obj.type))) {
		result.errors.push(`Invalid type: ${obj.type}. Must be one of: ${validTypes.join(', ')}`);
	}

	// Validate links
	if (Array.isArray(obj.links)) {
		if (obj.links.length === 0) {
			result.errors.push('links array is empty');
		}
		for (const link of obj.links) {
			try {
				new URL(String(link));
			} catch {
				result.errors.push(`Invalid URL in links: ${link}`);
			}
		}
	} else if (obj.links) {
		result.errors.push('links must be an array');
	}

	// Validate caps
	const caps = obj.caps as CardigannDefinition['caps'] | undefined;
	if (caps && typeof caps === 'object') {
		if (!caps.modes && !caps.categories && !caps.categorymappings) {
			result.warnings.push('No modes, categories, or categorymappings defined in caps');
		}
	}

	// Check search configuration
	const search = obj.search as CardigannDefinition['search'] | undefined;
	if (!search) {
		result.warnings.push('No search block defined');
	} else {
		// Check for rows selector (HTML parsing)
		if (!search.rows && !search.path?.includes('.json') && !search.path?.includes('.xml')) {
			result.warnings.push('No rows selector defined for HTML parsing');
		}

		// Check for essential fields
		const fields = search.fields ?? {};
		const hasTitle = 'title' in fields;
		const hasDownload =
			'download' in fields || 'magnet' in fields || 'magneturl' in fields || 'magneturi' in fields;

		if (!hasTitle) {
			result.warnings.push('No "title" field defined in search.fields');
		}
		if (!hasDownload) {
			result.warnings.push('No download/magnet field defined in search.fields');
		}
	}

	// Check login for private indexers
	if ((obj.type === 'private' || obj.type === 'semi-private') && !obj.login) {
		result.warnings.push(`${obj.type} indexer has no login configuration`);
	}

	result.valid = result.errors.length === 0;
	return result;
}

/**
 * Perform a live test against an indexer.
 */
async function testIndexer(
	def: CardigannDefinition,
	useCaptchaSolver: boolean
): Promise<TestResult> {
	const result: TestResult = {
		indexerId: def.id,
		success: false
	};

	// Skip private indexers without auth
	if (def.type !== 'public') {
		result.error = 'Skipped: requires authentication';
		return result;
	}

	const startTime = Date.now();

	try {
		// Build a simple search URL
		const baseUrl = def.links[0];
		let searchPath = def.search?.path ?? def.search?.paths?.[0]?.path ?? '/search';

		// Expand simple template variables
		searchPath = searchPath
			.replace(/\{\{\s*\.Keywords\s*\}\}/g, 'test')
			.replace(/\{\{\s*\.Query\.Q\s*\}\}/g, 'test')
			.replace(/\{\{\s*if[^}]+\}\}.*?\{\{\s*end\s*\}\}/gs, '');

		const searchUrl = new URL(searchPath, baseUrl).toString();

		const timeoutMs = 30000;
		let content = '';
		let status = 0;
		let _headers: Headers | undefined;

		if (useCaptchaSolver) {
			const http = createIndexerHttp({
				indexerId: `validator-${def.id}`,
				indexerName: def.name,
				baseUrl,
				userAgent: 'Cinephage/1.0 (IndexerValidator)',
				defaultTimeout: Math.max(timeoutMs, 60000)
			});

			const response = await http.get(searchUrl);
			content = response.body;
			status = response.status;
			_headers = response.headers;
		} else {
			// Perform request
			const response = await fetch(searchUrl, {
				method: 'GET',
				headers: {
					'User-Agent': 'Cinephage/1.0 (IndexerValidator)'
				},
				signal: AbortSignal.timeout(timeoutMs)
			});

			status = response.status;
			_headers = response.headers;
			content = await response.text();
		}

		result.duration = Date.now() - startTime;

		if (status < 200 || status >= 300) {
			result.error = `HTTP ${status}`;
			return result;
		}

		// Check for Cloudflare
		if (content.includes('cf-browser-verification') || content.includes('Just a moment...')) {
			result.error = 'Cloudflare protection detected';
			return result;
		}

		// Check for captcha
		if (/recaptcha|hcaptcha|captcha/i.test(content)) {
			result.error = 'Captcha detected';
			return result;
		}

		// Try to count results if we have a rows selector
		if (def.search?.rows?.selector) {
			const cheerio = await import('cheerio');
			const $ = cheerio.load(content);
			result.resultCount = $(def.search.rows.selector).length;
		}

		result.success = true;
	} catch (error) {
		result.duration = Date.now() - startTime;
		if (error instanceof Error) {
			if (error.name === 'TimeoutError' || error.name === 'AbortError') {
				result.error = 'Request timed out';
			} else {
				result.error = error.message;
			}
		} else {
			result.error = String(error);
		}
	}

	return result;
}

/**
 * Print validation result.
 */
function printValidationResult(result: ValidationResult, verbose: boolean): void {
	const status = result.valid ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;

	const warnings =
		result.warnings.length > 0
			? ` ${colors.yellow}(${result.warnings.length} warnings)${colors.reset}`
			: '';

	console.log(`${status} ${result.indexerName} (${result.indexerId})${warnings}`);

	if (!result.valid || verbose) {
		for (const error of result.errors) {
			console.log(`  ${colors.red}ERROR: ${error}${colors.reset}`);
		}
	}

	if (verbose) {
		for (const warning of result.warnings) {
			console.log(`  ${colors.yellow}WARN: ${warning}${colors.reset}`);
		}
	}
}

/**
 * Print test result.
 */
function printTestResult(result: TestResult): void {
	const status = result.success
		? `${colors.green}✓${colors.reset}`
		: result.error?.startsWith('Skipped')
			? `${colors.cyan}⊘${colors.reset}`
			: `${colors.red}✗${colors.reset}`;

	const duration = result.duration ? ` (${result.duration}ms)` : '';
	const count = result.resultCount !== undefined ? ` [${result.resultCount} results]` : '';
	const error = result.error && !result.success ? ` - ${result.error}` : '';

	console.log(`  ${status} Test${duration}${count}${error}`);
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const verbose = args.includes('--verbose') || args.includes('-v');
	const doTest = args.includes('--test') || args.includes('-t');
	const useCaptchaSolver = args.includes('--use-captcha-solver');
	const indexerArg = args.find((_, i, arr) => arr[i - 1] === '--indexer' || arr[i - 1] === '-i');

	if (useCaptchaSolver && !doTest) {
		console.warn(
			`${colors.yellow}Warning: --use-captcha-solver only applies with --test${colors.reset}`
		);
	}

	const definitionsDir = path.resolve(process.cwd(), 'data/indexers/definitions');

	if (!fs.existsSync(definitionsDir)) {
		console.error(
			`${colors.red}Error: Definitions directory not found: ${definitionsDir}${colors.reset}`
		);
		process.exit(1);
	}

	console.log(`${colors.bright}Cinephage Indexer Validator${colors.reset}`);
	console.log(`${colors.cyan}Scanning: ${definitionsDir}${colors.reset}\n`);

	// Find all YAML files
	const files = fs
		.readdirSync(definitionsDir)
		.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
		.filter((f) => !indexerArg || f.startsWith(indexerArg));

	if (files.length === 0) {
		console.log(`${colors.yellow}No definition files found.${colors.reset}`);
		process.exit(0);
	}

	console.log(`Found ${files.length} definition(s)\n`);

	let validCount = 0;
	let invalidCount = 0;
	let testPassCount = 0;
	let testFailCount = 0;

	for (const file of files) {
		const filePath = path.join(definitionsDir, file);
		const { data, error } = loadDefinition(filePath);

		if (error) {
			console.log(`${colors.red}✗${colors.reset} ${file}`);
			console.log(`  ${colors.red}ERROR: ${error}${colors.reset}`);
			invalidCount++;
			continue;
		}

		const result = validateDefinition(data, file);
		printValidationResult(result, verbose);

		if (result.valid) {
			validCount++;

			// Live test if requested
			if (doTest) {
				const def = data as CardigannDefinition;
				const testResult = await testIndexer(def, useCaptchaSolver);
				printTestResult(testResult);

				if (testResult.success) {
					testPassCount++;
				} else if (!testResult.error?.startsWith('Skipped')) {
					testFailCount++;
				}
			}
		} else {
			invalidCount++;
		}
	}

	// Summary
	console.log(`\n${colors.bright}Summary${colors.reset}`);
	console.log(`${colors.green}Valid: ${validCount}${colors.reset}`);
	if (invalidCount > 0) {
		console.log(`${colors.red}Invalid: ${invalidCount}${colors.reset}`);
	}
	if (doTest) {
		console.log(`${colors.green}Tests passed: ${testPassCount}${colors.reset}`);
		if (testFailCount > 0) {
			console.log(`${colors.red}Tests failed: ${testFailCount}${colors.reset}`);
		}
	}

	// Exit with error code if any invalid
	process.exit(invalidCount > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error(`${colors.red}Fatal error: ${error}${colors.reset}`);
	process.exit(1);
});
