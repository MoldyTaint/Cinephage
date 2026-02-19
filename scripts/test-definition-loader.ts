#!/usr/bin/env npx tsx
/**
 * Quick test to verify YamlDefinitionLoader loads all definitions
 */

import { YamlDefinitionLoader } from '../src/lib/server/indexers/loader/YamlDefinitionLoader.js';

async function main() {
	const loader = new YamlDefinitionLoader();
	const results = await loader.loadAll(['data/indexers/definitions']);

	console.log('\n=== Loaded Definitions ===');
	for (const r of results) {
		const protocol = r.definition.protocol ?? 'torrent';
		const delay = r.definition.requestdelay ? ` (delay: ${r.definition.requestdelay}s)` : '';
		console.log(
			`✓ ${r.definition.name} (${r.definition.id}) - ${r.definition.type} ${protocol}${delay}`
		);
	}

	const errors = loader.getErrors();
	if (errors.length > 0) {
		console.log('\n=== Load Errors ===');
		for (const e of errors) {
			console.log(`✗ ${e.filePath}: ${e.error}`);
		}
	}

	console.log(`\n=== Summary ===`);
	console.log(`Total loaded: ${results.length}`);
	console.log(`Total errors: ${errors.length}`);

	// Check specific new indexers
	const newIndexers = ['thepiratebay', 'nyaasi', 'torrentdownloads', 'eztv'];
	console.log('\n=== Native Cinephage Indexers ===');
	for (const id of newIndexers) {
		const def = loader.get(id);
		if (def) {
			console.log(`✓ ${id}: ${def.name} loaded successfully`);
		} else {
			console.log(`✗ ${id}: NOT FOUND`);
		}
	}

	process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error('Fatal error:', e);
	process.exit(1);
});
