import { describe, it, expect } from 'vitest';
import { normalizeJellyfinHdr, normalizeEmbyHdr, buildPlexHdrLabel } from './hdr-normalize.js';

describe('normalizeJellyfinHdr', () => {
	it('should map SDR', () => {
		expect(normalizeJellyfinHdr('SDR')).toBe('SDR');
	});

	it('should map Unknown to SDR', () => {
		expect(normalizeJellyfinHdr('Unknown')).toBe('SDR');
	});

	it('should map HDR10', () => {
		expect(normalizeJellyfinHdr('HDR10')).toBe('HDR10');
	});

	it('should map HDR10Plus', () => {
		expect(normalizeJellyfinHdr('HDR10Plus')).toBe('HDR10+');
	});

	it('should map HLG', () => {
		expect(normalizeJellyfinHdr('HLG')).toBe('HLG');
	});

	it('should map DOVI', () => {
		expect(normalizeJellyfinHdr('DOVI')).toBe('DV');
	});

	it('should map DOVIWithHDR10', () => {
		expect(normalizeJellyfinHdr('DOVIWithHDR10')).toBe('DVHDR10');
	});

	it('should map DOVIWithHLG', () => {
		expect(normalizeJellyfinHdr('DOVIWithHLG')).toBe('DVHLG');
	});

	it('should map DOVIWithSDR', () => {
		expect(normalizeJellyfinHdr('DOVIWithSDR')).toBe('DVSDR');
	});

	it('should map DOVIWithEL to DVHDR10', () => {
		expect(normalizeJellyfinHdr('DOVIWithEL')).toBe('DVHDR10');
	});

	it('should map DOVIWithHDR10Plus', () => {
		expect(normalizeJellyfinHdr('DOVIWithHDR10Plus')).toBe('DVHDR10+');
	});

	it('should map DOVIWithELHDR10Plus', () => {
		expect(normalizeJellyfinHdr('DOVIWithELHDR10Plus')).toBe('DVHDR10+');
	});

	it('should map DOVIInvalid to HDR10', () => {
		expect(normalizeJellyfinHdr('DOVIInvalid')).toBe('HDR10');
	});

	it('should return null for unknown values', () => {
		expect(normalizeJellyfinHdr('SomeFutureFormat')).toBeNull();
	});
});

describe('normalizeEmbyHdr', () => {
	it('should map None to SDR', () => {
		expect(normalizeEmbyHdr('None')).toBe('SDR');
	});

	it('should map Hdr10', () => {
		expect(normalizeEmbyHdr('Hdr10')).toBe('HDR10');
	});

	it('should map Hdr10Plus', () => {
		expect(normalizeEmbyHdr('Hdr10Plus')).toBe('HDR10+');
	});

	it('should map HyperLogGamma to HLG', () => {
		expect(normalizeEmbyHdr('HyperLogGamma')).toBe('HLG');
	});

	it('should map DolbyVision', () => {
		expect(normalizeEmbyHdr('DolbyVision')).toBe('DV');
	});

	it('should return null for unknown values', () => {
		expect(normalizeEmbyHdr('SomethingElse')).toBeNull();
	});
});

describe('buildPlexHdrLabel', () => {
	it('should detect HDR10 from smpte2084 colorTrc', () => {
		expect(
			buildPlexHdrLabel({ doViPresent: false, doViProfile: null, colorTrc: 'smpte2084' })
		).toBe('HDR10');
	});

	it('should detect HLG from arib-std-b67 colorTrc', () => {
		expect(
			buildPlexHdrLabel({ doViPresent: false, doViProfile: null, colorTrc: 'arib-std-b67' })
		).toBe('HLG');
	});

	it('should detect DV when DOVIPresent with no profile', () => {
		expect(buildPlexHdrLabel({ doViPresent: true, doViProfile: null, colorTrc: '' })).toBe('DV');
	});

	it('should detect DVHDR10 for profile 7', () => {
		expect(buildPlexHdrLabel({ doViPresent: true, doViProfile: 7, colorTrc: '' })).toBe('DVHDR10');
	});

	it('should detect DVHDR10 for DV with smpte2084', () => {
		expect(buildPlexHdrLabel({ doViPresent: true, doViProfile: null, colorTrc: 'smpte2084' })).toBe(
			'DVHDR10'
		);
	});

	it('should detect DVHLG for profile 4', () => {
		expect(buildPlexHdrLabel({ doViPresent: true, doViProfile: 4, colorTrc: '' })).toBe('DVHLG');
	});

	it('should detect DVHLG for DV with arib-std-b67', () => {
		expect(
			buildPlexHdrLabel({ doViPresent: true, doViProfile: null, colorTrc: 'arib-std-b67' })
		).toBe('DVHLG');
	});

	it('should detect DVSDR for profile 2', () => {
		expect(buildPlexHdrLabel({ doViPresent: true, doViProfile: 2, colorTrc: '' })).toBe('DVSDR');
	});

	it('should detect DVSDR for profile 3', () => {
		expect(buildPlexHdrLabel({ doViPresent: true, doViProfile: 3, colorTrc: '' })).toBe('DVSDR');
	});

	it('should return null for SDR content', () => {
		expect(
			buildPlexHdrLabel({ doViPresent: false, doViProfile: null, colorTrc: 'bt709' })
		).toBeNull();
	});

	it('should return null for empty colorTrc without DV', () => {
		expect(buildPlexHdrLabel({ doViPresent: false, doViProfile: null, colorTrc: '' })).toBeNull();
	});
});
