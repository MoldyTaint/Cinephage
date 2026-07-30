/**
 * Field-extraction helpers for deriving display fields from the `quality` and `mediaInfo`
 * JSON blobs on `movieFiles` and `episodeFiles`. Extracted from the media explorer
 * page server load (Phase 2) so the ReconciliationService can reuse them.
 */

type QualityBlob = { resolution?: string; codec?: string; hdr?: string } | null | undefined;
type MediaInfoBlob =
	| {
			height?: number;
			videoCodec?: string;
			videoHdrFormat?: string;
			audioCodec?: string;
			containerFormat?: string;
	  }
	| null
	| undefined;

export function heightToResolution(height: number | null | undefined): string | null {
	if (!height) return null;
	if (height >= 2160) return '4K';
	if (height >= 1080) return '1080p';
	if (height >= 720) return '720p';
	if (height >= 480) return '480p';
	return 'SD';
}

export function extractResolution(quality: QualityBlob, mediaInfo: MediaInfoBlob): string | null {
	if (quality?.resolution) return quality.resolution;
	return heightToResolution(mediaInfo?.height);
}

export function extractVideoCodec(quality: QualityBlob, mediaInfo: MediaInfoBlob): string | null {
	if (quality?.codec) return quality.codec.toUpperCase();
	if (mediaInfo?.videoCodec) return mediaInfo.videoCodec.toUpperCase();
	return null;
}

export function extractHdrFormat(quality: QualityBlob, mediaInfo: MediaInfoBlob): string | null {
	if (quality?.hdr) return quality.hdr;
	if (mediaInfo?.videoHdrFormat) return mediaInfo.videoHdrFormat;
	return null;
}

export function extractAudioCodec(mediaInfo: MediaInfoBlob): string | null {
	if (mediaInfo?.audioCodec) return mediaInfo.audioCodec.toUpperCase();
	return null;
}

export function extractContainer(mediaInfo: MediaInfoBlob): string | null {
	if (mediaInfo?.containerFormat) return mediaInfo.containerFormat.toUpperCase();
	return null;
}

/**
 * Build the logical key used to dedupe storage_items rows.
 * Movies have null season/episode; the unique index uses COALESCE(-1) to handle NULLs.
 *
 * Movies match on tmdbId alone: stray season/episode metadata (e.g. a Jellyfin
 * movie carrying IndexNumber=1/ParentIndexNumber=1) is ignored so a single movie
 * can't split into multiple storage_items rows. Top-level containers (series/season)
 * are treated the same way.
 */
export function logicalKey(
	itemType: 'movie' | 'episode' | 'series' | 'season',
	tmdbId: number | null,
	seasonNumber: number | null,
	episodeNumber: number | null
): string {
	if (itemType === 'movie' || itemType === 'series' || itemType === 'season') {
		return `${itemType}:${tmdbId ?? 'none'}:-1:-1`;
	}
	return `${itemType}:${tmdbId ?? 'none'}:${seasonNumber ?? -1}:${episodeNumber ?? -1}`;
}
