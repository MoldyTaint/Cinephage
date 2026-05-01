/**
 * HDR Format Normalization
 *
 * Maps raw HDR format strings from Jellyfin, Emby, and Plex APIs
 * to canonical labels that match our ffprobe-based detection output.
 *
 * Canonical labels:
 *   SDR, HDR, HDR10, HDR10+, HLG,
 *   DV, DVHDR10, DVHDR10+, DVHLG, DVSDR
 */

const JELLYFIN_MAP: Record<string, string> = {
	SDR: 'SDR',
	Unknown: 'SDR',
	HDR10: 'HDR10',
	HDR10Plus: 'HDR10+',
	HLG: 'HLG',
	DOVI: 'DV',
	DOVIWithHDR10: 'DVHDR10',
	DOVIWithHLG: 'DVHLG',
	DOVIWithSDR: 'DVSDR',
	DOVIWithEL: 'DVHDR10',
	DOVIWithHDR10Plus: 'DVHDR10+',
	DOVIWithELHDR10Plus: 'DVHDR10+',
	DOVIInvalid: 'HDR10'
};

const EMBY_MAP: Record<string, string> = {
	None: 'SDR',
	Hdr10: 'HDR10',
	Hdr10Plus: 'HDR10+',
	HyperLogGamma: 'HLG',
	DolbyVision: 'DV'
};

export function normalizeJellyfinHdr(videoRangeType: string): string | null {
	return JELLYFIN_MAP[videoRangeType] ?? null;
}

export function normalizeEmbyHdr(extendedVideoType: string): string | null {
	return EMBY_MAP[extendedVideoType] ?? null;
}

export function buildPlexHdrLabel(opts: {
	doViPresent: boolean;
	doViProfile: number | null;
	colorTrc: string;
}): string | null {
	const { doViPresent, doViProfile, colorTrc } = opts;

	if (doViPresent) {
		const isSmpte2084 = colorTrc.includes('smpte2084');
		const isHlg = colorTrc.includes('arib-std-b67');

		if (doViProfile === 7) {
			return 'DVHDR10';
		}

		if (doViProfile === 4 || isHlg) {
			return 'DVHLG';
		}

		if (doViProfile === 2 || doViProfile === 3) {
			return 'DVSDR';
		}

		if (isSmpte2084) {
			return 'DVHDR10';
		}

		return 'DV';
	}

	const trcLower = colorTrc.toLowerCase();

	if (trcLower.includes('smpte2084')) {
		return 'HDR10';
	}

	if (trcLower.includes('arib-std-b67')) {
		return 'HLG';
	}

	return null;
}
