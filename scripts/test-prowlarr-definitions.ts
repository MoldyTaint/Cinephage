#!/usr/bin/env npx tsx
/**
 * Prowlarr Definition Compatibility Tester
 *
 * This script validates Prowlarr/Cardigann YAML definitions against Cinephage's
 * actual Zod schema to ensure full compatibility before importing them.
 *
 * Usage:
 *   npx tsx scripts/test-prowlarr-definitions.ts                     # Test all target definitions
 *   npx tsx scripts/test-prowlarr-definitions.ts --copy              # Copy valid definitions to data/
 *   npx tsx scripts/test-prowlarr-definitions.ts --list              # List available Prowlarr definitions
 *   npx tsx scripts/test-prowlarr-definitions.ts <definition-id>     # Test specific definition
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
	safeValidateYamlDefinition,
	formatValidationError
} from '../src/lib/server/indexers/schema/yamlDefinition';

// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	magenta: '\x1b[35m'
};

// Prowlarr definitions directory
const PROWLARR_DEFS_DIR = path.resolve(process.cwd(), 'Inspiration/Indexers/definitions/v11');
// Cinephage definitions directory
const CINEPHAGE_DEFS_DIR = path.resolve(process.cwd(), 'data/indexers/definitions');

// Target public indexers to test (user-selected)
const TARGET_INDEXERS = [
	'thepiratebay',
	'nyaasi',
	'torrentdownloads',
	'kickasstorrents-to',
	'rutor'
];

interface TestResult {
	id: string;
	name: string;
	file: string;
	valid: boolean;
	errors: string[];
	warnings: string[];
	features: string[];
}

/**
 * Normalize field names from Prowlarr to Cinephage conventions.
 * This applies the same transforms as YamlDefinitionLoader.
 */
function normalizeDefinition(obj: Record<string, unknown>): void {
	// requestDelay -> requestdelay (case normalization)
	if ('requestDelay' in obj && !('requestdelay' in obj)) {
		obj.requestdelay = obj.requestDelay;
		delete obj.requestDelay;
	}
}

/**
 * Load and validate a Prowlarr definition.
 */
function testDefinition(filePath: string): TestResult {
	const fileName = path.basename(filePath);
	const result: TestResult = {
		id: 'unknown',
		name: 'unknown',
		file: fileName,
		valid: false,
		errors: [],
		warnings: [],
		features: []
	};

	try {
		// Load YAML
		const content = fs.readFileSync(filePath, 'utf-8');
		const parsed = yaml.load(content) as Record<string, unknown>;

		if (!parsed || typeof parsed !== 'object') {
			result.errors.push('Invalid YAML: not an object');
			return result;
		}

		result.id = String(parsed.id ?? 'unknown');
		result.name = String(parsed.name ?? 'unknown');

		// Apply normalizations
		normalizeDefinition(parsed);

		// Validate against Zod schema
		const validationResult = safeValidateYamlDefinition(parsed);

		if (!validationResult.success) {
			result.errors.push(formatValidationError(validationResult.error));
			return result;
		}

		result.valid = true;
		const def = validationResult.data;

		// Collect feature notes
		if (def.requestdelay) {
			result.features.push(`requestdelay: ${def.requestdelay}s`);
		}

		if (def.settings?.some((s) => s.type === 'info_flaresolverr')) {
			result.features.push('Uses FlareSolverr (Cloudflare)');
		}

		if (def.search.paths && def.search.paths.length > 1) {
			result.features.push(`${def.search.paths.length} search paths`);
		}

		const responseType = def.search.paths?.[0]?.response?.type ?? 'html';
		result.features.push(`Response: ${responseType}`);

		// Check for complex title processing
		const titleField = def.search.fields?.title;
		if (titleField && typeof titleField === 'object' && 'filters' in titleField) {
			const filterCount = titleField.filters?.length ?? 0;
			if (filterCount > 5) {
				result.features.push(`Complex title processing (${filterCount} filters)`);
			}
		}

		// Check category count
		const catCount = def.caps.categorymappings?.length ?? 0;
		if (catCount > 0) {
			result.features.push(`${catCount} category mappings`);
		}

		// Check for special settings
		const settingNames = (def.settings ?? []).map((s) => s.name);
		if (settingNames.includes('stripcyrillic')) {
			result.features.push('Cyrillic handling');
		}
		if (settingNames.includes('sonarr_compatibility')) {
			result.features.push('Sonarr compatibility mode');
		}
		if (settingNames.includes('radarr_compatibility')) {
			result.features.push('Radarr compatibility mode');
		}
	} catch (error) {
		result.errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
	}

	return result;
}

/**
 * Copy a validated definition to the Cinephage definitions directory.
 */
function copyDefinition(sourcePath: string, id: string): boolean {
	try {
		const destPath = path.join(CINEPHAGE_DEFS_DIR, `${id}.yaml`);
		fs.copyFileSync(sourcePath, destPath);
		return true;
	} catch (error) {
		console.error(
			`${colors.red}Failed to copy ${id}: ${error instanceof Error ? error.message : error}${colors.reset}`
		);
		return false;
	}
}

/**
 * List all available Prowlarr definitions.
 */
function listDefinitions(): void {
	if (!fs.existsSync(PROWLARR_DEFS_DIR)) {
		console.error(
			`${colors.red}Prowlarr definitions not found at: ${PROWLARR_DEFS_DIR}${colors.reset}`
		);
		process.exit(1);
	}

	const files = fs.readdirSync(PROWLARR_DEFS_DIR).filter((f) => f.endsWith('.yml'));
	console.log(`${colors.bright}Available Prowlarr Definitions: ${files.length}${colors.reset}\n`);

	// Categorize by public/private
	const publicIndexers: string[] = [];
	const privateIndexers: string[] = [];

	for (const file of files.slice(0, 50)) {
		// Quick sample
		const filePath = path.join(PROWLARR_DEFS_DIR, file);
		try {
			const content = fs.readFileSync(filePath, 'utf-8');
			const parsed = yaml.load(content) as Record<string, unknown>;
			const type = String(parsed?.type ?? 'unknown');
			const id = file.replace('.yml', '');

			if (type === 'public') {
				publicIndexers.push(id);
			} else {
				privateIndexers.push(id);
			}
		} catch {
			// Skip invalid files
		}
	}

	console.log(`${colors.green}Public indexers (sample):${colors.reset}`);
	console.log(publicIndexers.slice(0, 20).join(', '));
	console.log(`\n${colors.yellow}Private indexers (sample):${colors.reset}`);
	console.log(privateIndexers.slice(0, 20).join(', '));
	console.log(`\n... and ${files.length - 50} more`);
}

/**
 * Print a test result.
 */
function printResult(result: TestResult, verbose = false): void {
	const status = result.valid
		? `${colors.green}✓ PASS${colors.reset}`
		: `${colors.red}✗ FAIL${colors.reset}`;

	console.log(`\n${status} ${colors.bright}${result.name}${colors.reset} (${result.id})`);
	console.log(`   ${colors.dim}File: ${result.file}${colors.reset}`);

	if (result.errors.length > 0) {
		for (const error of result.errors) {
			console.log(`   ${colors.red}Error: ${error}${colors.reset}`);
		}
	}

	if (result.warnings.length > 0) {
		for (const warning of result.warnings) {
			console.log(`   ${colors.yellow}Warning: ${warning}${colors.reset}`);
		}
	}

	if (result.valid && result.features.length > 0) {
		console.log(`   ${colors.cyan}Features: ${result.features.join(', ')}${colors.reset}`);
	}

	if (verbose) {
		console.log(`   ${colors.dim}Details:${colors.reset}`);
		console.log(`     - ID: ${result.id}`);
		console.log(`     - Name: ${result.name}`);
		console.log(`     - File: ${result.file}`);
		console.log(`     - Valid: ${result.valid}`);
		console.log(`     - Errors: ${result.errors.length}`);
		console.log(`     - Warnings: ${result.warnings.length}`);
		console.log(`     - Features: ${result.features.length}`);
	}
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const doList = args.includes('--list');
	const doCopy = args.includes('--copy');
	const verbose = args.includes('--verbose') || args.includes('-v');
	const specificIndexer = args.find((a) => !a.startsWith('-'));

	if (doList) {
		listDefinitions();
		return;
	}

	console.log(`${colors.bright}Prowlarr Definition Compatibility Tester${colors.reset}`);
	console.log(`${colors.dim}Testing against Cinephage's Zod schema${colors.reset}\n`);

	if (!fs.existsSync(PROWLARR_DEFS_DIR)) {
		console.error(`${colors.red}Error: Prowlarr definitions not found at:${colors.reset}`);
		console.error(`  ${PROWLARR_DEFS_DIR}`);
		console.error(
			`\n${colors.yellow}Please ensure the Inspiration/Indexers folder exists.${colors.reset}`
		);
		process.exit(1);
	}

	// Determine which definitions to test
	const indexersToTest = specificIndexer ? [specificIndexer] : TARGET_INDEXERS;

	console.log(
		`${colors.cyan}Testing ${indexersToTest.length} definition(s): ${indexersToTest.join(', ')}${colors.reset}`
	);

	const results: TestResult[] = [];
	let passCount = 0;
	let failCount = 0;

	for (const indexerId of indexersToTest) {
		const filePath = path.join(PROWLARR_DEFS_DIR, `${indexerId}.yml`);

		if (!fs.existsSync(filePath)) {
			console.log(`\n${colors.red}✗ NOT FOUND${colors.reset} ${indexerId}`);
			console.log(`   ${colors.dim}Expected: ${filePath}${colors.reset}`);
			failCount++;
			continue;
		}

		const result = testDefinition(filePath);
		results.push(result);
		printResult(result, verbose);

		if (result.valid) {
			passCount++;
		} else {
			failCount++;
		}
	}

	// Summary
	console.log(`\n${colors.bright}─────────────────────────────────────${colors.reset}`);
	console.log(`${colors.bright}Summary${colors.reset}`);
	console.log(`  ${colors.green}Passed: ${passCount}${colors.reset}`);
	if (failCount > 0) {
		console.log(`  ${colors.red}Failed: ${failCount}${colors.reset}`);
	}

	// Copy if requested
	if (doCopy && passCount > 0) {
		console.log(
			`\n${colors.cyan}Copying validated definitions to ${CINEPHAGE_DEFS_DIR}...${colors.reset}`
		);

		let copyCount = 0;
		for (const result of results) {
			if (result.valid) {
				const sourcePath = path.join(PROWLARR_DEFS_DIR, result.file);
				if (copyDefinition(sourcePath, result.id)) {
					console.log(`  ${colors.green}✓${colors.reset} Copied ${result.id}.yaml`);
					copyCount++;
				}
			}
		}

		console.log(`\n${colors.green}Copied ${copyCount} definition(s)${colors.reset}`);
	} else if (doCopy && passCount === 0) {
		console.log(`\n${colors.yellow}No valid definitions to copy.${colors.reset}`);
	}

	// Suggest next steps
	if (passCount > 0 && !doCopy) {
		console.log(
			`\n${colors.dim}Run with --copy to copy validated definitions to data/indexers/definitions/${colors.reset}`
		);
	}

	process.exit(failCount > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error(`${colors.red}Fatal error: ${error}${colors.reset}`);
	process.exit(1);
});
