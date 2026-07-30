import { logger } from '$lib/logging';
import { getLibraryStreamingModule } from '$lib/server/cinephage/modules/library-streaming/LibraryStreamingModule.js';
import type {
	PlaybackMediaType,
	PlaybackSession,
	PlaybackSessionSubtitle,
	StreamSource
} from '../types';
import { getPlaybackSessionStore } from './session-store';

const streamLog = { logDomain: 'streams' as const };

interface PlaybackLaunchParams {
	tmdbId: number;
	type: PlaybackMediaType;
	season?: number;
	episode?: number;
	forceRefresh?: boolean;
	signal?: AbortSignal;
}

function buildSourceHeaders(source: StreamSource): Record<string, string> {
	const headers = {
		...(source.headers ?? {})
	};

	if (!headers.Referer && !headers.referer && source.referer) {
		headers.Referer = source.referer;
	}

	return headers;
}

function normalizeSubtitleList(source: StreamSource): PlaybackSessionSubtitle[] {
	return (source.subtitles ?? []).map((subtitle, index) => ({
		id: `sub-${index}`,
		url: subtitle.url,
		label: subtitle.label,
		language: subtitle.language,
		isDefault: subtitle.isDefault
	}));
}

function isAborted(signal?: AbortSignal): boolean {
	return signal?.aborted === true;
}

export class PlaybackSessionService {
	private readonly api = getLibraryStreamingModule();
	private readonly store = getPlaybackSessionStore();

	async createOrReuseSession(params: PlaybackLaunchParams): Promise<{
		session: PlaybackSession | null;
		extractionResult?: {
			success: boolean;
			sources: StreamSource[];
			error?: string;
			meta?: Record<string, unknown>;
		};
		error?: string;
	}> {
		if (isAborted(params.signal)) {
			return { session: null, error: 'Aborted' };
		}

		if (!params.forceRefresh) {
			const existing = this.store.findReusableSession(
				params.type,
				params.tmdbId,
				params.season,
				params.episode
			);
			if (existing) {
				return { session: existing };
			}
		}

		const lookup = await this.api.getStreams({
			tmdbId: params.tmdbId,
			type: params.type,
			season: params.season,
			episode: params.episode,
			signal: params.signal
		});

		if (isAborted(params.signal)) {
			return { session: null, error: 'Aborted' };
		}

		if (!lookup.success || !lookup.sources.length) {
			return {
				session: null,
				error: lookup.error || 'No playable stream sources found'
			};
		}

		// The API now returns a single pre-validated stream.
		// Skip probing and use it directly for instant playback startup.
		const source = lookup.sources[0];

		const session = this.store.createSession({
			mediaType: params.type,
			tmdbId: params.tmdbId,
			season: params.season,
			episode: params.episode,
			provider: source.provider,
			entryUrl: source.url,
			sourceType: source.type,
			requestHeaders: buildSourceHeaders(source),
			subtitles: normalizeSubtitleList(source),
			attempts: []
		});

		logger.info(
			{
				sessionToken: session.token,
				provider: source.provider,
				sourceType: source.type,
				entryUrl: source.url,
				quality: source.quality,
				language: source.language,
				tmdbId: params.tmdbId,
				mediaType: params.type,
				season: params.season,
				episode: params.episode,
				...streamLog
			},
			'Playback session created'
		);

		return {
			session,
			extractionResult: {
				success: lookup.success,
				sources: lookup.sources,
				error: lookup.error,
				meta: lookup.meta
			}
		};
	}
}

let playbackSessionServiceInstance: PlaybackSessionService | null = null;

export function getPlaybackSessionService(): PlaybackSessionService {
	if (!playbackSessionServiceInstance) {
		playbackSessionServiceInstance = new PlaybackSessionService();
	}

	return playbackSessionServiceInstance;
}
