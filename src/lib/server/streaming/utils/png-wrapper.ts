const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const TS_SYNC_BYTE = 0x47;
const DEFAULT_MAX_SCAN_BYTES = 4096;

function startsWithPngMagic(data: Uint8Array): boolean {
	if (data.length < PNG_MAGIC.length) {
		return false;
	}
	for (let i = 0; i < PNG_MAGIC.length; i++) {
		if (data[i] !== PNG_MAGIC[i]) {
			return false;
		}
	}
	return true;
}

export function isPngWrappedSegment(data: Uint8Array, _contentType?: string): boolean {
	if (data.length < 100) {
		return false;
	}

	if (!startsWithPngMagic(data)) {
		return false;
	}

	const scanEnd = Math.min(data.length, DEFAULT_MAX_SCAN_BYTES);
	for (let i = PNG_MAGIC.length; i < scanEnd; i++) {
		if (data[i] === TS_SYNC_BYTE) {
			const nextSync = i + 188;
			if (nextSync < data.length && data[nextSync] === TS_SYNC_BYTE) {
				return true;
			}
		}
	}

	return false;
}

export function stripPngWrapper(
	data: Uint8Array,
	maxScanBytes: number = DEFAULT_MAX_SCAN_BYTES
): Uint8Array | null {
	if (data.length < 100) {
		return null;
	}

	if (!startsWithPngMagic(data)) {
		return null;
	}

	const scanEnd = Math.min(data.length, maxScanBytes);
	for (let i = PNG_MAGIC.length; i < scanEnd; i++) {
		if (data[i] === TS_SYNC_BYTE) {
			const nextSync = i + 188;
			if (nextSync < data.length && data[nextSync] === TS_SYNC_BYTE) {
				return data.slice(i);
			}
		}
	}

	return null;
}
