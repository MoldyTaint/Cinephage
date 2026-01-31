/**
 * Preset Service
 *
 * Service for managing external list presets
 */

import { presetLoader } from './PresetLoader.js';
import type { ExternalListPreset } from './types.js';

export class PresetService {
	/**
	 * Get all available presets
	 */
	getAllPresets(): ExternalListPreset[] {
		return presetLoader.getAllPresets();
	}

	/**
	 * Get a specific preset by ID
	 */
	getPreset(id: string): ExternalListPreset | undefined {
		return presetLoader.getPreset(id);
	}

	/**
	 * Get presets grouped by provider
	 */
	getPresetsByProvider(): Map<string, ExternalListPreset[]> {
		const presets = this.getAllPresets();
		const grouped = new Map<string, ExternalListPreset[]>();

		for (const preset of presets) {
			const existing = grouped.get(preset.provider) ?? [];
			existing.push(preset);
			grouped.set(preset.provider, existing);
		}

		return grouped;
	}

	/**
	 * Get the default preset
	 */
	getDefaultPreset(): ExternalListPreset | undefined {
		return presetLoader.getDefaultPreset();
	}

	/**
	 * Get preset settings with defaults applied
	 */
	getPresetSettingsWithDefaults(
		presetId: string,
		userSettings?: Record<string, unknown>
	): Record<string, unknown> {
		const preset = this.getPreset(presetId);
		if (!preset) return {};

		const result: Record<string, unknown> = {};

		for (const setting of preset.settings) {
			const userValue = userSettings?.[setting.name];
			result[setting.name] = userValue ?? setting.default;
		}

		return result;
	}

	/**
	 * Validate preset settings
	 */
	validateSettings(
		presetId: string,
		settings: Record<string, unknown>
	): { valid: boolean; errors: string[] } {
		const preset = this.getPreset(presetId);
		if (!preset) {
			return { valid: false, errors: ['Preset not found'] };
		}

		const errors: string[] = [];

		for (const setting of preset.settings) {
			const value = settings[setting.name];

			if (setting.type === 'number' && typeof value === 'number') {
				if (setting.min !== undefined && value < setting.min) {
					errors.push(`${setting.label} must be at least ${setting.min}`);
				}
				if (setting.max !== undefined && value > setting.max) {
					errors.push(`${setting.label} must be at most ${setting.max}`);
				}
			}
		}

		return { valid: errors.length === 0, errors };
	}

	/**
	 * Get preset URL (for presets) or return custom URL
	 */
	getListUrl(presetId: string | undefined, customUrl?: string): string | undefined {
		if (presetId && presetId !== 'custom') {
			const preset = this.getPreset(presetId);
			return preset?.url;
		}
		return customUrl;
	}
}

// Singleton instance
export const presetService = new PresetService();
