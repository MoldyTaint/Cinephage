import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Available tokens for naming formats
 */
const NAMING_TOKENS = {
	movie: [
		{ token: '{Title}', description: 'Movie title as-is' },
		{ token: '{CleanTitle}', description: 'Title with special characters removed' },
		{ token: '{Year}', description: 'Release year' },
		{ token: '{TmdbId}', description: 'TMDB ID number' },
		{ token: '{ImdbId}', description: 'IMDB ID (e.g., tt1234567)' },
		{ token: '{MediaId}', description: 'Media server ID (format based on setting)' },
		{ token: '{Edition}', description: 'Edition (Directors Cut, Extended, etc.)' }
	],
	quality: [
		{ token: '{Quality}', description: 'Quality string (Source-Resolution)' },
		{ token: '{QualityFull}', description: 'Quality with Proper/Repack markers' },
		{ token: '{Resolution}', description: 'Resolution only (2160p, 1080p, etc.)' },
		{ token: '{Source}', description: 'Source only (Bluray, WEB-DL, etc.)' },
		{ token: '{Proper}', description: '"PROPER" if applicable' },
		{ token: '{Repack}', description: '"REPACK" if applicable' }
	],
	video: [
		{ token: '{VideoCodec}', description: 'Video codec (x264, x265, AV1)' },
		{ token: '{HDR}', description: 'HDR format (DV, HDR10, HDR10+)' },
		{ token: '{BitDepth}', description: 'Bit depth (8, 10, 12)' },
		{ token: '{3D}', description: '"3D" if applicable' }
	],
	audio: [
		{ token: '{AudioCodec}', description: 'Audio codec (TrueHD, DTS-HD MA, etc.)' },
		{ token: '{AudioChannels}', description: 'Audio channels (5.1, 7.1, etc.)' },
		{ token: '{AudioLanguages}', description: 'Audio languages in file' }
	],
	release: [
		{ token: '{ReleaseGroup}', description: 'Release group name' }
	],
	series: [
		{ token: '{SeriesTitle}', description: 'Series title as-is' },
		{ token: '{SeriesCleanTitle}', description: 'Series title with special chars removed' },
		{ token: '{Year}', description: 'First air year' },
		{ token: '{TvdbId}', description: 'TVDB ID' },
		{ token: '{TmdbId}', description: 'TMDB ID' },
		{ token: '{SeriesId}', description: 'Media server ID (TVDB preferred)' }
	],
	episode: [
		{ token: '{Season:00}', description: 'Season number (zero-padded)' },
		{ token: '{Episode:00}', description: 'Episode number (zero-padded)' },
		{ token: '{EpisodeTitle}', description: 'Episode title as-is' },
		{ token: '{EpisodeCleanTitle}', description: 'Episode title with special chars removed' },
		{ token: '{Absolute:000}', description: 'Absolute episode number (anime)' },
		{ token: '{AirDate}', description: 'Air date (YYYY-MM-DD, for daily shows)' }
	],
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
		tokens: NAMING_TOKENS,
		categories: TOKEN_CATEGORIES
	});
};
