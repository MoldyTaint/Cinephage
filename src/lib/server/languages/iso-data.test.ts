import { describe, expect, it } from 'vitest';
import { ISO_TO_CANONICAL } from './iso-data.generated.js';

describe('ISO_TO_CANONICAL', () => {
	it('resolves bibliographic and terminologic pairs to the same language', () => {
		expect(ISO_TO_CANONICAL.ger).toBe('de');
		expect(ISO_TO_CANONICAL.deu).toBe('de');
		expect(ISO_TO_CANONICAL.fre).toBe('fr');
		expect(ISO_TO_CANONICAL.fra).toBe('fr');
		expect(ISO_TO_CANONICAL.dut).toBe('nl');
		expect(ISO_TO_CANONICAL.nld).toBe('nl');
		expect(ISO_TO_CANONICAL.chi).toBe('zh');
		expect(ISO_TO_CANONICAL.zho).toBe('zh');
	});

	it('keeps ISO 639-3 codes without a 639-1 equivalent', () => {
		expect(ISO_TO_CANONICAL.ast).toBe('ast');
		expect(ISO_TO_CANONICAL.yue).toBe('yue');
	});

	it('keeps the undetermined code stable', () => {
		expect(ISO_TO_CANONICAL.und).toBe('und');
	});
});
