/**
 * Test script for Cloudflare bypass using the captcha solver.
 *
 * Usage: npx tsx scripts/test-cloudflare-bypass.ts [url]
 *
 * Default URL: https://1337x.to
 */

import 'dotenv/config';
import { getCaptchaSolver } from '../src/lib/server/captcha';
import { createIndexerHttp } from '../src/lib/server/indexers/http/IndexerHttp';

const TEST_URL = process.argv[2] || 'https://1337x.to';

async function main() {
	console.log('='.repeat(60));
	console.log('Cloudflare Bypass Test');
	console.log('='.repeat(60));
	console.log(`Target URL: ${TEST_URL}`);
	console.log('');

	// Initialize the captcha solver
	console.log('[1/4] Initializing captcha solver...');
	const solver = getCaptchaSolver();
	solver.start();

	// Wait for solver to be ready
	const startTime = Date.now();
	while (solver.status !== 'ready' && solver.status !== 'error') {
		if (Date.now() - startTime > 30000) {
			console.error('Timeout waiting for captcha solver to initialize');
			process.exit(1);
		}
		await new Promise((r) => setTimeout(r, 100));
	}

	if (solver.status === 'error') {
		console.error('Captcha solver failed to initialize');
		const health = solver.getHealth();
		console.error('Health:', JSON.stringify(health, null, 2));
		process.exit(1);
	}

	console.log(`    Status: ${solver.status}`);
	console.log(`    Available: ${solver.isAvailable()}`);
	console.log('');

	// Check health
	const health = solver.getHealth();
	console.log('[2/4] Captcha solver health:');
	console.log(`    Browser available: ${health.browserAvailable}`);
	console.log(`    Status: ${health.status}`);
	if (health.error) {
		console.log(`    Error: ${health.error}`);
	}
	console.log('');

	// Test for challenge first
	console.log('[3/4] Testing for Cloudflare challenge...');
	try {
		const testResult = await solver.test(TEST_URL);
		console.log(`    Has challenge: ${testResult.hasChallenge}`);
		console.log(`    Type: ${testResult.type}`);
		console.log(`    Confidence: ${(testResult.confidence * 100).toFixed(1)}%`);
		console.log('');

		if (!testResult.hasChallenge) {
			console.log('No Cloudflare challenge detected. Attempting direct fetch...');
		}
	} catch (error) {
		console.error('    Error testing for challenge:', error);
	}

	// Now try using IndexerHttp which has the full integration
	console.log('[4/4] Fetching page via IndexerHttp (with automatic CF bypass)...');
	const http = createIndexerHttp({
		indexerId: 'test-1337x',
		indexerName: 'Test 1337x',
		baseUrl: TEST_URL,
		userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		defaultTimeout: 120000 // 2 minutes for CF solving
	});

	try {
		const fetchStart = Date.now();
		const response = await http.get(TEST_URL);
		const fetchTime = Date.now() - fetchStart;

		console.log('');
		console.log('SUCCESS!');
		console.log('-'.repeat(40));
		console.log(`    Status: ${response.status}`);
		console.log(`    Final URL: ${response.url}`);
		console.log(`    Body length: ${response.body.length} bytes`);
		console.log(`    Time taken: ${fetchTime}ms`);
		console.log('');

		// Extract title from response
		const titleMatch = response.body.match(/<title>([^<]+)<\/title>/i);
		if (titleMatch) {
			console.log(`    Page title: ${titleMatch[1]}`);
		}

		// Check if this looks like a successful page
		if (
			response.body.includes('torrent') ||
			response.body.includes('search') ||
			response.body.includes('1337x')
		) {
			console.log('    Content looks valid (contains expected keywords)');
		} else if (response.body.includes('Just a moment')) {
			console.log('    WARNING: Still seeing Cloudflare challenge page!');
		}

		// Show first few links if found
		const linkMatches = response.body.match(/href="\/torrent\/[^"]+"/g);
		if (linkMatches && linkMatches.length > 0) {
			console.log('');
			console.log('    Sample torrent links found:');
			linkMatches.slice(0, 3).forEach((link) => {
				console.log(`      ${link}`);
			});
		}
	} catch (error) {
		console.error('');
		console.error('FAILED!');
		console.error('-'.repeat(40));
		console.error(`    Error: ${error}`);
		if (error instanceof Error) {
			console.error(`    Stack: ${error.stack}`);
		}
	}

	// Show final stats
	console.log('');
	console.log('Solver stats:');
	const stats = solver.getStats();
	console.log(`    Total attempts: ${stats.totalAttempts}`);
	console.log(`    Successes: ${stats.successCount}`);
	console.log(`    Failures: ${stats.failureCount}`);
	console.log(`    Cache hits: ${stats.cacheHits}`);
	console.log(`    Avg solve time: ${stats.avgSolveTimeMs}ms`);

	// Cleanup
	console.log('');
	console.log('Shutting down...');
	await solver.stop();
	console.log('Done.');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
