import type { PageServerLoad } from './$types';
import { namingSettingsService } from '$lib/server/library/naming/NamingSettingsService';
import { DEFAULT_NAMING_CONFIG } from '$lib/server/library/naming/NamingService';

/**
 * Available tokens for naming formats organized by category
 */
const NAMING_TOKENS = {
	movie: [
		{ token: '{Title}', description: 'Movie title as-is' },
		{ token: '{CleanTitle}', description: 'Title with special characters removed' },
		{ token: '{Year}', description: 'Release year' },
		{ token: '{TmdbId}', description: 'TMDB ID number' },
		{ token: '{ImdbId}', description: 'IMDB ID' },
		{ token: '{MediaId}', description: 'Media server ID (based on format setting)' },
		{ token: '{Edition}', description: 'Edition (Directors Cut, Extended, etc.)' }
	],
	quality: [
		{ token: '{Quality}', description: 'Quality (Source-Resolution)' },
		{ token: '{QualityFull}', description: 'Quality with Proper/Repack markers' },
		{ token: '{Resolution}', description: 'Resolution (2160p, 1080p, etc.)' },
		{ token: '{Source}', description: 'Source (Bluray, WEB-DL, etc.)' },
		{ token: '{Proper}', description: '"PROPER" if applicable' },
		{ token: '{Repack}', description: '"REPACK" if applicable' }
	],
	video: [
		{ token: '{VideoCodec}', description: 'Video codec (x264, x265)' },
		{ token: '{HDR}', description: 'HDR format (DV, HDR10)' },
		{ token: '{BitDepth}', description: 'Bit depth (8, 10, 12)' },
		{ token: '{3D}', description: '"3D" if applicable' }
	],
	audio: [
		{ token: '{AudioCodec}', description: 'Audio codec (TrueHD, DTS-HD MA)' },
		{ token: '{AudioChannels}', description: 'Audio channels (5.1, 7.1)' }
	],
	release: [
		{ token: '{ReleaseGroup}', description: 'Release group name' }
	],
	series: [
		{ token: '{SeriesTitle}', description: 'Series title as-is' },
		{ token: '{SeriesCleanTitle}', description: 'Series title cleaned' },
		{ token: '{Year}', description: 'First air year' },
		{ token: '{TvdbId}', description: 'TVDB ID' },
		{ token: '{SeriesId}', description: 'Media server ID (TVDB preferred)' }
	],
	episode: [
		{ token: '{Season:00}', description: 'Season number (padded)' },
		{ token: '{Episode:00}', description: 'Episode number (padded)' },
		{ token: '{EpisodeTitle}', description: 'Episode title' },
		{ token: '{EpisodeCleanTitle}', description: 'Episode title cleaned' },
		{ token: '{Absolute:000}', description: 'Absolute number (anime)' },
		{ token: '{AirDate}', description: 'Air date (daily shows)' }
	]
};

export const load: PageServerLoad = async () => {
	const config = await namingSettingsService.getConfig();

	return {
		config,
		defaults: DEFAULT_NAMING_CONFIG,
		tokens: NAMING_TOKENS
	};
};
