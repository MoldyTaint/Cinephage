import { describe, it, expect } from 'vitest';
import { cleanTitle } from './AlternateTitleService';

describe('cleanTitle', () => {
	describe('Hungarian diacritics (the primary bug fix)', () => {
		it('should strip Hungarian diacritics - Dűne 2', () => {
			expect(cleanTitle('Dűne 2')).toBe('dune 2');
		});

		it('should strip Hungarian diacritics - full title', () => {
			expect(cleanTitle('Dűne: Második rész')).toBe('dune masodik resz');
		});

		it('should handle double acute accent (ű)', () => {
			expect(cleanTitle('Művészet')).toBe('muveszet');
		});

		it('should handle o with double acute (ő)', () => {
			expect(cleanTitle('Szegő')).toBe('szego');
		});
	});

	describe('other Western European diacritics', () => {
		it('should handle German umlauts', () => {
			expect(cleanTitle('Müller')).toBe('muller');
			expect(cleanTitle('Schöne')).toBe('schone');
			expect(cleanTitle('Über')).toBe('uber');
		});

		it('should handle French accented characters', () => {
			expect(cleanTitle('Résumé')).toBe('resume');
			expect(cleanTitle('André')).toBe('andre');
		});

		it('should handle Spanish accented characters', () => {
			expect(cleanTitle('Niño')).toBe('nino');
			expect(cleanTitle('España')).toBe('espana');
			expect(cleanTitle('María')).toBe('maria');
		});
	});

	describe('non-Latin scripts', () => {
		it('should preserve Cyrillic titles for regional tracker searching', () => {
			expect(cleanTitle('Как Деревянко Чехова играл')).toBe('как деревянко чехова играл');
		});

		it('should preserve mixed Latin and Cyrillic titles', () => {
			expect(cleanTitle('How Derevyanko Played / Как Деревянко играл')).toBe(
				'how derevyanko played как деревянко играл'
			);
		});
	});

	describe('basic normalization', () => {
		it('should convert to lowercase', () => {
			expect(cleanTitle('DUNE')).toBe('dune');
			expect(cleanTitle('Movie Title')).toBe('movie title');
		});

		it('should remove "the " prefix when at start', () => {
			expect(cleanTitle('The Matrix')).toBe('matrix');
			expect(cleanTitle('the Dark Knight')).toBe('dark knight');
		});

		it('should replace & with and', () => {
			expect(cleanTitle('Rock & Roll')).toBe('rock and roll');
		});

		it('should remove special quote characters', () => {
			expect(cleanTitle("Rock'n'Roll")).toBe('rocknroll');
			expect(cleanTitle('"Movie Title"')).toBe('movie title');
		});

		it('should replace dots with space', () => {
			expect(cleanTitle('Movie.1999')).toBe('movie 1999');
			expect(cleanTitle('Dune.Part.Two')).toBe('dune part two');
		});

		it('should collapse multiple spaces', () => {
			expect(cleanTitle('Movie    Title')).toBe('movie title');
			expect(cleanTitle('  Movie  ')).toBe('movie');
		});

		it('should trim whitespace', () => {
			expect(cleanTitle('  Movie  ')).toBe('movie');
			expect(cleanTitle('\tMovie\n')).toBe('movie');
		});
	});

	describe('edge cases', () => {
		it('should handle empty string', () => {
			expect(cleanTitle('')).toBe('');
		});

		it('should handle null/undefined gracefully', () => {
			// @ts-expect-error - testing runtime behavior
			expect(cleanTitle(null)).toBe('');
			// @ts-expect-error - testing runtime behavior
			expect(cleanTitle(undefined)).toBe('');
		});

		it('should handle string with only diacritics', () => {
			expect(cleanTitle('ű')).toBe('u');
			expect(cleanTitle('ő')).toBe('o');
		});

		it('should handle numbers', () => {
			expect(cleanTitle('Movie 2')).toBe('movie 2');
			expect(cleanTitle('2024')).toBe('2024');
		});
	});

	describe('real-world movie title examples for nCore/Hungarian matching', () => {
		it('should normalize Dune: Part Two variants for matching', () => {
			expect(cleanTitle('Dune: Part Two')).toBe('dune part two');
			expect(cleanTitle('Dune Part Two')).toBe('dune part two');
			expect(cleanTitle('Dune 2')).toBe('dune 2');
			expect(cleanTitle('Dűne 2')).toBe('dune 2');
			expect(cleanTitle('Dűne: Második rész')).toBe('dune masodik resz');
		});

		it('should allow Hungarian nCore titles to match English search titles', () => {
			const englishSearchTitle = cleanTitle('Dune Part Two');
			const hungarianReleaseTitle = cleanTitle('Dűne 2');
			expect(hungarianReleaseTitle).toBe('dune 2');
			expect(hungarianReleaseTitle).toContain('dune');
			expect(englishSearchTitle).toContain('dune');
		});
	});
});
