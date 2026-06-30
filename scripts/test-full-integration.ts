/**
 * Full Integration Test Script
 *
 * Tests the complete streaming flow from TMDB metadata to stream extraction.
 * Run with: npx tsx scripts/test-full-integration.ts
 */

// Test cases
const TEST_CASES = [
	// Anime - should use AniList + AnimeKai
	{
		name: 'Attack on Titan S1E1',
		tmdbId: 1429,
		type: 'tv' as const,
		season: 1,
		episode: 1,
		expectedTitle: 'Attack on Titan',
		isAnime: true
	},
	{
		name: 'Cyberpunk: Edgerunners S1E1',
		tmdbId: 105248,
		type: 'tv' as const,
		season: 1,
		episode: 1,
		expectedTitle: 'Cyberpunk: Edgerunners',
		isAnime: true
	},
	// Regular TV - should use standard providers
	{
		name: 'Breaking Bad S1E1',
		tmdbId: 1396,
		type: 'tv' as const,
		season: 1,
		episode: 1,
		expectedTitle: 'Breaking Bad',
		isAnime: false
	},
	// Movie
	{
		name: 'The Shawshank Redemption',
		tmdbId: 278,
		type: 'movie' as const,
		expectedTitle: 'The Shawshank Redemption',
		isAnime: false
	}
];

async function testTmdbMetadata() {
	console.log('\n' + '='.repeat(70));
	console.log('Step 1: Testing TMDB Metadata Fetching');
	console.log('='.repeat(70));

	const { tmdb } = await import('../src/lib/server/tmdb');

	for (const test of TEST_CASES) {
		console.log(`\n ${test.name} (TMDB: ${test.tmdbId})`);

		try {
			if (test.type === 'tv') {
				const show = await tmdb.getTVShow(test.tmdbId);
				const externalIds = await tmdb.getTvExternalIds(test.tmdbId);

				console.log(`   Title: ${show.name}`);
				console.log(`   Original: ${show.original_name}`);
				console.log(`   Year: ${show.first_air_date?.substring(0, 4) || 'N/A'}`);
				console.log(`   IMDB: ${externalIds.imdb_id || 'N/A'}`);

				if (show.name !== test.expectedTitle) {
					console.log(`   ⚠ Title mismatch! Expected: ${test.expectedTitle}`);
				} else {
					console.log(`   ✓ Title matches`);
				}
			} else {
				const movie = await tmdb.getMovie(test.tmdbId);
				const externalIds = await tmdb.getMovieExternalIds(test.tmdbId);

				console.log(`   Title: ${movie.title}`);
				console.log(`   Year: ${movie.release_date?.substring(0, 4) || 'N/A'}`);
				console.log(`   IMDB: ${externalIds.imdb_id || 'N/A'}`);

				if (movie.title !== test.expectedTitle) {
					console.log(`   ⚠ Title mismatch! Expected: ${test.expectedTitle}`);
				} else {
					console.log(`   ✓ Title matches`);
				}
			}
		} catch (error) {
			console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
		}
	}
}

async function testAniListResolution() {
	console.log('\n' + '='.repeat(70));
	console.log('Step 2: Testing AniList Resolution (Anime Only)');
	console.log('='.repeat(70));

	const { anilistResolver } = await import('../src/lib/server/streaming/anilist');
	const { tmdb } = await import('../src/lib/server/tmdb');

	const animeTests = TEST_CASES.filter((t) => t.isAnime);

	for (const test of animeTests) {
		console.log(`\n ${test.name}`);

		try {
			// Get title from TMDB first (like the resolve endpoint does)
			const show = await tmdb.getTVShow(test.tmdbId);
			const title = show.name;
			const year = show.first_air_date
				? parseInt(show.first_air_date.substring(0, 4), 10)
				: undefined;

			console.log(`   TMDB Title: "${title}" (${year})`);

			// Resolve via AniList
			const result = await anilistResolver.resolve(title, year);

			if (result.success) {
				console.log(`   ✓ AniList resolved:`);
				console.log(`     Matched: "${result.matchedTitle}"`);
				console.log(`     AniList ID: ${result.anilistId}`);
				console.log(`     MAL ID: ${result.malId}`);
				console.log(`     Confidence: ${(result.confidence * 100).toFixed(1)}%`);
				console.log(`     Cached: ${result.cached}`);
			} else {
				console.log(`   ✗ AniList resolution failed: ${result.error}`);
			}
		} catch (error) {
			console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
		}
	}
}

async function testProviderExtraction() {
	console.log('\n' + '='.repeat(70));
	console.log('Step 3: Testing Provider Extraction');
	console.log('='.repeat(70));

	const { extractStreams } = await import('../src/lib/server/streaming/providers');
	const { getEnabledProviders } = await import('../src/lib/server/streaming/settings');
	const { tmdb } = await import('../src/lib/server/tmdb');

	// Show enabled providers
	const enabled = await getEnabledProviders();
	console.log(`\nEnabled providers: ${enabled.join(', ')}`);

	// Test one anime and one regular show
	const testCases = [
		TEST_CASES.find((t) => t.isAnime && t.type === 'tv')!, // Anime
		TEST_CASES.find((t) => !t.isAnime && t.type === 'tv')!, // Regular TV
		TEST_CASES.find((t) => t.type === 'movie')! // Movie
	];

	for (const test of testCases) {
		console.log(`\n ${test.name}`);

		try {
			// Fetch TMDB metadata (like resolve endpoint)
			let title: string | undefined;
			let year: number | undefined;
			let imdbId: string | undefined;
			let alternativeTitles: string[] | undefined;

			if (test.type === 'tv') {
				const show = await tmdb.getTVShow(test.tmdbId);
				const externalIds = await tmdb.getTvExternalIds(test.tmdbId);
				title = show.name;
				year = show.first_air_date ? parseInt(show.first_air_date.substring(0, 4), 10) : undefined;
				imdbId = externalIds.imdb_id || undefined;
				if (show.original_name && show.original_name !== show.name) {
					alternativeTitles = [show.original_name];
				}
			} else {
				const movie = await tmdb.getMovie(test.tmdbId);
				const externalIds = await tmdb.getMovieExternalIds(test.tmdbId);
				title = movie.title;
				year = movie.release_date ? parseInt(movie.release_date.substring(0, 4), 10) : undefined;
				imdbId = externalIds.imdb_id || undefined;
			}

			console.log(`   Metadata: "${title}" (${year}), IMDB: ${imdbId || 'N/A'}`);

			// Extract streams
			const startTime = Date.now();
			const result = await extractStreams({
				tmdbId: String(test.tmdbId),
				type: test.type,
				season: test.type === 'tv' ? test.season : undefined,
				episode: test.type === 'tv' ? test.episode : undefined,
				imdbId,
				title,
				year,
				alternativeTitles
			});
			const duration = Date.now() - startTime;

			if (result.success && result.sources.length > 0) {
				console.log(`   ✓ Extraction successful (${duration}ms)`);
				console.log(`     Provider: ${result.provider}`);
				console.log(`     Sources: ${result.sources.length}`);
				result.sources.slice(0, 3).forEach((s, i) => {
					console.log(`     ${i + 1}. ${s.quality} - ${s.title || 'Unknown'}`);
					console.log(`        URL: ${s.url.substring(0, 80)}...`);
				});
			} else {
				console.log(`   ✗ Extraction failed (${duration}ms): ${result.error || 'No sources'}`);
				if (result.failedProviders && result.failedProviders.length > 0) {
					console.log(`     Failed providers: ${result.failedProviders.join(', ')}`);
				}
			}
		} catch (error) {
			console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
		}
	}
}

async function testAnimeKaiSpecific() {
	console.log('\n' + '='.repeat(70));
	console.log('Step 4: Testing AnimeKai Provider Specifically');
	console.log('='.repeat(70));

	const { getProviderById } = await import('../src/lib/server/streaming/providers');
	const { tmdb } = await import('../src/lib/server/tmdb');
	const { anilistResolver } = await import('../src/lib/server/streaming/anilist');

	const animeKai = getProviderById('animekai');
	if (!animeKai) {
		console.log('\n⚠ AnimeKai provider not registered');
		return;
	}

	console.log(`\nProvider: ${animeKai.config.name}`);
	console.log(`Enabled by default: ${animeKai.config.enabledByDefault}`);
	console.log(`Supports anime: ${animeKai.config.supportsAnime}`);

	// Test with Attack on Titan
	const test = TEST_CASES.find((t) => t.name === 'Attack on Titan S1E1')!;
	console.log(`\n Testing: ${test.name}`);

	try {
		// Get TMDB metadata
		const show = await tmdb.getTVShow(test.tmdbId);
		const externalIds = await tmdb.getTvExternalIds(test.tmdbId);
		const title = show.name;
		const year = show.first_air_date
			? parseInt(show.first_air_date.substring(0, 4), 10)
			: undefined;

		console.log(`   TMDB: "${title}" (${year})`);

		// AniList resolution
		const anilistResult = await anilistResolver.resolve(title, year);
		if (anilistResult.success) {
			console.log(
				`   AniList: MAL ID ${anilistResult.malId}, AniList ID ${anilistResult.anilistId}`
			);
		}

		// Direct provider extraction
		console.log(`   Extracting from AnimeKai...`);
		const startTime = Date.now();
		const result = await animeKai.extract({
			tmdbId: String(test.tmdbId),
			type: 'tv',
			season: test.season,
			episode: test.episode,
			imdbId: externalIds.imdb_id || undefined,
			title,
			year,
			malId: anilistResult.malId ?? undefined,
			anilistId: anilistResult.anilistId ?? undefined
		});
		const duration = Date.now() - startTime;

		if (result.success && result.streams.length > 0) {
			console.log(`   ✓ AnimeKai extraction successful (${duration}ms)`);
			console.log(`     Streams: ${result.streams.length}`);
			result.streams.forEach((s, i) => {
				console.log(`     ${i + 1}. ${s.quality} - ${s.language || 'Unknown'}`);
			});
		} else {
			console.log(
				`   ✗ AnimeKai extraction failed (${duration}ms): ${result.error || 'No streams'}`
			);
		}
	} catch (error) {
		console.log(`   ✗ Error: ${error instanceof Error ? error.message : error}`);
	}
}

async function main() {
	console.log('╔══════════════════════════════════════════════════════════════════════╗');
	console.log('║          CINEPHAGE STREAMING INTEGRATION TEST                        ║');
	console.log('╚══════════════════════════════════════════════════════════════════════╝');

	try {
		await testTmdbMetadata();
		await testAniListResolution();
		await testProviderExtraction();
		await testAnimeKaiSpecific();

		console.log('\n' + '='.repeat(70));
		console.log('Integration test complete!');
		console.log('='.repeat(70));
	} catch (error) {
		console.error('\n Test failed with error:', error);
		process.exit(1);
	}
}

main();
