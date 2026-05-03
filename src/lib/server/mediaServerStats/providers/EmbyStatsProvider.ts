import type { MediaServerStatsProviderConfig } from '../types.js';
import { normalizeEmbyHdr } from '../hdr-normalize.js';
import { EmbyCompatibleProvider } from './EmbyCompatibleProvider.js';

export class EmbyStatsProvider extends EmbyCompatibleProvider {
	constructor(config: MediaServerStatsProviderConfig) {
		super(config);
	}

	get serverName(): string {
		return 'Emby';
	}

	buildUrl(path: string): string {
		return `${this.config.host}/emby${path}`;
	}

	getAuthHeaders(): Record<string, string> {
		return { 'X-Emby-Token': this.config.apiKey };
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	protected resolveHDR(videoStream: any | null): { isHDR: boolean; hdrFormat: string | null } {
		if (!videoStream) {
			return { isHDR: false, hdrFormat: null };
		}

		const extendedType = videoStream.ExtendedVideoType;
		if (extendedType && extendedType !== 'None') {
			return { isHDR: true, hdrFormat: normalizeEmbyHdr(extendedType) ?? extendedType };
		}

		if (videoStream.VideoRange === 'HDR') {
			return { isHDR: true, hdrFormat: 'HDR' };
		}

		return { isHDR: false, hdrFormat: null };
	}
}
