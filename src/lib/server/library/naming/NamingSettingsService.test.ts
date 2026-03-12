import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NAMING_PRESET_SELECTION } from '$lib/naming/editor-state';

const mockRows = new Map<string, string>();

vi.mock('$lib/server/db', () => {
	const createQuery = () => ({
		all: () => Array.from(mockRows.entries()).map(([key, value]) => ({ key, value })),
		get: () => undefined,
		where(condition: { right: string }) {
			return {
				get: () => {
					const value = mockRows.get(condition.right);
					return value === undefined ? undefined : { key: condition.right, value };
				},
				all: () => {
					const value = mockRows.get(condition.right);
					return value === undefined ? [] : [{ key: condition.right, value }];
				}
			};
		}
	});

	return {
		db: {
			select: () => ({
				from: () => createQuery()
			}),
			insert: () => ({
				values: ({ key, value }: { key: string; value: string }) => ({
					run: () => {
						mockRows.set(key, value);
					}
				})
			}),
			update: () => ({
				set: ({ value }: { value: string }) => ({
					where: (condition: { right: string }) => ({
						run: () => {
							mockRows.set(condition.right, value);
						}
					})
				})
			}),
			delete: () => ({
				run: () => {
					mockRows.clear();
				}
			})
		}
	};
});

describe('NamingSettingsService', () => {
	beforeEach(async () => {
		mockRows.clear();
		vi.resetModules();
	});

	it('returns default preset selection when nothing is stored', async () => {
		const { namingSettingsService } = await import('./NamingSettingsService');
		expect(await namingSettingsService.getPresetSelection()).toEqual(
			DEFAULT_NAMING_PRESET_SELECTION
		);
	});

	it('persists preset selection metadata with naming settings', async () => {
		const { namingSettingsService } = await import('./NamingSettingsService');

		const result = await namingSettingsService.updateSettings({
			config: {
				replaceSpacesWith: '',
				includeReleaseGroup: false
			},
			presetSelection: {
				selectedServerPresetId: 'jellyfin',
				selectedStylePresetId: 'scene',
				selectedDetailPresetId: 'detailed',
				selectedCustomPresetId: 'custom-1'
			}
		});

		expect(result.config.replaceSpacesWith).toBeUndefined();
		expect(result.config.includeReleaseGroup).toBe(false);
		expect(result.presetSelection).toEqual({
			selectedServerPresetId: 'jellyfin',
			selectedStylePresetId: 'scene',
			selectedDetailPresetId: 'detailed',
			selectedCustomPresetId: 'custom-1'
		});
	});
});
