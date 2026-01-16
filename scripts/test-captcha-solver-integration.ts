/**
 * Test the integrated CaptchaSolver service with Camoufox
 *
 * Usage:
 *   npx tsx scripts/test-captcha-solver-integration.ts
 */

import { getCaptchaSolver } from '../src/lib/server/captcha';
import { captchaSolverSettingsService } from '../src/lib/server/captcha/CaptchaSolverSettings';
import { initializeDatabase } from '../src/lib/server/db';

async function main() {
	console.log('='.repeat(70));
	console.log('      CaptchaSolver Integration Test (Camoufox)');
	console.log('='.repeat(70));

	try {
		// Initialize database first (required for settings)
		console.log('\n[SETUP] Initializing database...');
		await initializeDatabase();

		// Ensure headless mode for server environment
		console.log('\n[SETUP] Configuring for headless mode...');
		captchaSolverSettingsService.updateConfig({
			headless: true
		});

		// Get the solver instance
		const solver = getCaptchaSolver();

		// Check initial config
		const config = captchaSolverSettingsService.getConfig();
		console.log('\n[CONFIG] Current settings:');
		console.log(`  Enabled: ${config.enabled}`);
		console.log(`  Headless: ${config.headless}`);
		console.log(`  Timeout: ${config.timeoutSeconds}s`);

		// Start the service
		console.log('\n[INIT] Starting CaptchaSolver service...');
		solver.start();

		// Wait for initialization
		let attempts = 0;
		while (solver.status !== 'ready' && solver.status !== 'error' && attempts < 30) {
			await new Promise((r) => setTimeout(r, 1000));
			attempts++;
		}

		if (solver.status === 'error') {
			throw new Error(`Service failed to start: ${solver.getHealth().error}`);
		}

		console.log(`  Status: ${solver.status}`);
		console.log(`  Available: ${solver.isAvailable()}`);

		// Test challenge detection
		console.log('\n[TEST 1] Testing challenge detection on 1337x.to...');
		const testResult = await solver.test('https://1337x.to');
		console.log(`  Has challenge: ${testResult.hasChallenge}`);
		console.log(`  Type: ${testResult.type}`);
		console.log(`  Confidence: ${testResult.confidence}`);

		// Solve the challenge
		console.log('\n[TEST 2] Solving challenge on 1337x.to...');
		const solveResult = await solver.solve({ url: 'https://1337x.to' });

		console.log(`  Success: ${solveResult.success}`);
		console.log(`  Time: ${solveResult.solveTimeMs}ms`);
		console.log(`  Challenge type: ${solveResult.challengeType}`);
		console.log(`  Cookies: ${solveResult.cookies.length}`);

		if (solveResult.success) {
			// Check for cf_clearance
			const clearance = solveResult.cookies.find((c) => c.name === 'cf_clearance');
			if (clearance) {
				console.log(`  cf_clearance: ${clearance.value.substring(0, 30)}...`);
			}
			console.log(`  User-Agent: ${solveResult.userAgent.substring(0, 60)}...`);
		} else {
			console.log(`  Error: ${solveResult.error}`);
		}

		// Check stats
		const stats = solver.getStats();
		console.log('\n[STATS]');
		console.log(`  Total attempts: ${stats.totalAttempts}`);
		console.log(`  Success: ${stats.successCount}`);
		console.log(`  Failures: ${stats.failureCount}`);
		console.log(`  Avg solve time: ${stats.avgSolveTimeMs}ms`);

		// Test cache
		console.log('\n[TEST 3] Testing cache...');
		const cachedResult = await solver.solve({ url: 'https://1337x.to' });
		console.log(`  Cache hit: ${cachedResult.solveTimeMs === 0}`);
		console.log(`  Time: ${cachedResult.solveTimeMs}ms`);

		// Summary
		console.log('\n' + '='.repeat(70));
		console.log('RESULTS');
		console.log('='.repeat(70));

		if (solveResult.success) {
			console.log('\n  [PASS] CaptchaSolver integration test passed!');
			console.log('  Camoufox is working correctly within the service.');
		} else {
			console.log('\n  [FAIL] CaptchaSolver integration test failed!');
			console.log(`  Error: ${solveResult.error}`);
		}

		// Stop the service
		console.log('\n[CLEANUP] Stopping service...');
		await solver.stop();
		console.log('Done.');
	} catch (error) {
		console.error('\n[ERROR]', error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

main().catch(console.error);
