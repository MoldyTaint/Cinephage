import { describe, it, expect } from 'vitest';
import {
	generateEpisodeTokenFormats,
	queryContainsEpisodeToken,
	keywordsContainEpisodeToken
} from './search';

describe('Episode Token Helpers', () => {
	describe('generateEpisodeTokenFormats', () => {
		it('generates standard, European, and compact formats for episode search', () => {
			const { tokens } = generateEpisodeTokenFormats(1, 5);

			expect(tokens).toContain('S01E05');
			expect(tokens).toContain('1x05');
			expect(tokens).toContain('01x05');
			expect(tokens).toContain('105'); // Compact format for season < 10
		});

		it('omits compact format for season >= 10', () => {
			const { tokens } = generateEpisodeTokenFormats(10, 5);

			expect(tokens).toContain('S10E05');
			expect(tokens).toContain('10x05');
			expect(tokens).not.toContain('1005'); // Too ambiguous
		});

		it('generates season-only format when no episode provided', () => {
			const { tokens } = generateEpisodeTokenFormats(2);

			expect(tokens).toContain('S02');
			expect(tokens).toHaveLength(1);
		});

		it('generates regex patterns with word boundaries', () => {
			const { patterns } = generateEpisodeTokenFormats(1, 5);

			expect(patterns.some((p) => p.test('Show S01E05'))).toBe(true);
			expect(patterns.some((p) => p.test('Show 1x05'))).toBe(true);
			// Should not match partial
			expect(patterns.some((p) => p.test('S01E050'))).toBe(false);
		});
	});

	describe('queryContainsEpisodeToken', () => {
		it('returns false for undefined query', () => {
			expect(queryContainsEpisodeToken(undefined, 1, 5)).toBe(false);
		});

		it('returns false for empty query', () => {
			expect(queryContainsEpisodeToken('', 1, 5)).toBe(false);
		});

		it('detects standard format S01E05', () => {
			expect(queryContainsEpisodeToken('Breaking Bad S01E05', 1, 5)).toBe(true);
		});

		it('detects lowercase s01e05', () => {
			expect(queryContainsEpisodeToken('Breaking Bad s01e05', 1, 5)).toBe(true);
		});

		it('detects European format 1x05', () => {
			expect(queryContainsEpisodeToken('Breaking Bad 1x05', 1, 5)).toBe(true);
		});

		it('detects padded European format 01x05', () => {
			expect(queryContainsEpisodeToken('Breaking Bad 01x05', 1, 5)).toBe(true);
		});

		it('returns false when episode token does not match season/episode', () => {
			expect(queryContainsEpisodeToken('Breaking Bad S02E10', 1, 5)).toBe(false);
		});

		it('detects season-only format S02', () => {
			expect(queryContainsEpisodeToken('Show S02', 2)).toBe(true);
		});

		it('does not match partial words (S01E05 in S01E050)', () => {
			expect(queryContainsEpisodeToken('Show S01E050', 1, 5)).toBe(false);
		});

		it('handles real-world query: Star Trek Starfleet Academy s01e01', () => {
			expect(queryContainsEpisodeToken('Star Trek Starfleet Academy s01e01', 1, 1)).toBe(true);
		});
	});

	describe('keywordsContainEpisodeToken', () => {
		it('returns false for empty keywords', () => {
			expect(keywordsContainEpisodeToken([], 1, 5)).toBe(false);
		});

		it('detects token in keywords array', () => {
			expect(keywordsContainEpisodeToken(['Show', 'S01E05'], 1, 5)).toBe(true);
		});

		it('is case-insensitive', () => {
			expect(keywordsContainEpisodeToken(['show', 's01e05'], 1, 5)).toBe(true);
		});

		it('detects European format in keywords', () => {
			expect(keywordsContainEpisodeToken(['Show', '1x05'], 1, 5)).toBe(true);
		});

		it('returns false when token does not match', () => {
			expect(keywordsContainEpisodeToken(['Show', 'S02E10'], 1, 5)).toBe(false);
		});
	});
});
