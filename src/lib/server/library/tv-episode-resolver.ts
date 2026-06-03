import { basename, extname, resolve } from 'node:path';
import { parseRelease } from '$lib/server/indexers/parser/ReleaseParser.js';
import type { ParsedRelease } from '$lib/server/indexers/parser/types.js';

export type SeriesType = 'standard' | 'anime' | 'daily';

export type ResolvedTvEpisodeIdentifier =
	| {
			numbering: 'standard';
			seasonNumber: number;
			episodeNumbers: number[];
	  }
	| {
			numbering: 'daily';
			airDate: string;
	  }
	| {
			numbering: 'absolute';
			absoluteEpisode: number;
	  };

interface ResolveTvEpisodeIdentifierOptions {
	filePath: string;
	fileName?: string;
	parsed?: ParsedRelease;
	seasonHint?: number;
	seriesType?: SeriesType | null;
}

interface EpisodeRecordLike {
	seasonNumber: number;
	episodeNumber: number;
	absoluteEpisodeNumber?: number | null;
	airDate?: string | null;
}

const TRANSPORT_AND_MEDIA_EXTENSIONS = new Set([
	'.strm',
	'.mkv',
	'.mp4',
	'.avi',
	'.mov',
	'.m4v',
	'.wmv',
	'.flv',
	'.webm',
	'.mpg',
	'.mpeg',
	'.ts',
	'.m2ts',
	'.mts'
]);

export function getMediaParseStem(pathValue: string): string {
	let fileName = basename(pathValue);

	while (true) {
		const extension = extname(fileName).toLowerCase();
		if (!extension || !TRANSPORT_AND_MEDIA_EXTENSIONS.has(extension)) {
			return fileName;
		}

		fileName = basename(fileName, extension);
	}
}

export function extractSeasonFromPath(pathValue: string): number | undefined {
	const normalizedPath = resolve(pathValue).replace(/\\/g, '/');

	// First pass: match season as a complete path segment boundary
	// e.g. /Season 1/, /s01/, /Season.1/
	const segmentPatterns = [
		/(?:^|\/)season[\s._-]*(\d{1,3})(?:\/|$)/i,
		/(?:^|\/)s(\d{1,3})(?:\/|$)/i
	];

	for (const pattern of segmentPatterns) {
		const match = normalizedPath.match(pattern);
		const season = match?.[1] ? parseInt(match[1], 10) : NaN;
		if (!isNaN(season)) {
			return season;
		}
	}

	// Second pass: scan each path segment for a standalone S-number token
	// Handles folder names like "[Group] Title S1 BD-BOX" or "Show S2 Complete"
	// Requires word boundary on both sides and must not be followed by an episode number
	for (const segment of normalizedPath.split('/')) {
		const match = segment.match(/\bS(\d{1,2})\b(?![\s._-]?E\d)/i);
		if (!match) continue;
		const season = parseInt(match[1], 10);
		if (!isNaN(season) && season >= 1 && season <= 30) {
			return season;
		}
	}

	return undefined;
}

function extractCompactAirDate(fileStem: string): string | undefined {
	const match = fileStem.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
	if (!match) {
		return undefined;
	}

	return `${match[1]}-${match[2]}-${match[3]}`;
}

function extractTrailingEpisodeToken(fileStem: string): number | undefined {
	const patterns = [
		/(?:^|[\s._-])(?:ep?|episode)[\s._-]*0*([1-9]\d{0,2})(?:v\d+)?$/i,
		/(?:^|[\s._-])0*([1-9]\d{0,2})(?:v\d+)?$/i
	];

	for (const pattern of patterns) {
		const match = fileStem.match(pattern);
		if (!match?.[1]) {
			continue;
		}

		const episode = parseInt(match[1], 10);
		if (!isNaN(episode) && episode > 0) {
			return episode;
		}
	}

	return undefined;
}

export function resolveTvEpisodeIdentifier(
	options: ResolveTvEpisodeIdentifierOptions
): ResolvedTvEpisodeIdentifier | null {
	const fileReference = options.fileName ?? options.filePath;
	const fileStem = getMediaParseStem(fileReference);
	const parsed = options.parsed ?? parseRelease(fileStem);
	const seasonHint = options.seasonHint ?? extractSeasonFromPath(options.filePath);
	const seriesType = options.seriesType ?? null;
	const episodeInfo = parsed.episode;

	if (
		episodeInfo?.season !== undefined &&
		episodeInfo.episodes &&
		episodeInfo.episodes.length > 0
	) {
		return {
			numbering: 'standard',
			seasonNumber: episodeInfo.season,
			episodeNumbers: episodeInfo.episodes
		};
	}

	if (episodeInfo?.isDaily && episodeInfo.airDate) {
		return {
			numbering: 'daily',
			airDate: episodeInfo.airDate
		};
	}

	const compactAirDate = extractCompactAirDate(fileStem);
	if (seriesType === 'daily' && compactAirDate) {
		return {
			numbering: 'daily',
			airDate: compactAirDate
		};
	}

	if (episodeInfo?.isSeasonPack) {
		return null;
	}

	if (episodeInfo?.absoluteEpisode !== undefined) {
		if (seriesType !== 'anime' && seasonHint !== undefined) {
			return {
				numbering: 'standard',
				seasonNumber: seasonHint,
				episodeNumbers: [episodeInfo.absoluteEpisode]
			};
		}

		return {
			numbering: 'absolute',
			absoluteEpisode: episodeInfo.absoluteEpisode
		};
	}

	const trailingEpisode = extractTrailingEpisodeToken(fileStem);
	if (trailingEpisode === undefined) {
		return null;
	}

	if (seriesType === 'anime') {
		return {
			numbering: 'absolute',
			absoluteEpisode: trailingEpisode
		};
	}

	if (seasonHint !== undefined) {
		return {
			numbering: 'standard',
			seasonNumber: seasonHint,
			episodeNumbers: [trailingEpisode]
		};
	}

	return null;
}

export function matchEpisodesByIdentifier<T extends EpisodeRecordLike>(
	episodes: T[],
	identifier: ResolvedTvEpisodeIdentifier
): T[] {
	switch (identifier.numbering) {
		case 'standard':
			return episodes.filter(
				(episode) =>
					episode.seasonNumber === identifier.seasonNumber &&
					identifier.episodeNumbers.includes(episode.episodeNumber)
			);
		case 'daily':
			return episodes.filter((episode) => episode.airDate === identifier.airDate);
		case 'absolute':
			return episodes.filter(
				(episode) => episode.absoluteEpisodeNumber === identifier.absoluteEpisode
			);
	}
}
