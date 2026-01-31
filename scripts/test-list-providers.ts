/**
 * Test script for new list providers
 * Run with: npx tsx scripts/test-list-providers.ts
 */
import { ImdbListProvider } from '../src/lib/server/smartlists/providers/ImdbListProvider.js';
import { TmdbPopularProvider } from '../src/lib/server/smartlists/providers/TmdbPopularProvider.js';
import { TmdbListProvider } from '../src/lib/server/smartlists/providers/TmdbListProvider.js';
import { providerRegistry } from '../src/lib/server/smartlists/providers/ProviderRegistry.js';

async function testImdbProvider() {
	console.log('\n=== Testing IMDb List Provider ===');
	const provider = new ImdbListProvider();

	// Test config validation
	console.log('Valid config (ls060044601):', provider.validateConfig({ listId: 'ls060044601' }));
	console.log('Invalid config (abc123):', provider.validateConfig({ listId: 'abc123' }));

	// Test fetching (commented out to avoid hitting IMDb during testing)
	// const result = await provider.fetchItems({ listId: 'ls060044601' }, 'movie');
	// console.log('Fetched items:', result.items.length);
}

async function testTmdbPopularProvider() {
	console.log('\n=== Testing TMDb Popular Provider ===');
	const provider = new TmdbPopularProvider();

	// Test config validation
	console.log('Valid config (popular):', provider.validateConfig({ listType: 'popular' }));
	console.log('Valid config (top):', provider.validateConfig({ listType: 'top' }));
	console.log('Invalid config (invalid):', provider.validateConfig({ listType: 'invalid' }));

	// Test fetching (requires TMDB API key)
	// const result = await provider.fetchItems({ listType: 'popular', maxPages: 1 }, 'movie');
	// console.log('Fetched items:', result.items.length);
}

async function testTmdbListProvider() {
	console.log('\n=== Testing TMDb List Provider ===');
	const provider = new TmdbListProvider();

	// Test config validation
	console.log('Valid config (12345):', provider.validateConfig({ listId: '12345' }));
	console.log('Invalid config (abc):', provider.validateConfig({ listId: 'abc' }));

	// Test fetching (requires TMDB API key)
	// const result = await provider.fetchItems({ listId: '12345' }, 'movie');
	// console.log('Fetched items:', result.items.length);
}

async function testProviderRegistry() {
	console.log('\n=== Testing Provider Registry ===');
	const providers = providerRegistry.getAll();
	console.log(
		'Registered providers:',
		providers.map((p) => p.type)
	);

	console.log('Has imdb-list:', providerRegistry.has('imdb-list'));
	console.log('Has tmdb-popular:', providerRegistry.has('tmdb-popular'));
	console.log('Has tmdb-list:', providerRegistry.has('tmdb-list'));
	console.log('Has external-json:', providerRegistry.has('external-json'));
}

async function main() {
	try {
		await testImdbProvider();
		await testTmdbPopularProvider();
		await testTmdbListProvider();
		await testProviderRegistry();
		console.log('\n✅ All tests passed!');
	} catch (error) {
		console.error('\n❌ Test failed:', error);
		process.exit(1);
	}
}

main();
