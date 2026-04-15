import { randomUUID } from 'node:crypto';
import type {
	PlaybackMediaType,
	PlaybackSession,
	PlaybackSessionAttempt,
	PlaybackSessionResource,
	PlaybackSessionStats,
	PlaybackSessionSubtitle,
	SessionResourceKind,
	StreamType
} from '../types';

const SESSION_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

interface CreatePlaybackSessionInput {
	mediaType: PlaybackMediaType;
	tmdbId: number;
	season?: number;
	episode?: number;
	provider?: string;
	entryUrl: string;
	sourceType: StreamType;
	requestHeaders: Record<string, string>;
	subtitles?: PlaybackSessionSubtitle[];
	attempts: PlaybackSessionAttempt[];
}

export class PlaybackSessionStore {
	private readonly sessions = new Map<string, PlaybackSession>();
	private readonly mediaIndex = new Map<string, string>();
	private readonly cleanupInterval: NodeJS.Timeout;
	private expiredSessions = 0;
	private createdSessions = 0;
	private reusedSessions = 0;

	constructor() {
		this.cleanupInterval = setInterval(() => {
			this.pruneExpired();
		}, CLEANUP_INTERVAL_MS);
	}

	createSession(input: CreatePlaybackSessionInput): PlaybackSession {
		const token = randomUUID();
		const now = Date.now();
		const session: PlaybackSession = {
			token,
			mediaType: input.mediaType,
			tmdbId: input.tmdbId,
			season: input.season,
			episode: input.episode,
			provider: input.provider,
			entryUrl: input.entryUrl,
			sourceType: input.sourceType,
			requestHeaders: { ...input.requestHeaders },
			subtitles: input.subtitles ? [...input.subtitles] : [],
			createdAt: now,
			expiresAt: now + SESSION_TTL_MS,
			lastAccessedAt: now,
			attempts: [...input.attempts],
			resourceIdsByKey: {},
			resources: {}
		};

		this.sessions.set(token, session);
		this.mediaIndex.set(
			this.mediaKey(input.mediaType, input.tmdbId, input.season, input.episode),
			token
		);
		this.createdSessions += 1;
		return session;
	}

	findReusableSession(
		mediaType: PlaybackMediaType,
		tmdbId: number,
		season?: number,
		episode?: number
	): PlaybackSession | null {
		const token = this.mediaIndex.get(this.mediaKey(mediaType, tmdbId, season, episode));
		if (!token) {
			return null;
		}

		const session = this.getSession(token);
		if (!session) {
			return null;
		}

		this.reusedSessions += 1;
		return session;
	}

	getSession(token: string): PlaybackSession | null {
		const session = this.sessions.get(token);
		if (!session) {
			return null;
		}

		if (Date.now() > session.expiresAt) {
			this.deleteSession(token);
			this.expiredSessions += 1;
			return null;
		}

		session.lastAccessedAt = Date.now();
		return session;
	}

	registerResource(
		token: string,
		url: string,
		kind: SessionResourceKind,
		extension: string
	): PlaybackSessionResource | null {
		const session = this.getSession(token);
		if (!session) {
			return null;
		}

		const normalizedExtension = extension.replace(/^\./, '') || 'bin';
		const key = `${kind}:${url}`;
		const existingId = session.resourceIdsByKey[key];
		if (existingId) {
			return session.resources[existingId] ?? null;
		}

		const resource: PlaybackSessionResource = {
			id: randomUUID(),
			url,
			kind,
			extension: normalizedExtension,
			createdAt: Date.now()
		};

		session.resourceIdsByKey[key] = resource.id;
		session.resources[resource.id] = resource;
		return resource;
	}

	getResource(token: string, resourceId: string): PlaybackSessionResource | null {
		const session = this.getSession(token);
		if (!session) {
			return null;
		}

		return session.resources[resourceId] ?? null;
	}

	clear(): void {
		this.sessions.clear();
		this.mediaIndex.clear();
	}

	getStats(): PlaybackSessionStats {
		let resources = 0;
		for (const session of this.sessions.values()) {
			resources += Object.keys(session.resources).length;
		}

		return {
			activeSessions: this.sessions.size,
			resources,
			expiredSessions: this.expiredSessions,
			createdSessions: this.createdSessions,
			reusedSessions: this.reusedSessions
		};
	}

	destroy(): void {
		clearInterval(this.cleanupInterval);
		this.clear();
	}

	private pruneExpired(): void {
		for (const [token, session] of this.sessions.entries()) {
			if (Date.now() > session.expiresAt) {
				this.deleteSession(token);
				this.expiredSessions += 1;
			}
		}
	}

	private deleteSession(token: string): void {
		const session = this.sessions.get(token);
		if (!session) {
			return;
		}

		this.sessions.delete(token);
		const key = this.mediaKey(session.mediaType, session.tmdbId, session.season, session.episode);
		if (this.mediaIndex.get(key) === token) {
			this.mediaIndex.delete(key);
		}
	}

	private mediaKey(
		mediaType: PlaybackMediaType,
		tmdbId: number,
		season?: number,
		episode?: number
	): string {
		if (mediaType === 'movie') {
			return `movie:${tmdbId}`;
		}

		return `tv:${tmdbId}:${season ?? 'x'}:${episode ?? 'x'}`;
	}
}

let playbackSessionStoreInstance: PlaybackSessionStore | null = null;

export function getPlaybackSessionStore(): PlaybackSessionStore {
	if (!playbackSessionStoreInstance) {
		playbackSessionStoreInstance = new PlaybackSessionStore();
	}

	return playbackSessionStoreInstance;
}
