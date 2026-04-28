import { describe, it, expect } from 'vitest';
import { collectionTokens } from './collection';

describe('Collection Tokens', () => {
	const collectionToken = collectionTokens.find((t) => t.name === 'Collection')!;
	const cleanToken = collectionTokens.find((t) => t.name === 'CleanCollectionTitle')!;

	it('Collection renders collection name', () => {
		expect(
			collectionToken.render(
				{ title: 'Star Wars', collectionName: 'Star Wars Collection' },
				{} as any
			)
		).toBe('Star Wars Collection');
	});

	it('Collection returns empty when no collection', () => {
		expect(collectionToken.render({ title: 'Fight Club' }, {} as any)).toBe('');
	});

	it('CleanCollectionTitle removes special characters', () => {
		expect(cleanToken.render({ title: 'X', collectionName: 'MCU: Phase 1' }, {} as any)).toBe(
			'MCU Phase 1'
		);
	});

	it('tokens apply to movies only', () => {
		expect(collectionToken.applicability).toEqual(['movie']);
		expect(cleanToken.applicability).toEqual(['movie']);
	});

	it('category is collection', () => {
		expect(collectionToken.category).toBe('collection');
		expect(cleanToken.category).toBe('collection');
	});
});
