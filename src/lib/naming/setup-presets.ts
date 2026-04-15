export interface NamingConfigShape {
	movieFolderFormat: string;
	movieFileFormat: string;
	seriesFolderFormat: string;
	seasonFolderFormat: string;
	episodeFileFormat: string;
	dailyEpisodeFormat: string;
	animeEpisodeFormat: string;
	multiEpisodeStyle: 'extend' | 'duplicate' | 'repeat' | 'scene' | 'range';
	replaceSpacesWith?: string;
	colonReplacement: 'delete' | 'dash' | 'spaceDash' | 'spaceDashSpace' | 'smart';
	mediaServerIdFormat: 'plex' | 'jellyfin';
	includeQuality: boolean;
	includeMediaInfo: boolean;
	includeReleaseGroup: boolean;
}

export interface NamingPreset {
	id: string;
	name: string;
	description: string;
	isBuiltIn: boolean;
	config: Partial<NamingConfigShape>;
}

export interface NamingServerPreset {
	id: string;
	name: string;
	description: string;
	config: Partial<NamingConfigShape>;
}

export interface NamingStylePreset {
	id: string;
	name: string;
	description: string;
	config: Partial<NamingConfigShape>;
}

export interface NamingDetailPreset {
	id: string;
	name: string;
	description: string;
	config: Partial<NamingConfigShape>;
}

export const DEFAULT_SETUP_NAMING_CONFIG: NamingConfigShape = {
	movieFolderFormat: '{CleanTitle} ({Year}) {MediaId}',
	movieFileFormat:
		'{CleanTitle} ({Year}) {edition-{Edition}} [{QualityFull}]{[{HDR}]}{[{AudioCodec} {AudioChannels}]}{[{VideoCodec}]}{-{ReleaseGroup}}',
	seriesFolderFormat: '{CleanTitle} ({Year}) {SeriesId}',
	seasonFolderFormat: 'Season {Season:00}',
	episodeFileFormat:
		'{SeriesCleanTitle} ({Year}) - S{Season:00}E{Episode:00} - {EpisodeCleanTitle} [{QualityFull}]{[{HDR}]}{[{AudioCodec} {AudioChannels}]}{[{VideoCodec}]}{-{ReleaseGroup}}',
	dailyEpisodeFormat:
		'{SeriesCleanTitle} ({Year}) - {AirDate} - {EpisodeCleanTitle} [{QualityFull}]{[{VideoCodec}]}{-{ReleaseGroup}}',
	animeEpisodeFormat:
		'{SeriesCleanTitle} ({Year}) - S{Season:00}E{Episode:00} - {Absolute:000} - {EpisodeCleanTitle} [{QualityFull}]{[{HDR}]}{[{BitDepth}bit]}{[{VideoCodec}]}{[{AudioCodec} {AudioChannels}]}{-{ReleaseGroup}}',
	multiEpisodeStyle: 'range',
	colonReplacement: 'smart',
	mediaServerIdFormat: 'plex',
	includeQuality: true,
	includeMediaInfo: true,
	includeReleaseGroup: true
};

const RECOMMENDED_MOVIE_FILE =
	'{CleanTitle} ({Year}) {edition-{Edition}} [{QualityFull}]{[{HDR}]}{[{AudioCodec} {AudioChannels}]}{[{VideoCodec}]}{-{ReleaseGroup}}';
const RECOMMENDED_EPISODE_FILE =
	'{SeriesCleanTitle} ({Year}) - S{Season:00}E{Episode:00} - {EpisodeCleanTitle} [{QualityFull}]{[{HDR}]}{[{AudioCodec} {AudioChannels}]}{[{VideoCodec}]}{-{ReleaseGroup}}';
const RECOMMENDED_DAILY_FILE =
	'{SeriesCleanTitle} ({Year}) - {AirDate} - {EpisodeCleanTitle} [{QualityFull}]{[{HDR}]}{[{AudioCodec} {AudioChannels}]}{[{VideoCodec}]}{-{ReleaseGroup}}';
const RECOMMENDED_ANIME_FILE =
	'{SeriesCleanTitle} ({Year}) - S{Season:00}E{Episode:00} - {Absolute:000} - {EpisodeCleanTitle} [{QualityFull}]{[{HDR}]}{[{BitDepth}bit]}{[{VideoCodec}]}{[{AudioCodec} {AudioChannels}]}{-{ReleaseGroup}}';

const COMPACT_MOVIE_FILE = '{CleanTitle} ({Year}) [{QualityFull}]{-{ReleaseGroup}}';
const COMPACT_EPISODE_FILE =
	'{SeriesCleanTitle} ({Year}) - S{Season:00}E{Episode:00} - {EpisodeCleanTitle} [{QualityFull}]{-{ReleaseGroup}}';
const COMPACT_DAILY_FILE =
	'{SeriesCleanTitle} ({Year}) - {AirDate} - {EpisodeCleanTitle} [{QualityFull}]{-{ReleaseGroup}}';
const COMPACT_ANIME_FILE =
	'{SeriesCleanTitle} ({Year}) - S{Season:00}E{Episode:00} - {Absolute:000} - {EpisodeCleanTitle} [{QualityFull}]{-{ReleaseGroup}}';

const SCENE_MOVIE_FILE =
	'{CleanTitle}.{Year}.{QualityFull}{.{HDR}}{.{AudioCodec}}{.{AudioChannels}}{.{VideoCodec}}{-{ReleaseGroup}}';
const SCENE_EPISODE_FILE =
	'{SeriesCleanTitle}.{Year}.S{Season:00}E{Episode:00}.{EpisodeCleanTitle}{.{QualityFull}}{.{HDR}}{.{AudioCodec}}{.{AudioChannels}}{.{VideoCodec}}{-{ReleaseGroup}}';
const SCENE_DAILY_FILE =
	'{SeriesCleanTitle}.{Year}.{AirDate}.{EpisodeCleanTitle}{.{QualityFull}}{.{HDR}}{.{AudioCodec}}{.{AudioChannels}}{.{VideoCodec}}{-{ReleaseGroup}}';
const SCENE_ANIME_FILE =
	'{SeriesCleanTitle}.{Year}.S{Season:00}E{Episode:00}.{Absolute:000}.{EpisodeCleanTitle}{.{QualityFull}}{.{HDR}}{.{BitDepth}bit}{.{VideoCodec}}{.{AudioCodec}}{.{AudioChannels}}{-{ReleaseGroup}}';

const ORIGINAL_MOVIE_FILE = '{Title} ({Year}){-{ReleaseGroup}}';
const ORIGINAL_EPISODE_FILE =
	'{SeriesTitle} ({Year}) - S{Season:00}E{Episode:00} - {EpisodeTitle}{-{ReleaseGroup}}';
const ORIGINAL_DAILY_FILE = '{SeriesTitle} ({Year}) - {AirDate} - {EpisodeTitle}{-{ReleaseGroup}}';
const ORIGINAL_ANIME_FILE =
	'{SeriesTitle} ({Year}) - S{Season:00}E{Episode:00} - {Absolute:000} - {EpisodeTitle}{-{ReleaseGroup}}';

export const NAMING_SERVER_PRESETS: NamingServerPreset[] = [
	{
		id: 'plex',
		name: 'Plex',
		description: 'Server-friendly IDs in brace format for Plex-compatible organization.',
		config: {
			mediaServerIdFormat: 'plex',
			movieFolderFormat: '{CleanTitle} ({Year}) {MediaId}',
			seriesFolderFormat: '{CleanTitle} ({Year}) {SeriesId}'
		}
	},
	{
		id: 'jellyfin',
		name: 'Jellyfin',
		description: 'Bracketed server IDs for Jellyfin library matching.',
		config: {
			mediaServerIdFormat: 'jellyfin',
			movieFolderFormat: '{CleanTitle} ({Year}) {MediaId}',
			seriesFolderFormat: '{CleanTitle} ({Year}) {SeriesId}'
		}
	},
	{
		id: 'emby',
		name: 'Emby',
		description: 'ID-tagged folders tuned for Emby-style library imports.',
		config: {
			mediaServerIdFormat: 'jellyfin',
			movieFolderFormat: '{CleanTitle} ({Year}) {MediaId}',
			seriesFolderFormat: '{CleanTitle} ({Year}) {SeriesId}'
		}
	},
	{
		id: 'kodi',
		name: 'Kodi',
		description: 'Simple folder names without embedded server IDs.',
		config: {
			mediaServerIdFormat: 'plex',
			movieFolderFormat: '{CleanTitle} ({Year})',
			seriesFolderFormat: '{CleanTitle} ({Year})'
		}
	},
	{
		id: 'generic',
		name: 'Generic',
		description: 'Clean folder naming for mixed or custom library setups.',
		config: {
			mediaServerIdFormat: 'plex',
			movieFolderFormat: '{CleanTitle} ({Year})',
			seriesFolderFormat: '{CleanTitle} ({Year})'
		}
	}
];

export const NAMING_STYLE_PRESETS: NamingStylePreset[] = [
	{
		id: 'recommended',
		name: 'Recommended',
		description: 'Balanced naming with quality, media details, and release group information.',
		config: {
			movieFileFormat: RECOMMENDED_MOVIE_FILE,
			episodeFileFormat: RECOMMENDED_EPISODE_FILE,
			dailyEpisodeFormat: RECOMMENDED_DAILY_FILE,
			animeEpisodeFormat: RECOMMENDED_ANIME_FILE,
			multiEpisodeStyle: 'range',
			colonReplacement: 'smart',
			replaceSpacesWith: undefined
		}
	},
	{
		id: 'compact',
		name: 'Compact',
		description: 'Shorter names that keep the essentials without overloading the filename.',
		config: {
			movieFileFormat: COMPACT_MOVIE_FILE,
			episodeFileFormat: COMPACT_EPISODE_FILE,
			dailyEpisodeFormat: COMPACT_DAILY_FILE,
			animeEpisodeFormat: COMPACT_ANIME_FILE,
			multiEpisodeStyle: 'range',
			colonReplacement: 'smart',
			replaceSpacesWith: undefined
		}
	},
	{
		id: 'scene',
		name: 'Scene-Style',
		description: 'Dot-separated naming for users who prefer a scene-like release look.',
		config: {
			movieFileFormat: SCENE_MOVIE_FILE,
			episodeFileFormat: SCENE_EPISODE_FILE,
			dailyEpisodeFormat: SCENE_DAILY_FILE,
			animeEpisodeFormat: SCENE_ANIME_FILE,
			multiEpisodeStyle: 'range',
			colonReplacement: 'delete',
			replaceSpacesWith: '.'
		}
	},
	{
		id: 'original-release',
		name: 'Original Release Title',
		description: 'Cleaner naming that keeps titles front and center with minimal release metadata.',
		config: {
			movieFileFormat: ORIGINAL_MOVIE_FILE,
			episodeFileFormat: ORIGINAL_EPISODE_FILE,
			dailyEpisodeFormat: ORIGINAL_DAILY_FILE,
			animeEpisodeFormat: ORIGINAL_ANIME_FILE,
			multiEpisodeStyle: 'range',
			colonReplacement: 'smart',
			replaceSpacesWith: undefined
		}
	},
	{
		id: 'anime-focused',
		name: 'Anime-Focused',
		description: 'Preserves absolute numbering and richer anime media detail by default.',
		config: {
			movieFileFormat: RECOMMENDED_MOVIE_FILE,
			episodeFileFormat: RECOMMENDED_EPISODE_FILE,
			dailyEpisodeFormat: RECOMMENDED_DAILY_FILE,
			animeEpisodeFormat: RECOMMENDED_ANIME_FILE,
			multiEpisodeStyle: 'range',
			colonReplacement: 'smart',
			replaceSpacesWith: undefined,
			includeMediaInfo: true,
			includeQuality: true,
			includeReleaseGroup: true
		}
	}
];

export const NAMING_DETAIL_PRESETS: NamingDetailPreset[] = [
	{
		id: 'minimal',
		name: 'Minimal',
		description: 'Only keep titles and the bare minimum release context.',
		config: {
			includeQuality: false,
			includeMediaInfo: false,
			includeReleaseGroup: true
		}
	},
	{
		id: 'balanced',
		name: 'Balanced',
		description: 'Preserve quality and release context without overloading file names.',
		config: {
			includeQuality: true,
			includeMediaInfo: true,
			includeReleaseGroup: true
		}
	},
	{
		id: 'detailed',
		name: 'Detailed',
		description: 'Keep as much useful quality and media metadata as possible.',
		config: {
			includeQuality: true,
			includeMediaInfo: true,
			includeReleaseGroup: true
		}
	}
];

function buildBuiltInPreset(
	serverId: string,
	styleId: string,
	detailId: string,
	name: string,
	description: string
): NamingPreset {
	return {
		id: `${serverId}-${styleId}-${detailId}`,
		name,
		description,
		isBuiltIn: true,
		config: buildConfigFromSetup({ serverId, styleId, detailId })
	};
}

export const BUILT_IN_PRESETS: NamingPreset[] = [
	buildBuiltInPreset(
		'plex',
		'recommended',
		'balanced',
		'Plex Recommended',
		'Server-ready naming for Plex with balanced metadata in file names.'
	),
	buildBuiltInPreset(
		'jellyfin',
		'recommended',
		'balanced',
		'Jellyfin Recommended',
		'Server-ready naming for Jellyfin with balanced metadata in file names.'
	),
	buildBuiltInPreset(
		'emby',
		'recommended',
		'balanced',
		'Emby Recommended',
		'Server-ready naming for Emby with balanced metadata in file names.'
	),
	buildBuiltInPreset(
		'generic',
		'compact',
		'balanced',
		'Compact',
		'Shorter names with the essentials preserved for everyday browsing.'
	),
	buildBuiltInPreset(
		'generic',
		'scene',
		'detailed',
		'Scene-Style',
		'Dot-separated naming for users who prefer a scene-inspired look.'
	),
	buildBuiltInPreset(
		'generic',
		'original-release',
		'minimal',
		'Original Release Title',
		'Prioritizes clean title-led naming with minimal added metadata.'
	),
	buildBuiltInPreset(
		'generic',
		'anime-focused',
		'detailed',
		'Anime-Focused',
		'Keeps absolute numbering and fuller anime media details by default.'
	)
];

export function buildConfigFromSetup(options: {
	serverId: string;
	styleId: string;
	detailId: string;
}): Partial<NamingConfigShape> {
	const server = NAMING_SERVER_PRESETS.find((preset) => preset.id === options.serverId);
	const style = NAMING_STYLE_PRESETS.find((preset) => preset.id === options.styleId);
	const detail = NAMING_DETAIL_PRESETS.find((preset) => preset.id === options.detailId);

	return {
		...DEFAULT_SETUP_NAMING_CONFIG,
		...server?.config,
		...style?.config,
		...detail?.config
	};
}

export function getBuiltInPreset(id: string): NamingPreset | undefined {
	return BUILT_IN_PRESETS.find((preset) => preset.id === id);
}

export function getBuiltInPresetIds(): string[] {
	return BUILT_IN_PRESETS.map((preset) => preset.id);
}
