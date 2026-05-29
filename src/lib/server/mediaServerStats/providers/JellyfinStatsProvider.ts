import type { MediaServerStatsProviderConfig } from '../types.js';
import { normalizeJellyfinHdr } from '../hdr-normalize.js';
import { EmbyCompatibleProvider } from './EmbyCompatibleProvider.js';

export class JellyfinStatsProvider extends EmbyCompatibleProvider {
	constructor(config: MediaServerStatsProviderConfig) {
		super(config);
	}

	get serverName(): string {
		return 'Jellyfin';
	}

	buildUrl(path: string): string {
		return `${this.config.host}${path}`;
	}

	getAuthHeaders(): Record<string, string> {
		return { Authorization: `MediaBrowser Token="${this.config.apiKey}"` };
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected resolveHDR(videoStream: any | null): { isHDR: boolean; hdrFormat: string | null } {
		if (!videoStream) {
			return { isHDR: false, hdrFormat: null };
		}

		const videoRangeType = videoStream.VideoRangeType;
		const isHDR =
			videoRangeType !== undefined && videoRangeType !== null && videoRangeType !== 'SDR';

		const hdrFormat = isHDR ? normalizeJellyfinHdr(videoRangeType) : null;

		return { isHDR, hdrFormat };
	}
}
