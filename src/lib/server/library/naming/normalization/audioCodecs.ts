/**
 * Audio codec normalization for media naming
 *
 * Maps various audio codec name variants to standardized formats.
 */

import { createNormalizationMap, type NormalizationMap } from './types';

/**
 * Pre-process audio codec input by removing most non-alphanumeric characters
 * Preserves + for DD+ codec detection
 */
function preprocessAudioCodec(codec: string): string {
	return codec.toLowerCase().replace(/[^a-z0-9+]/g, '');
}

const AUDIO_CODEC_MAPPINGS: Record<string, string> = {
	// Lossless formats
	truehd: 'TrueHD',
	truehdatmos: 'TrueHD Atmos',
	truhdatmos: 'TrueHD Atmos',
	dtshd: 'DTS-HD',
	dtshdma: 'DTS-HD MA',
	dtshdhra: 'DTS-HD HRA',
	dtsx: 'DTS-X',
	flac: 'FLAC',
	pcm: 'PCM',
	lpcm: 'LPCM',
	alac: 'ALAC',
	mlp: 'TrueHD',

	// Lossy formats
	dts: 'DTS',
	dtses: 'DTS-ES',
	dolbydigital: 'DD',
	dolbydigitalplus: 'DD+',
	dd: 'DD',
	ac3: 'DD',
	ddp: 'DD+',
	'dd+': 'DD+',
	ddplus: 'DD+',
	eac3: 'DD+',
	aac: 'AAC',
	mp3: 'MP3',
	opus: 'Opus',
	vorbis: 'Vorbis',
	wma: 'WMA'
};

export const audioCodecNormalizer: NormalizationMap = createNormalizationMap(AUDIO_CODEC_MAPPINGS);

/**
 * Normalize an audio codec name to standard format
 */
export function normalizeAudioCodec(codec: string | undefined): string | undefined {
	if (!codec) return undefined;
	// Filter out 'unknown' values
	if (codec.toLowerCase() === 'unknown') return undefined;
	const preprocessed = preprocessAudioCodec(codec);
	return audioCodecNormalizer.normalize(preprocessed);
}
