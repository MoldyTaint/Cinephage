import { describe, expect, it } from 'vitest';
import { requirementKey } from './language-profile.js';

describe('requirementKey', () => {
	it('returns a stable key over the full requirement tuple', () => {
		expect(requirementKey({ tag: 'pt-BR', variant: 'forced', accessibility: 'require-hi' })).toBe(
			'pt-BR|forced|require-hi'
		);
	});
});
