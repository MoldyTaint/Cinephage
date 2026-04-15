import { describe, expect, it } from 'vitest';
import {
	createNormalizedNamingConfig,
	DEFAULT_NAMING_PRESET_SELECTION,
	normalizeNamingConfig,
	normalizeNamingPresetSelection,
	serializeNamingEditorState
} from './editor-state';

describe('naming editor state helpers', () => {
	it('normalizes blank replaceSpacesWith values', () => {
		expect(normalizeNamingConfig({ replaceSpacesWith: '' }).replaceSpacesWith).toBeUndefined();
		expect(normalizeNamingConfig({ replaceSpacesWith: '   ' }).replaceSpacesWith).toBeUndefined();
		expect(normalizeNamingConfig({ replaceSpacesWith: '.' }).replaceSpacesWith).toBe('.');
	});

	it('fills config defaults before serialization', () => {
		const config = createNormalizedNamingConfig({});
		expect(config.movieFolderFormat.length).toBeGreaterThan(0);
		expect(config.multiEpisodeStyle).toBe('range');
	});

	it('normalizes preset selection defaults', () => {
		expect(normalizeNamingPresetSelection({})).toEqual(DEFAULT_NAMING_PRESET_SELECTION);
		expect(
			normalizeNamingPresetSelection({
				selectedServerPresetId: 'jellyfin',
				selectedStylePresetId: 'scene',
				selectedDetailPresetId: 'detailed',
				selectedCustomPresetId: '   '
			})
		).toEqual({
			selectedServerPresetId: 'jellyfin',
			selectedStylePresetId: 'scene',
			selectedDetailPresetId: 'detailed',
			selectedCustomPresetId: undefined
		});
	});

	it('treats blank and undefined optional values as same editor state', () => {
		const a = serializeNamingEditorState(
			{ replaceSpacesWith: '' },
			DEFAULT_NAMING_PRESET_SELECTION
		);
		const b = serializeNamingEditorState(
			{ replaceSpacesWith: undefined },
			DEFAULT_NAMING_PRESET_SELECTION
		);

		expect(a).toBe(b);
	});
});
