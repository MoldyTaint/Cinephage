/**
 * Kinozal Title Filter Tests
 *
 * Tests the Russian title filtering logic to ensure titles are not
 * over-stripped when parsing Kinozal search results.
 */

import { describe, it, expect } from 'vitest';
import { createFilterEngine } from '../engine/FilterEngine.js';
import type { FilterBlock } from '../schema/yamlDefinition';

// Kinozal title filters - matches the updated kinozal.yaml configuration
const KINOZAL_TITLE_FILTERS: FilterBlock[] = [
	// PHASE 1: Replace release group names
	{ name: 'replace', args: ['Кураж-Бамбей', 'kurazh'] },
	{ name: 'replace', args: ['Кубик в Кубе', 'Kubik'] },
	{ name: 'replace', args: ['Кравец', 'Kravec'] },
	{ name: 'replace', args: ['Пифагор', 'Pifagor'] },
	{ name: 'replace', args: ['Невафильм', 'Nevafilm'] },

	// PHASE 2: Replace audio markers
	{ name: 'replace', args: ['АП', 'AVO'] },
	{ name: 'replace', args: ['ЛО', 'VO'] },
	{ name: 'replace', args: ['ЛД', 'DVO'] },
	{ name: 'replace', args: ['ЛМ', 'MVO'] },
	{ name: 'replace', args: ['ПО', 'VO'] },
	{ name: 'replace', args: ['ПД', 'DVO'] },
	{ name: 'replace', args: ['ПМ', 'MVO'] },
	{ name: 'replace', args: ['ДБ', 'DUB'] },
	{ name: 'replace', args: ['СТ', 'Sub'] },

	// PHASE 3: Extract season/episode info
	{
		name: 're_replace',
		args: [
			'\\((\\d+-*\\d*)\\s+[Сс]езоны?:?\\s+(?:(\\d+-*\\d*)\\s+(?:[Сс]ери[ийя]|выпуски?(?:ов)?)(?:.*\\d+)?)?\\)(.*)\\s+((?:[12][0-9]{3}-?){1,})(.*)',
			'$3 - S$1E$2 - $4 $5'
		]
	},
	{
		name: 're_replace',
		args: [
			'\\((?:(\\d+-*\\d*)\\s+(?:[Сс]ери[ийя]|выпуски?(?:ов)?)(?:.*\\d+)?)?\\)(.*)\\s+((?:[12][0-9]{3}-?){1,})(.*)',
			'$2 - E$1 - $3 $4'
		]
	},

	// PHASE 4: Handle Cyrillic conditionally (only strip specific metadata)
	{
		name: 're_replace',
		args: ['(?i)\\s*\\([^\\)]{0,50}?(?:сезон|сезоны|серии|серия|выпуски?)[^\\)]{0,30}\\)', '']
	},

	// PHASE 5: Normalize quality tags
	{ name: 'replace', args: ['-Rip', 'Rip'] },
	{ name: 'replace', args: ['WEB-DL', 'WEBDL'] },
	{ name: 'replace', args: ['WEBDLRip', 'WEBDL'] },
	{ name: 'replace', args: ['HDTVRip', 'HDTV'] },

	// PHASE 6: Cleanup formatting
	{ name: 'replace', args: [' / ', ' '] },
	{ name: 're_replace', args: ['^-\\s+', ' '] },
	{ name: 're_replace', args: ['\\((\\d+[pi])\\)', '$1'] },
	{
		name: 're_replace',
		args: ['(.*)(Blu-Ray\\s*(?:Disc|EUR|CEE)?)\\s*(\\d+[pi])', '$1 BR-DISK $3']
	}
];

describe('Kinozal Title Filters', () => {
	const engine = createFilterEngine();

	describe('Basic Russian Titles', () => {
		it('should preserve full Russian title with season/episode info', () => {
			const input = 'Встать на ноги (1 сезон 1-8 серии) 2025 WEBRip';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).not.toBe('');
			expect(result).toContain('Встать на ноги');
			expect(result.length).toBeGreaterThan(15);
		});

		it('should preserve Russian title with director name', () => {
			const input = 'Здесь Был Юра (Сергей Малкин) 2025 WEB-DL 1080p';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).not.toBe('');
			expect(result).toContain('Здесь Был Юра');
			expect(result.length).toBeGreaterThan(15);
		});

		it('should preserve simple Russian title', () => {
			const input = 'Название Фильма 2024 WEB-DL 1080p';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).not.toBe('');
			expect(result).toContain('Название Фильма');
		});
	});

	describe('Release Group Replacements', () => {
		it('should replace Кураж-Бамбей with kurazh', () => {
			const input = 'Фильм Кураж-Бамбей 2024 WEBRip';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).toContain('kurazh');
			expect(result).not.toContain('Кураж-Бамбей');
		});

		it('should replace Кубик в Кубе with Kubik', () => {
			const input = 'Сериал Кубик в Кубе 2023 HDTV';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).toContain('Kubik');
			expect(result).not.toContain('Кубик в Кубе');
		});
	});

	describe('Audio Marker Replacements', () => {
		it('should replace audio markers', () => {
			const input = 'Фильм АП ЛО ЛД 2024 WEBRip';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).toContain('AVO');
			expect(result).toContain('VO');
			expect(result).toContain('DVO');
			expect(result).not.toContain('АП');
			expect(result).not.toContain('ЛО');
			expect(result).not.toContain('ЛД');
		});
	});

	describe('Season/Episode Extraction', () => {
		it('should extract SxEx format from Russian season/episode text', () => {
			const input = 'Сериал (3 сезон 5-10 серии) 2024 WEB-DL';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).toContain('Сериал');
			expect(result).toContain('S3');
			expect(result).toContain('E5-10');
		});

		it('should handle episode-only format', () => {
			const input = 'Шоу (8 серий) 2024 HDTV';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).toContain('Шоу');
			expect(result).toContain('E8');
		});
	});

	describe('Quality Tag Normalization', () => {
		it('should normalize WEB-DL to WEBDL', () => {
			const input = 'Фильм 2024 WEB-DL 1080p';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).toContain('WEBDL');
			expect(result).not.toContain('WEB-DL');
		});

		it('should normalize HDTVRip to HDTV', () => {
			const input = 'Сериал 2023 HDTVRip';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).toContain('HDTV');
			expect(result).not.toContain('HDTVRip');
		});

		it('should normalize Blu-Ray formats', () => {
			const input = 'Фильм Blu-Ray Disc 1080p';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).toContain('BR-DISK');
		});
	});

	describe('Edge Cases', () => {
		it('should handle titles with parentheses', () => {
			const input = 'Фильм (Режиссер) 2024 WEBRip';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).not.toBe('');
			expect(result).toContain('Фильм');
		});

		it('should handle titles with slashes', () => {
			const input = 'Фильм / Сезон 1 / Серии 1-10 2024 WEBRip';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).not.toBe('');
			expect(result).toContain('Фильм');
		});

		it('should not strip Russian titles completely', () => {
			// This was the bug - titles became empty or just quality tags
			const input = 'Встать на ноги WEBDL 1080p';
			const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

			expect(result).not.toBe('');
			expect(result).not.toMatch(/^\s*WEBDL\s*$/i);
			expect(result).toContain('Встать на ноги');
		});
	});

	describe('Real-World Examples from Issue #228', () => {
		it('should handle typical Kinozal titles', () => {
			const testCases = [
				{
					input: 'Встать на ноги (1 сезон 1-8 серии) 2025 WEBRip 1080p',
					shouldContain: 'Встать на ноги'
				},
				{
					input: 'Здесь Был Юра (Сергей Малкин) 2025 WEB-DL 1080p',
					shouldContain: 'Здесь Был Юра'
				},
				{
					input: 'Название Фильма 2024 HDTV',
					shouldContain: 'Название Фильма'
				}
			];

			testCases.forEach(({ input, shouldContain }) => {
				const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);
				expect(result).not.toBe('');
				expect(result).toContain(shouldContain);
				expect(result.length).toBeGreaterThan(10);
			});
		});
	});
});

describe('Kinozal Filter Edge Cases', () => {
	const engine = createFilterEngine();

	it('should handle empty input gracefully', () => {
		const result = engine.applyFilters('', KINOZAL_TITLE_FILTERS);
		expect(result).toBe('');
	});

	it('should handle whitespace-only input', () => {
		const result = engine.applyFilters('   \t\n  ', KINOZAL_TITLE_FILTERS);
		expect(result.trim()).toBe('');
	});

	it('should handle very long titles', () => {
		const input =
			'Очень Длинное Название Фильма Которое Может Встретиться В Реальной Жизни 2024 WEB-DL 1080p';
		const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

		expect(result).not.toBe('');
		expect(result).toContain('Очень Длинное Название');
	});

	it('should handle special characters in titles', () => {
		const input = 'Фильм: Подзаголовок - Часть 1 2024 WEBRip';
		const result = engine.applyFilters(input, KINOZAL_TITLE_FILTERS);

		expect(result).not.toBe('');
		expect(result).toContain('Фильм');
	});
});
