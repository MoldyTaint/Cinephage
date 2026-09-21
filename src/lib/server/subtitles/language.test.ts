import { describe, expect, it } from 'vitest';
import { Language } from './language.js';

describe('Language', () => {
	it('parses base, region, and alias codes consistently', () => {
		expect(Language.fromCode('eng').alpha2).toBe('en');
		expect(Language.fromCode('deu').alpha2).toBe('de');
		expect(Language.fromCode('pt-br').code).toBe('pt-BR');
		expect(Language.parse('pt-br').code).toBe('pt-BR');
		expect(Language.parse('zh-cn').code).toBe('zh-Hans');
	});

	it('keeps forced and HI flags out of the language identity', () => {
		const forced = Language.parse('en.forced');
		expect(forced.forced).toBe(true);
		expect(forced.isEquivalent(Language.fromCode('en'))).toBe(true);
		expect(forced.equals(Language.fromCode('en'))).toBe(false);
	});

	it('serializes file codes with canonical tags', () => {
		expect(Language.fromCode('pt-BR').toFileCode()).toBe('pt-br');
		expect(Language.parse('en.hi').toFileCode()).toBe('en.hi');
		expect(Language.parse('en.forced').toFileCode()).toBe('en.forced');
	});
});
