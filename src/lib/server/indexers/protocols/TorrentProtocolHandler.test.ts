import { describe, expect, it } from 'vitest';
import { TorrentProtocolHandler } from './TorrentProtocolHandler';
import type { EnhancedReleaseResult } from '../types/release';
import type { ProtocolContext } from './IProtocolHandler';

function createResult(overrides: Partial<EnhancedReleaseResult> = {}): EnhancedReleaseResult {
	return {
		guid: 'guid-1',
		title: 'Test.Release.2025.1080p.WEB-DL.x264-GROUP',
		downloadUrl: 'https://example.com/download.torrent',
		publishDate: new Date('2026-01-01T00:00:00Z'),
		size: 1024 * 1024 * 1024,
		indexerId: 'indexer-1',
		indexerName: 'Indexer One',
		protocol: 'torrent',
		categories: [],
		parsed: {} as any,
		quality: {} as any,
		totalScore: 100,
		scoreComponents: {} as any,
		rejected: false,
		...overrides
	};
}

function createContext(overrides: Partial<ProtocolContext> = {}): ProtocolContext {
	return {
		indexerId: 'indexer-1',
		indexerName: 'Indexer One',
		baseUrl: 'https://example.com',
		settings: {
			minimumSeeders: 1,
			rejectDeadTorrents: true
		},
		...overrides
	};
}

describe('TorrentProtocolHandler seeder validation', () => {
	it('does not reject when seeder metadata is missing', () => {
		const handler = new TorrentProtocolHandler();
		const result = createResult({
			seeders: undefined,
			leechers: undefined
		});
		const context = createContext();

		expect(handler.shouldReject(result, context)).toBeUndefined();
		expect(handler.calculateScoreAdjustment(result, context)).toBe(0);
	});

	it('still rejects dead torrents when seeders are explicitly reported as 0', () => {
		const handler = new TorrentProtocolHandler();
		const result = createResult({
			seeders: 0,
			leechers: 0
		});
		const context = createContext();

		expect(handler.shouldReject(result, context)).toBe('No seeders available');
		expect(handler.calculateScoreAdjustment(result, context)).toBeLessThan(0);
	});
});
