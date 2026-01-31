/**
 * Preset Loader
 *
 * Loads and parses external list preset definitions from YAML files
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import { logger } from '$lib/logging';
import type { PresetProvider, ExternalListPreset } from './types.js';

const PRESETS_DIR = join(process.cwd(), 'data', 'external-lists', 'presets');

export class PresetLoader {
	private presets: Map<string, ExternalListPreset> = new Map();
	private providers: Map<string, PresetProvider> = new Map();
	private loaded = false;

	/**
	 * Load all preset definitions from YAML files
	 */
	loadPresets(): void {
		if (this.loaded) return;

		logger.info('[PresetLoader] Loading external list presets from ' + PRESETS_DIR);

		try {
			const files = readdirSync(PRESETS_DIR).filter(
				(f) => f.endsWith('.yaml') || f.endsWith('.yml')
			);

			for (const file of files) {
				try {
					const content = readFileSync(join(PRESETS_DIR, file), 'utf-8');
					const provider = load(content) as PresetProvider;

					// Store provider
					this.providers.set(provider.provider, provider);

					// Create individual presets from provider
					for (const preset of provider.presets) {
						const fullPreset: ExternalListPreset = {
							id: `${provider.provider}:${preset.id}`,
							provider: provider.provider,
							providerName: provider.name,
							name: preset.name,
							description: preset.description,
							icon: provider.icon,
							url: preset.url,
							config: preset.config,
							isDefault: preset.default ?? false,
							settings: provider.settings
						};

						this.presets.set(fullPreset.id, fullPreset);
						logger.debug('[PresetLoader] Loaded preset', {
							id: fullPreset.id,
							name: fullPreset.name
						});
					}

					// Create a "custom" preset for providers that allow user-defined lists
					if (provider.settings.length > 0 && provider.presets.length === 0) {
						const customPreset: ExternalListPreset = {
							id: `${provider.provider}:custom`,
							provider: provider.provider,
							providerName: provider.name,
							name: `Custom ${provider.name}`,
							description: `Create a custom ${provider.name} with your own settings`,
							icon: provider.icon,
							isDefault: false,
							settings: provider.settings
						};

						this.presets.set(customPreset.id, customPreset);
						logger.debug('[PresetLoader] Loaded custom preset', {
							id: customPreset.id,
							provider: provider.provider
						});
					}

					logger.info('[PresetLoader] Loaded provider', {
						provider: provider.provider,
						presetCount: provider.presets.length
					});
				} catch (error) {
					logger.error('[PresetLoader] Failed to load preset file', { file, error });
				}
			}

			this.loaded = true;
			logger.info('[PresetLoader] Finished loading presets', { count: this.presets.size });
		} catch (error) {
			logger.error('[PresetLoader] Failed to load presets directory', { error });
		}
	}

	/**
	 * Get all available presets
	 */
	getAllPresets(): ExternalListPreset[] {
		this.loadPresets();
		return Array.from(this.presets.values());
	}

	/**
	 * Get a specific preset by ID
	 */
	getPreset(id: string): ExternalListPreset | undefined {
		this.loadPresets();
		return this.presets.get(id);
	}

	/**
	 * Get all presets for a specific provider
	 */
	getPresetsByProvider(provider: string): ExternalListPreset[] {
		this.loadPresets();
		return Array.from(this.presets.values()).filter((p) => p.provider === provider);
	}

	/**
	 * Get all available providers
	 */
	getProviders(): PresetProvider[] {
		this.loadPresets();
		return Array.from(this.providers.values());
	}

	/**
	 * Get the default preset (first one marked as default, or first available)
	 */
	getDefaultPreset(): ExternalListPreset | undefined {
		this.loadPresets();
		const presets = Array.from(this.presets.values());
		return presets.find((p) => p.isDefault) ?? presets[0];
	}

	/**
	 * Reload presets (useful for hot-reloading in development)
	 */
	reload(): void {
		this.presets.clear();
		this.providers.clear();
		this.loaded = false;
		this.loadPresets();
	}
}

// Singleton instance
export const presetLoader = new PresetLoader();
