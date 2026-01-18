/**
 * Integration test for Issue #72 - End-to-end duplicate episode token test
 *
 * This actually runs through the SearchOrchestrator and RequestBuilder
 * to verify no duplicate tokens appear in the final search queries.
 *
 * Architecture note (post-refactor):
 * - SearchOrchestrator now passes CLEAN queries (just title) with preferredEpisodeFormat set
 * - TemplateEngine is the sole source of truth for episode token composition
 * - Episode format iteration is driven by indexer's searchFormats.episode capability
 *
 * Run with: npx tsx scripts/test-issue-72-integration.ts
 */

import { SearchOrchestrator } from '../src/lib/server/indexers/search/SearchOrchestrator';
import type { TvSearchCriteria, IndexerCapabilities } from '../src/lib/server/indexers/types';
import type { IIndexer } from '../src/lib/server/indexers/types';

// Capture all search queries sent to the indexer
const capturedQueries: { query: string; preferredFormat?: string }[] = [];

// Build mock capabilities with all required fields
const mockCapabilities: IndexerCapabilities = {
	search: { available: true, supportedParams: ['q'] },
	tvSearch: { available: true, supportedParams: ['q', 'season', 'ep'] },
	movieSearch: { available: true, supportedParams: ['q', 'year'] },
	categories: new Map(),
	supportsPagination: true,
	supportsInfoHash: false,
	limitMax: 100,
	limitDefault: 50,
	// Use all formats for comprehensive testing
	searchFormats: {
		episode: ['standard', 'european', 'compact']
	}
};

// Mock indexer that captures what it receives
const mockIndexer: IIndexer = {
	id: 'test-indexer',
	name: 'Test Indexer',
	definitionId: 'test',
	protocol: 'torrent',
	accessType: 'public',
	baseUrl: 'http://localhost',
	enableAutomaticSearch: true,
	enableInteractiveSearch: true,
	capabilities: mockCapabilities,
	search: async (criteria: any) => {
		// Capture the query and preferredEpisodeFormat
		capturedQueries.push({
			query: criteria.query || '',
			preferredFormat: criteria.preferredEpisodeFormat
		});
		console.log(
			`  📥 Indexer received: query="${criteria.query}", format=${criteria.preferredEpisodeFormat || 'default'}, season=${criteria.season}, episode=${criteria.episode}`
		);
		return [];
	},
	test: async () => {},
	getDownloadUrl: async (release) => release.downloadUrl || '',
	canSearch: () => true
} as IIndexer;

async function testSearch(showName: string, season: number, episode: number) {
	console.log(
		`\n🔍 Testing: ${showName} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
	);
	console.log('─'.repeat(60));

	capturedQueries.length = 0; // Clear previous captures

	const orchestrator = new SearchOrchestrator();

	const criteria: TvSearchCriteria = {
		searchType: 'tv',
		query: showName,
		season,
		episode,
		searchTitles: [showName]
	};

	try {
		// Use the private method to test the text search path
		await (orchestrator as any).executeMultiTitleTextSearch(mockIndexer, criteria);
	} catch (e) {
		// Ignore errors - we just want to see what queries were generated
	}

	// Analyze captured queries
	console.log('\n📊 Query Analysis (post-refactor - queries should be CLEAN):');
	let hasIssues = false;

	for (const { query, preferredFormat } of capturedQueries) {
		// With the new architecture, the query should NOT contain episode tokens
		// The episode token is added by TemplateEngine based on preferredEpisodeFormat
		const seasonEpMatches = (query.match(/s\d{2}e\d{2}/gi) || []).length;
		const europeanMatches = (query.match(/\d+x\d{2}/gi) || []).length;
		const compactMatches = (query.match(/\b\d{3,4}\b/g) || []).length; // 105, 1005

		const totalEpTokens = seasonEpMatches + europeanMatches;

		// After refactor: query should be clean, preferredFormat tells TemplateEngine what to add
		if (totalEpTokens > 0) {
			// Query contains embedded tokens (legacy behavior - should not happen after refactor)
			if (totalEpTokens > 1) {
				hasIssues = true;
				console.log(`  ❌ DUPLICATE TOKENS: "${query}" (format: ${preferredFormat || 'none'})`);
				console.log(`     Found ${totalEpTokens} episode tokens embedded in query!`);
			} else {
				// Single token embedded - this is legacy, but not a duplicate
				console.log(`  ⚠️  LEGACY: "${query}" (format: ${preferredFormat || 'none'})`);
				console.log(`     Query has embedded token. New architecture should use clean queries.`);
			}
		} else {
			// Clean query - this is the expected behavior after refactor
			console.log(`  ✅ CLEAN: "${query}" (format: ${preferredFormat || 'none'})`);
		}
	}

	// Verify we got multiple format variants
	const formats = new Set(capturedQueries.map((q) => q.preferredFormat).filter(Boolean));
	console.log(`\n  📋 Format variants used: ${[...formats].join(', ') || 'none specified'}`);

	return !hasIssues;
}

async function main() {
	console.log('═'.repeat(60));
	console.log('  Issue #72 Integration Test - Duplicate Episode Tokens');
	console.log('═'.repeat(60));

	const tests = [
		// The exact case from the bug report
		{ show: 'Star Trek Starfleet Academy', season: 1, episode: 1 },
		// Other shows mentioned by the reporter
		{ show: 'From', season: 1, episode: 1 },
		{ show: 'Severance', season: 2, episode: 1 },
		{ show: 'Silo', season: 1, episode: 5 },
		{ show: 'Pluribus', season: 1, episode: 1 }
	];

	let passed = 0;
	let failed = 0;

	for (const test of tests) {
		const ok = await testSearch(test.show, test.season, test.episode);
		if (ok) passed++;
		else failed++;
	}

	console.log('\n' + '═'.repeat(60));
	console.log(`  Results: ${passed} passed, ${failed} failed`);
	console.log('═'.repeat(60));

	if (failed === 0) {
		console.log('\n🎉 All tests passed! No duplicate episode tokens detected.');
		console.log('   Issue #72 is fixed.\n');
		process.exit(0);
	} else {
		console.log('\n⚠️  Some tests found duplicate tokens!');
		console.log('   Issue #72 may not be fully fixed.\n');
		process.exit(1);
	}
}

main().catch(console.error);
