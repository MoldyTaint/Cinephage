import type { PlaybackSession, SessionResourceKind } from '../types';
import { resolveHlsUrl } from '../utils/hls-rewrite.js';

interface RewritePlaylistOptions {
	playlist: string;
	playlistUrl: string;
	baseUrl: string;
	session: PlaybackSession;
	apiKey?: string;
	registerResource: (url: string, kind: SessionResourceKind, extension: string) => string;
	injectSubtitles?: boolean;
}

const URI_ATTRIBUTE_TAGS = {
	'#EXT-X-MEDIA:': 'asset',
	'#EXT-X-KEY:': 'asset',
	'#EXT-X-MAP:': 'asset',
	'#EXT-X-I-FRAME-STREAM-INF:': 'playlist'
} as const;

function inferExtension(url: string, fallback: string): string {
	try {
		const pathname = new URL(url).pathname;
		const lastSegment = pathname.split('/').pop() ?? '';
		const match = lastSegment.match(/\.([a-zA-Z0-9]+)$/);
		return match?.[1]?.toLowerCase() ?? fallback;
	} catch {
		return fallback;
	}
}

const SAFE_SEGMENT_EXTENSIONS = new Set(['ts', 'm4s', 'mp4', 'aac', 'mp3']);

function normalizeSessionExtension(kind: SessionResourceKind, extension: string): string {
	const normalized = extension.replace(/^\./, '').toLowerCase();

	if (kind === 'playlist') {
		return 'm3u8';
	}

	if (kind === 'segment') {
		return SAFE_SEGMENT_EXTENSIONS.has(normalized) ? normalized : 'ts';
	}

	return normalized || 'bin';
}

function inferResourceKind(url: string, previousWasExtinf: boolean): SessionResourceKind {
	const normalized = url.toLowerCase();
	if (previousWasExtinf) {
		return 'segment';
	}
	if (
		normalized.includes('.m3u8') ||
		normalized.includes('.txt') ||
		normalized.includes('playlist') ||
		normalized.includes('index.m3u8')
	) {
		return 'playlist';
	}
	if (
		normalized.includes('.ts') ||
		normalized.includes('.m4s') ||
		normalized.includes('.jpg') ||
		normalized.includes('.jpeg') ||
		normalized.includes('.mp4') ||
		normalized.includes('.aac')
	) {
		return 'segment';
	}
	return 'asset';
}

function buildSessionUrl(
	baseUrl: string,
	token: string,
	resourceId: string,
	kind: SessionResourceKind,
	extension: string,
	apiKey?: string
): string {
	let path: string;
	if (kind === 'playlist') {
		path = `/api/streaming/session/${token}/playlist/${resourceId}.m3u8`;
	} else if (kind === 'segment') {
		path = `/api/streaming/session/${token}/segment/${resourceId}.${extension}`;
	} else {
		path = `/api/streaming/session/${token}/asset/${resourceId}`;
	}

	const url = new URL(path, baseUrl);
	if (apiKey) {
		url.searchParams.set('api_key', apiKey);
	}
	return url.toString();
}

function buildSubtitlePlaylistUrl(
	baseUrl: string,
	token: string,
	subtitleId: string,
	apiKey?: string
): string {
	const url = new URL(`/api/streaming/session/${token}/subtitle/${subtitleId}.m3u8`, baseUrl);
	if (apiKey) {
		url.searchParams.set('api_key', apiKey);
	}
	return url.toString();
}

function injectSubtitleTracks(
	playlist: string,
	baseUrl: string,
	session: PlaybackSession,
	apiKey?: string
): string {
	if (!session.subtitles.length || !playlist.includes('#EXT-X-STREAM-INF')) {
		return playlist;
	}

	const lines = playlist.split('\n');
	const mediaTags = session.subtitles.map((subtitle, index) => {
		const playlistUrl = buildSubtitlePlaylistUrl(baseUrl, session.token, subtitle.id, apiKey);
		return `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="cinephage-subs",NAME="${subtitle.label.replace(/"/g, '\\"')}",DEFAULT=${subtitle.isDefault || index === 0 ? 'YES' : 'NO'},AUTOSELECT=YES,FORCED=NO,LANGUAGE="${subtitle.language || 'und'}",URI="${playlistUrl}"`;
	});

	const withMediaTags: string[] = [];
	let inserted = false;
	for (const line of lines) {
		withMediaTags.push(line);
		if (!inserted && line.trim() === '#EXTM3U') {
			withMediaTags.push(...mediaTags);
			inserted = true;
		}
	}

	return withMediaTags
		.map((line) => {
			if (line.startsWith('#EXT-X-STREAM-INF:') && !line.includes('SUBTITLES=')) {
				return `${line},SUBTITLES="cinephage-subs"`;
			}
			return line;
		})
		.join('\n');
}

export function rewriteSessionPlaylist(options: RewritePlaylistOptions): string {
	const lines = options.playlist.split('\n');
	const result: string[] = [];
	const base = new URL(options.playlistUrl);
	const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

	let previousWasExtinf = false;
	let previousWasStreamInf = false;

	for (const line of lines) {
		const trimmed = line.trim();

		const tagEntry = Object.entries(URI_ATTRIBUTE_TAGS).find(([tag]) => trimmed.startsWith(tag));
		if (tagEntry) {
			const uriMatch = line.match(/URI="([^"]+)"/);
			if (uriMatch) {
				const [, originalUri] = uriMatch;
				const absoluteUri = resolveHlsUrl(originalUri, base, basePath);
				const kind = tagEntry[1] as SessionResourceKind;
				const extension = normalizeSessionExtension(
					kind,
					inferExtension(
						absoluteUri,
						kind === 'playlist' ? 'm3u8' : kind === 'segment' ? 'ts' : 'bin'
					)
				);
				const resourceId = options.registerResource(absoluteUri, kind, extension);
				const sessionUrl = buildSessionUrl(
					options.baseUrl,
					options.session.token,
					resourceId,
					kind,
					extension,
					options.apiKey
				);
				result.push(line.replace(`URI="${originalUri}"`, `URI="${sessionUrl}"`));
				previousWasExtinf = false;
				continue;
			}
		}

		if (trimmed.startsWith('#EXTINF:')) {
			result.push(line);
			previousWasExtinf = true;
			previousWasStreamInf = false;
			continue;
		}

		if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
			result.push(line);
			previousWasExtinf = false;
			previousWasStreamInf = true;
			continue;
		}

		if (line.startsWith('#') || trimmed === '') {
			result.push(line);
			previousWasExtinf = false;
			previousWasStreamInf = false;
			continue;
		}

		const absoluteUrl = resolveHlsUrl(trimmed, base, basePath);
		const kind = previousWasStreamInf
			? 'playlist'
			: inferResourceKind(absoluteUrl, previousWasExtinf);
		const extension = normalizeSessionExtension(
			kind,
			inferExtension(absoluteUrl, kind === 'playlist' ? 'm3u8' : kind === 'segment' ? 'ts' : 'bin')
		);
		const resourceId = options.registerResource(absoluteUrl, kind, extension);
		result.push(
			buildSessionUrl(
				options.baseUrl,
				options.session.token,
				resourceId,
				kind,
				extension,
				options.apiKey
			)
		);
		previousWasExtinf = false;
		previousWasStreamInf = false;
	}

	const rewritten = result.join('\n');
	if (options.injectSubtitles) {
		return injectSubtitleTracks(rewritten, options.baseUrl, options.session, options.apiKey);
	}

	return rewritten;
}
