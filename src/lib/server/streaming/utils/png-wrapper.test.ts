import { describe, expect, it } from 'vitest';
import { stripPngWrapper, isPngWrappedSegment } from './png-wrapper.js';

const TS_SYNC = 0x47;

function buildMinimalPng(): Uint8Array {
	return Uint8Array.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x01, 0x03, 0x00, 0x00, 0x00, 0x25, 0xdb, 0x56,
		0xca, 0x00, 0x00, 0x00, 0x03, 0x50, 0x4c, 0x54, 0x45, 0x00, 0x00, 0x00, 0xa7, 0x7a, 0x3c, 0xda,
		0x00, 0x00, 0x00, 0x01, 0x74, 0x52, 0x4e, 0x53, 0x00, 0x40, 0xe6, 0xd8, 0x66, 0x00, 0x00, 0x00,
		0x0a, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2,
		0x21, 0xbc, 0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60
	]);
}

function buildTsPacket(pid: number = 0x0000): Uint8Array {
	const packet = new Uint8Array(188);
	packet[0] = TS_SYNC;
	packet[1] = pid === 0 ? 0x40 : 0x50;
	packet[2] = (pid >> 8) & 0xff;
	packet[3] = pid & 0xff;
	return packet;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((sum, a) => sum + a.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const a of arrays) {
		result.set(a, offset);
		offset += a.length;
	}
	return result;
}

describe('png-wrapper', () => {
	describe('isPngWrappedSegment', () => {
		it('detects PNG-wrapped TS segment', () => {
			const pngHeader = buildMinimalPng();
			const tsPacket1 = buildTsPacket();
			const tsPacket2 = buildTsPacket(0x1000);
			const wrapped = concat(pngHeader, tsPacket1, tsPacket2);

			expect(isPngWrappedSegment(wrapped, 'image/png')).toBe(true);
		});

		it('detects PNG-wrapped segment regardless of content-type if bytes match', () => {
			const pngHeader = buildMinimalPng();
			const tsPacket1 = buildTsPacket();
			const tsPacket2 = buildTsPacket(0x1000);
			const wrapped = concat(pngHeader, tsPacket1, tsPacket2);

			expect(isPngWrappedSegment(wrapped, 'application/octet-stream')).toBe(true);
		});

		it('returns false for plain TS data', () => {
			const tsPacket = buildTsPacket();
			expect(isPngWrappedSegment(tsPacket, 'video/mp2t')).toBe(false);
		});

		it('returns false for legitimate PNG image without TS data', () => {
			const pngHeader = buildMinimalPng();
			const jpegData = new Uint8Array(200).fill(0xff);
			expect(isPngWrappedSegment(concat(pngHeader, jpegData), 'image/png')).toBe(false);
		});

		it('returns false for data shorter than PNG header', () => {
			const short = new Uint8Array(50).fill(0x00);
			expect(isPngWrappedSegment(short, 'image/png')).toBe(false);
		});

		it('returns false for empty data', () => {
			expect(isPngWrappedSegment(new Uint8Array(0), 'image/png')).toBe(false);
		});
	});

	describe('stripPngWrapper', () => {
		it('strips 94-byte PNG wrapper and returns TS data', () => {
			const pngHeader = buildMinimalPng();
			const tsPacket1 = buildTsPacket(0x0000);
			const tsPacket2 = buildTsPacket(0x1000);
			const wrapped = concat(pngHeader, tsPacket1, tsPacket2);

			const result = stripPngWrapper(wrapped);

			expect(result).not.toBeNull();
			expect(result!.length).toBe(376);
			expect(result![0]).toBe(TS_SYNC);
			expect(result![188]).toBe(TS_SYNC);
		});

		it('strips wrapper from real CDN-like data (94-byte PNG + 188-byte TS packets)', () => {
			const pngHeader = buildMinimalPng();
			const packets = Array.from({ length: 10 }, (_, i) => buildTsPacket(i));
			const wrapped = concat(pngHeader, ...packets);

			const result = stripPngWrapper(wrapped);

			expect(result).not.toBeNull();
			expect(result!.length).toBe(1880);
			for (let i = 0; i < 10; i++) {
				expect(result![i * 188]).toBe(TS_SYNC);
			}
		});

		it('handles PNG wrapper with extra padding before TS data', () => {
			const pngHeader = buildMinimalPng();
			const padding = new Uint8Array(100).fill(0x00);
			const tsPacket1 = buildTsPacket();
			const tsPacket2 = buildTsPacket(0x1000);
			const wrapped = concat(pngHeader, padding, tsPacket1, tsPacket2);

			const result = stripPngWrapper(wrapped);

			expect(result).not.toBeNull();
			expect(result![0]).toBe(TS_SYNC);
			expect(result![188]).toBe(TS_SYNC);
		});

		it('returns null if no TS sync byte found after PNG wrapper', () => {
			const pngHeader = buildMinimalPng();
			const garbage = new Uint8Array(1000).fill(0xab);

			const result = stripPngWrapper(concat(pngHeader, garbage));

			expect(result).toBeNull();
		});

		it('returns null for data that is not PNG-wrapped', () => {
			const tsPacket = buildTsPacket();

			const result = stripPngWrapper(tsPacket);

			expect(result).toBeNull();
		});

		it('returns null for empty data', () => {
			expect(stripPngWrapper(new Uint8Array(0))).toBeNull();
		});

		it('returns null for data too short to contain PNG + TS', () => {
			const pngHeader = buildMinimalPng();

			expect(stripPngWrapper(pngHeader)).toBeNull();
		});

		it('returns null if scanned bytes exceed max scan window', () => {
			const pngHeader = buildMinimalPng();
			const lotsOfGarbage = new Uint8Array(10000).fill(0x00);
			const tsPacket = buildTsPacket();
			const wrapped = concat(pngHeader, lotsOfGarbage, tsPacket);

			const result = stripPngWrapper(wrapped, 512);

			expect(result).toBeNull();
		});
	});
});
