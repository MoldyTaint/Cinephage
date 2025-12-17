import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tokenRegistry } from '$lib/server/library/naming/tokens';

/**
 * Convert token metadata to the API response format
 */
function formatTokenForApi(token: {
	name: string;
	description: string;
	supportsFormatSpec?: boolean;
}) {
	const formatSpec = token.supportsFormatSpec ? ':00' : '';
	return {
		token: `{${token.name}${formatSpec}}`,
		description: token.description
	};
}

/**
 * Build tokens response from registry, organized for UI consumption
 */
function buildTokensResponse() {
	const metadata = tokenRegistry.getMetadataByCategory();

	// Map registry categories to UI categories, maintaining backwards compatibility
	const tokens = {
		movie: [
			...metadata.core.filter((t) => t.applicability.includes('movie')).map(formatTokenForApi),
			...metadata.mediaId
				.filter((t) => t.name === 'TmdbId' || t.name === 'ImdbId' || t.name === 'MediaId')
				.map(formatTokenForApi),
			...metadata.release.filter((t) => t.name === 'Edition').map(formatTokenForApi)
		],
		quality: metadata.quality.map(formatTokenForApi),
		video: metadata.video.map(formatTokenForApi),
		audio: metadata.audio.map(formatTokenForApi),
		release: metadata.release.filter((t) => t.name === 'ReleaseGroup').map(formatTokenForApi),
		series: [
			{ token: '{SeriesTitle}', description: 'Series title as-is' },
			{ token: '{SeriesCleanTitle}', description: 'Series title with special chars removed' },
			{ token: '{Year}', description: 'First air year' },
			...metadata.mediaId
				.filter((t) => t.name === 'TvdbId' || t.name === 'TmdbId' || t.name === 'SeriesId')
				.map(formatTokenForApi)
		],
		episode: metadata.episode.map(formatTokenForApi),
		conditional: [
			{
				token: '{[{Token}]}',
				description: 'Include only if Token has value (e.g., {[{HDR}]} for [HDR10])'
			},
			{
				token: '{prefix{Token}suffix}',
				description: 'Include prefix/suffix only if Token has value'
			},
			{
				token: '{edition-{Edition}}',
				description: 'Example: includes "edition-Directors Cut" only if Edition exists'
			}
		]
	};

	return tokens;
}

/**
 * Token categories for UI organization
 */
const TOKEN_CATEGORIES = [
	{ id: 'movie', name: 'Movie', description: 'Movie-specific tokens' },
	{ id: 'series', name: 'Series', description: 'Series-specific tokens' },
	{ id: 'episode', name: 'Episode', description: 'Episode-specific tokens' },
	{ id: 'quality', name: 'Quality', description: 'Quality and resolution tokens' },
	{ id: 'video', name: 'Video', description: 'Video format tokens' },
	{ id: 'audio', name: 'Audio', description: 'Audio format tokens' },
	{ id: 'release', name: 'Release', description: 'Release information tokens' },
	{ id: 'conditional', name: 'Conditional', description: 'Conditional formatting patterns' }
];

/**
 * GET /api/naming/tokens
 * Returns all available naming tokens organized by category
 */
export const GET: RequestHandler = async () => {
	return json({
		tokens: buildTokensResponse(),
		categories: TOKEN_CATEGORIES
	});
};
