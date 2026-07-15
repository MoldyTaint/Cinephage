import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ReleaseParser } from '$lib/server/indexers/parser/ReleaseParser';
import {
	releaseToNamingInfo,
	type MediaNamingInfo
} from '$lib/server/library/naming/NamingService';

interface NamingBoundary {
	generateMovieFileName(info: MediaNamingInfo): string;
	generateEpisodeFileName(info: MediaNamingInfo): string;
	generateSeasonFolderName(seasonNumber: number): string;
}

interface MoviePlanInput {
	rootPath: string;
	mediaPath: string;
	media: {
		title: string;
		year?: number | null;
		tmdbId: number;
		imdbId?: string | null;
	};
	sourcePath: string;
	releaseTitle: string;
}

interface EpisodePlanInput {
	rootPath: string;
	mediaPath: string;
	media: {
		title: string;
		year?: number | null;
		tvdbId?: number | null;
		seriesType?: string | null;
	};
	seasonNumber: number;
	episodeNumbers: number[];
	episodeTitle?: string;
	absoluteNumber?: number;
	airDate?: string;
	useSeasonFolders: boolean;
	sourcePath: string;
	releaseTitle: string;
}

export interface LibraryDestinationPlan {
	fileName: string;
	relativePath: string;
	finalPath: string;
}

/**
 * Side-effect-free final library destination planner shared by conventional
 * import and debrid materialization. Provider paths supply naming metadata
 * only; the configured root and media path exclusively control placement.
 */
export class LibraryDestinationPlanner {
	private readonly parser = new ReleaseParser();

	constructor(private readonly naming: NamingBoundary) {}

	planMovie(input: MoviePlanInput): LibraryDestinationPlan {
		const parsed = this.parser.parse(input.releaseTitle);
		const fileName = this.safeSegment(
			this.naming.generateMovieFileName({
				title: input.media.title,
				year: input.media.year ?? undefined,
				tmdbId: input.media.tmdbId,
				imdbId: input.media.imdbId ?? undefined,
				...releaseToNamingInfo(parsed, input.sourcePath)
			})
		);

		return {
			fileName,
			relativePath: fileName,
			finalPath: this.containedPath(input.rootPath, input.mediaPath, fileName)
		};
	}

	planEpisode(input: EpisodePlanInput): LibraryDestinationPlan {
		const parsed = this.parser.parse(input.releaseTitle);
		const fileName = this.safeSegment(
			this.naming.generateEpisodeFileName({
				...releaseToNamingInfo(parsed, input.sourcePath),
				title: input.media.title,
				year: input.media.year ?? undefined,
				tvdbId: input.media.tvdbId ?? undefined,
				seasonNumber: input.seasonNumber,
				episodeNumbers: input.episodeNumbers,
				episodeTitle: input.episodeTitle,
				absoluteNumber: input.absoluteNumber,
				airDate: input.airDate,
				isAnime: input.media.seriesType === 'anime',
				isDaily: input.media.seriesType === 'daily'
			})
		);
		const relativePath = input.useSeasonFolders
			? join(this.safeSegment(this.naming.generateSeasonFolderName(input.seasonNumber)), fileName)
			: fileName;

		return {
			fileName,
			relativePath,
			finalPath: this.containedPath(input.rootPath, input.mediaPath, relativePath)
		};
	}

	private safeSegment(value: string): string {
		if (
			!value ||
			value === '.' ||
			value === '..' ||
			basename(value) !== value ||
			value.includes('\\')
		) {
			throw new Error('Generated library name must not contain path components');
		}
		return value;
	}

	private containedPath(rootPath: string, mediaPath: string, relativePath: string): string {
		const root = resolve(rootPath);
		const candidate = resolve(root, mediaPath, relativePath);
		const fromRoot = relative(root, candidate);
		if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
			throw new Error('Resolved library destination is outside the configured library root');
		}
		return candidate;
	}
}
