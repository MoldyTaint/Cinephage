/**
 * TemplateEngine Tests
 *
 * Covers whitespace-tolerant tokens, honest validation for unknown tokens,
 * non-token-like brace content, and the :First format spec (issue #497).
 */

import { describe, it, expect } from 'vitest';
import { TemplateEngine } from './TemplateEngine';
import { tokenRegistry } from '../tokens';
import { DEFAULT_NAMING_CONFIG, type NamingConfig, type MediaNamingInfo } from '../NamingService';

const engine = new TemplateEngine(tokenRegistry);

const config: NamingConfig = { ...DEFAULT_NAMING_CONFIG };

const movieInfo: MediaNamingInfo = {
	title: 'The Matrix',
	year: 1999,
	resolution: '1080p',
	source: 'bluray',
	hdr: 'HDR10'
};

describe('TemplateEngine.parse', () => {
	describe('whitespace-tolerant tokens', () => {
		it('parses docs-style tokens with spaces in names', () => {
			const result = engine.parse('{Movie Title} ({Release Year})');
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
			expect(result.tokens.map((t) => t.name)).toEqual(['Movie Title', 'Release Year']);
		});

		it('keeps the raw name and format spec after splitting on the first colon', () => {
			const result = engine.parse('{Movie Title:First}');
			expect(result.tokens).toHaveLength(1);
			expect(result.tokens[0].name).toBe('Movie Title');
			expect(result.tokens[0].formatSpec).toBe('First');
		});

		it('splits format spec on the FIRST colon only', () => {
			const result = engine.parse('{Season:1:2}');
			expect(result.tokens[0].name).toBe('Season');
			expect(result.tokens[0].formatSpec).toBe('1:2');
		});
	});

	describe('honest validation', () => {
		it('reports an ERROR with an alias-aware suggestion for near-miss tokens', () => {
			const result = engine.parse('{Movie Tital}');
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].message).toContain("Unknown token 'Movie Tital'");
			expect(result.errors[0].suggestion).toBe('Movie Title');
		});

		it('reports an ERROR for unknown tokens without a suggestion', () => {
			const result = engine.parse('{Zqxjwv}');
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].message).toBe("Unknown token 'Zqxjwv'");
			expect(result.errors[0].suggestion).toBeUndefined();
		});
	});

	describe('non-token-like brace content', () => {
		it.each(['{ }', '{123}', '{...}', '{...:First}', '{}'])(
			'ignores %s as literal content without errors',
			(format) => {
				const result = engine.parse(`Movie ${format} 1999`);
				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
				expect(result.warnings).toHaveLength(0);
				expect(result.tokens).toHaveLength(0);
			}
		);
	});

	describe('existing conditional behavior unchanged', () => {
		it('detects conditional tokens', () => {
			const result = engine.parse('{[{HDR}]}{edition-{Edition}}{-{ReleaseGroup}}');
			expect(result.valid).toBe(true);
			const conditionalNames = result.tokens.filter((t) => t.isConditional).map((t) => t.name);
			expect(conditionalNames).toEqual(['HDR', 'Edition', 'ReleaseGroup']);
		});

		it('parses zero-padding specs', () => {
			const result = engine.parse('Season {Season:00}');
			expect(result.valid).toBe(true);
			expect(result.tokens[0].name).toBe('Season');
			expect(result.tokens[0].formatSpec).toBe('00');
		});
	});
});

describe('TemplateEngine.render', () => {
	it('renders the docs-advertised first-letter folder pattern', () => {
		const result = engine.render('{Movie Title:First}/{Movie Title} ({Release Year})', movieInfo, config);
		expect(result).toBe('T/The Matrix (1999)');
	});

	it('leaves non-token-like brace content as literal text', () => {
		const result = engine.render('Movie { } {123} {...} end', movieInfo, config);
		expect(result).toBe('Movie { } {123} {...} end');
	});

	it('leaves {...:First}-style non-token content as literal text', () => {
		const result = engine.render('Movie {...:First} end', movieInfo, config);
		expect(result).toBe('Movie {...:First} end');
	});

	it('zero-padding spec unaffected', () => {
		expect(engine.render('{Season:00}', { title: '', seasonNumber: 7 }, config)).toBe('07');
	});

	it('conditional blocks unaffected', () => {
		expect(engine.render('{[{HDR}]}', movieInfo, config)).toBe('[HDR10]');
		expect(engine.render('{edition-{Edition}}', { ...movieInfo, edition: 'Extended' }, config)).toBe(
			'edition-Extended'
		);
	});

	it('conditional blocks drop when token empty', () => {
		expect(engine.render('{[{HDR}]}', { title: 'X' }, config)).toBe('');
	});

	it(':First on empty title renders empty', () => {
		expect(engine.render('{Title:First}', { title: '' }, config)).toBe('');
	});
});
