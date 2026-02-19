/**
 * SceneTime YamlIndexer Integration Test
 *
 * Tests SceneTime through the actual indexer system:
 * - Loads YAML definition
 * - Creates YamlIndexer instance
 * - Tests authentication
 * - Performs various searches
 * - Verifies results match expected format
 *
 * Usage: npx tsx scripts/test-scenetime-indexer.ts
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { createYamlIndexer } from '../src/lib/server/indexers/runtime/YamlIndexer';
import type { YamlDefinition } from '../src/lib/server/indexers/schema/yamlDefinition';
import type { IndexerConfig } from '../src/lib/server/indexers/types';

const DEFINITION_PATH = 'data/indexers/definitions/scenetime.yaml';

async function main() {
	console.log('╔══════════════════════════════════════════════════════════════╗');
	console.log('║        SceneTime YamlIndexer Integration Test                 ║');
	console.log('╚══════════════════════════════════════════════════════════════╝\n');

	// Check credentials - support both combined cookie and separate uid/pass
	const cookie = process.env.SCENETIME_COOKIE;
	const uid = process.env.SCENETIME_UID;
	const pass = process.env.SCENETIME_PASS;

	// Parse uid and pass from combined cookie if not provided separately
	let uidValue: string | undefined = uid;
	let passValue: string | undefined = pass;

	if (cookie && !uid && !pass) {
		// Parse uid and pass from combined cookie string
		const cookiePairs = cookie.split(';').map((p) => p.trim());
		for (const pair of cookiePairs) {
			const [key, val] = pair.split('=').map((s) => s.trim());
			if (key === 'uid') uidValue = val;
			if (key === 'pass') passValue = val;
		}
	}

	if (!uidValue || !passValue) {
		console.log('❌ SceneTime credentials not set. Use either:');
		console.log('   SCENETIME_UID and SCENETIME_PASS separately, or');
		console.log('   SCENETIME_COOKIE="uid=XXX; pass=YYY"');
		process.exit(1);
	}

	// Step 1: Load YAML definition
	console.log('Step 1: Loading YAML definition...');
	let definition: YamlDefinition;
	try {
		const yamlContent = readFileSync(DEFINITION_PATH, 'utf-8');
		definition = parseYaml(yamlContent) as YamlDefinition;
		console.log(`  ✓ Loaded ${definition.name} (${definition.id})`);
		console.log(`    Type: ${definition.type}`);
		console.log(`    URL: ${definition.links[0]}`);
	} catch (error) {
		console.log(`  ✗ Failed to load: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}

	// Step 2: Create indexer config
	console.log('\nStep 2: Creating indexer config...');
	const config: IndexerConfig = {
		id: 'scenetime-test',
		name: 'SceneTime Test',
		definitionId: 'scenetime',
		enabled: true,
		enableAutomaticSearch: true,
		enableInteractiveSearch: true,
		priority: 25,
		baseUrl: definition.links[0],
		settings: {
			uid: uidValue,
			pass: passValue,
			freeleech: false,
			sort: 'added'
		}
	};
	console.log('  ✓ Config created');
	console.log(`    UID: ${uidValue?.substring(0, 4)}...`);
	console.log(`    Pass: ${passValue?.substring(0, 8)}...`);

	// Step 3: Create YamlIndexer
	console.log('\nStep 3: Creating YamlIndexer...');
	let indexer: ReturnType<typeof createYamlIndexer>;
	try {
		indexer = createYamlIndexer({
			config,
			definition,
			rateLimit: { requests: 10, periodMs: 60000 }
		});
		console.log('  ✓ YamlIndexer created');
		console.log(`    Protocol: ${indexer.protocol}`);
		console.log(`    Access: ${indexer.accessType}`);
	} catch (error) {
		console.log(`  ✗ Failed: ${error instanceof Error ? error.message : error}`);
		process.exit(1);
	}

	// Step 4: Test basic search
	console.log('\n' + '═'.repeat(60));
	console.log('TEST: Basic Search - "Gladiator"');
	console.log('═'.repeat(60));

	try {
		const results = await indexer.search({
			searchType: 'movie',
			query: 'Gladiator',
			limit: 10
		});

		console.log(`  ✓ Search completed: ${results.length} results`);

		if (results.length > 0) {
			console.log('\n  Sample results:');
			for (const r of results.slice(0, 3)) {
				console.log(`\n    Title: ${r.title}`);
				console.log(`    Size: ${formatBytes(r.size)}`);
				console.log(`    Seeders: ${r.seeders ?? 'N/A'} | Leechers: ${r.leechers ?? 'N/A'}`);
				console.log(`    Category: ${r.categories?.join(', ') || 'N/A'}`);
				console.log(`    Download: ${r.downloadUrl ? 'Present' : 'MISSING'}`);
				if (r.imdbId) console.log(`    IMDB: ${r.imdbId}`);
			}
		}
	} catch (error) {
		console.log(`  ✗ Search failed: ${error instanceof Error ? error.message : error}`);
	}

	// Step 5: Test TV search
	console.log('\n' + '═'.repeat(60));
	console.log('TEST: TV Search - "Penguin"');
	console.log('═'.repeat(60));

	try {
		const results = await indexer.search({
			searchType: 'tv',
			query: 'Penguin',
			limit: 10
		});

		console.log(`  ✓ Search completed: ${results.length} results`);

		if (results.length > 0) {
			console.log('\n  Sample results:');
			for (const r of results.slice(0, 3)) {
				console.log(`\n    Title: ${r.title}`);
				console.log(`    Size: ${formatBytes(r.size)}`);
				console.log(`    Seeders: ${r.seeders ?? 'N/A'}`);
			}
		}
	} catch (error) {
		console.log(`  ✗ Search failed: ${error instanceof Error ? error.message : error}`);
	}

	// Step 6: Test IMDB search
	console.log('\n' + '═'.repeat(60));
	console.log('TEST: IMDB Search - tt9218128 (Gladiator II)');
	console.log('═'.repeat(60));

	try {
		const results = await indexer.search({
			searchType: 'movie',
			imdbId: 'tt9218128',
			limit: 10
		});

		console.log(`  ✓ Search completed: ${results.length} results`);

		if (results.length > 0) {
			console.log('\n  Sample results:');
			for (const r of results.slice(0, 3)) {
				console.log(`\n    Title: ${r.title}`);
				console.log(`    Size: ${formatBytes(r.size)}`);
				console.log(`    Seeders: ${r.seeders ?? 'N/A'}`);
			}
		} else {
			console.log('  ⚠ No results - IMDB search may not be working through YamlIndexer');
		}
	} catch (error) {
		console.log(`  ✗ Search failed: ${error instanceof Error ? error.message : error}`);
	}

	// Step 7: Test download URL
	console.log('\n' + '═'.repeat(60));
	console.log('TEST: Download URL Resolution');
	console.log('═'.repeat(60));

	try {
		const results = await indexer.search({
			searchType: 'movie',
			query: 'test',
			limit: 1
		});

		if (results.length > 0) {
			const release = results[0];
			console.log(`  Testing release: ${release.title.substring(0, 50)}...`);

			if (release.downloadUrl) {
				console.log(`  ✓ Download URL present: ${release.downloadUrl.substring(0, 60)}...`);

				// Try to download through the indexer
				try {
					if (indexer.downloadTorrent) {
						const result = await indexer.downloadTorrent(release.downloadUrl, {
							releaseDetailsUrl: release.commentsUrl
						});
						if (result.success) {
							console.log(
								`  ✓ Download resolved: magnet=${!!result.magnetUrl}, data=${!!result.data}, infoHash=${result.infoHash?.substring(0, 16)}...`
							);
						} else {
							console.log(`  ⚠ Download failed: ${result.error}`);
						}
					} else {
						console.log(`  ⚠ Indexer does not support downloadTorrent`);
					}
				} catch (err) {
					console.log(`  ⚠ Download error: ${err instanceof Error ? err.message : err}`);
				}
			} else {
				console.log('  ✗ No download URL in release');
			}
		}
	} catch (error) {
		console.log(`  ✗ Test failed: ${error instanceof Error ? error.message : error}`);
	}

	// Summary
	console.log('\n' + '═'.repeat(60));
	console.log('SUMMARY');
	console.log('═'.repeat(60));
	console.log('\nSceneTime YamlIndexer integration test complete.');
	console.log('Check results above for any issues.');

	console.log('\nDone.');
}

function formatBytes(bytes: number): string {
	if (!bytes || bytes === 0) return 'N/A';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	while (bytes >= 1024 && i < units.length - 1) {
		bytes /= 1024;
		i++;
	}
	return `${bytes.toFixed(2)} ${units[i]}`;
}

main().catch((error) => {
	console.error('\nFatal error:', error);
	process.exit(1);
});
