<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		Save,
		RotateCcw,
		Film,
		Tv,
		ChevronDown,
		ChevronUp,
		Info,
		RefreshCw,
		CheckCircle,
		FileEdit,
		Download,
		Plus,
		Trash2,
		Settings2
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	interface NamingPreset {
		id: string;
		name: string;
		description: string;
		isBuiltIn: boolean;
		config: Record<string, unknown>;
	}

	let { data }: { data: PageData } = $props();

	// Local state for form
	let config = $state({ ...data.config });
	let saving = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);

	// Preview state
	let previews = $state<Record<string, Record<string, string>> | null>(null);
	let loadingPreviews = $state(false);

	// Collapsed sections
	let movieSectionOpen = $state(true);
	let seriesSectionOpen = $state(true);
	let tokensSectionOpen = $state(false);
	let customPresetsSectionOpen = $state(false);

	// Preset state (for custom presets only)
	let presets = $state<NamingPreset[]>([]);
	let selectedPresetId = $state<string>('');
	let loadingPresets = $state(false);
	let showSavePresetModal = $state(false);
	let newPresetName = $state('');
	let newPresetDescription = $state('');
	let savingPreset = $state(false);

	// Track previous media server to detect changes
	let previousMediaServer = data.config.mediaServerIdFormat;

	// Load custom presets on mount
	$effect(() => {
		loadPresets();
	});

	// Auto-apply preset when media server format changes
	$effect(() => {
		const currentServer = config.mediaServerIdFormat;
		if (currentServer !== previousMediaServer) {
			applyBuiltInPreset(currentServer);
			previousMediaServer = currentServer;
		}
	});

	async function applyBuiltInPreset(serverId: string) {
		try {
			const response = await fetch(`/api/naming/presets/${serverId}`);
			if (response.ok) {
				const result = await response.json();
				if (result.preset?.config) {
					// Apply preset config but preserve the current mediaServerIdFormat
					const presetConfig = result.preset.config;
					config = {
						...config,
						...presetConfig,
						mediaServerIdFormat: serverId
					};
				}
			}
		} catch {
			// Ignore errors - just keep current config
		}
	}

	async function loadPresets() {
		loadingPresets = true;
		try {
			const response = await fetch('/api/naming/presets');
			if (response.ok) {
				const result = await response.json();
				presets = result.presets;
			}
		} catch {
			// Ignore preset loading errors
		} finally {
			loadingPresets = false;
		}
	}

	async function applyCustomPreset() {
		if (!selectedPresetId) return;

		try {
			const response = await fetch(`/api/naming/presets/${selectedPresetId}`);
			if (response.ok) {
				const result = await response.json();
				if (result.preset?.config) {
					config = { ...config, ...result.preset.config };
					// Update the previousMediaServer to prevent auto-apply from triggering
					previousMediaServer = config.mediaServerIdFormat;
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Apply preset failed';
		}
	}

	async function saveAsPreset() {
		if (!newPresetName.trim()) return;

		savingPreset = true;
		error = null;

		try {
			const response = await fetch('/api/naming/presets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newPresetName.trim(),
					description: newPresetDescription.trim(),
					config
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save preset');
			}

			await loadPresets();
			showSavePresetModal = false;
			newPresetName = '';
			newPresetDescription = '';
			success = true;
			setTimeout(() => (success = false), 3000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Save preset failed';
		} finally {
			savingPreset = false;
		}
	}

	async function deletePreset(presetId: string, presetName: string) {
		if (!confirm(`Delete preset "${presetName}"?`)) return;

		try {
			const response = await fetch(`/api/naming/presets/${presetId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to delete preset');
			}

			await loadPresets();
			if (selectedPresetId === presetId) {
				selectedPresetId = '';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete preset failed';
		}
	}

	// Get custom presets only (built-in are handled via media server dropdown)
	const customPresets = $derived(presets.filter((p) => !p.isBuiltIn));

	// Check if there are unsaved changes
	const hasChanges = $derived(JSON.stringify(config) !== JSON.stringify(data.config));

	// Load previews on config change
	async function loadPreviews() {
		loadingPreviews = true;
		try {
			const response = await fetch('/api/naming/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ config })
			});
			if (response.ok) {
				const result = await response.json();
				previews = result.previews;
			}
		} catch {
			// Ignore preview errors
		} finally {
			loadingPreviews = false;
		}
	}

	// Debounced preview loading
	let previewTimeout: ReturnType<typeof setTimeout>;
	$effect(() => {
		// This effect runs when config changes
		const _ = JSON.stringify(config);
		clearTimeout(previewTimeout);
		previewTimeout = setTimeout(() => {
			loadPreviews();
		}, 500);

		return () => clearTimeout(previewTimeout);
	});

	async function saveConfig() {
		saving = true;
		error = null;
		success = false;

		try {
			const response = await fetch('/api/naming', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(config)
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save');
			}

			await invalidateAll();
			success = true;
			setTimeout(() => (success = false), 3000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function resetToDefaults() {
		if (!confirm('Reset all naming settings to defaults?')) return;

		saving = true;
		error = null;

		try {
			const response = await fetch('/api/naming', { method: 'DELETE' });

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to reset');
			}

			await invalidateAll();
			config = { ...data.defaults };
			success = true;
			setTimeout(() => (success = false), 3000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Reset failed';
		} finally {
			saving = false;
		}
	}

	function resetField(field: keyof typeof config) {
		(config as Record<string, unknown>)[field] = data.defaults[field];
	}
</script>

<div class="w-full p-4">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">Media Naming</h1>
			<p class="text-base-content/70">
				Configure how media files and folders are named. Uses TRaSH Guides conventions for media
				server compatibility.
			</p>
		</div>
		<div class="flex gap-2">
			<a href="/settings/naming/rename" class="btn gap-2 btn-ghost">
				<FileEdit class="h-4 w-4" />
				Rename Files
			</a>
			<button class="btn gap-2 btn-ghost" onclick={resetToDefaults} disabled={saving}>
				<RotateCcw class="h-4 w-4" />
				Reset to Defaults
			</button>
			<button class="btn gap-2 btn-primary" onclick={saveConfig} disabled={saving || !hasChanges}>
				{#if saving}
					<RefreshCw class="h-4 w-4 animate-spin" />
					Saving...
				{:else if success}
					<CheckCircle class="h-4 w-4" />
					Saved
				{:else}
					<Save class="h-4 w-4" />
					Save Changes
				{/if}
			</button>
		</div>
	</div>

	{#if error}
		<div class="mb-4 alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Options Row -->
	<div class="card mb-6 bg-base-200">
		<div class="card-body p-4">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
				<!-- Media Server ID Format -->
				<div class="form-control">
					<label class="label py-1" for="mediaServerIdFormat">
						<span class="label-text font-medium">Media Server ID Format</span>
					</label>
					<select
						id="mediaServerIdFormat"
						class="select-bordered select select-sm"
						bind:value={config.mediaServerIdFormat}
					>
						<option value="plex">Plex / Emby</option>
						<option value="jellyfin">Jellyfin</option>
					</select>
				</div>

				<!-- Multi-Episode Style -->
				<div class="form-control">
					<label class="label py-1" for="multiEpisodeStyle">
						<span class="label-text font-medium">Multi-Episode Style</span>
					</label>
					<select
						id="multiEpisodeStyle"
						class="select-bordered select select-sm"
						bind:value={config.multiEpisodeStyle}
					>
						<option value="range">Range: S01E01-E03</option>
						<option value="extend">Extend: S01E01E02E03</option>
						<option value="duplicate">Duplicate: S01E01-E02-E03</option>
						<option value="scene">Scene: S01E01E02</option>
						<option value="repeat">Repeat: S01E01</option>
					</select>
				</div>

				<!-- Colon Replacement -->
				<div class="form-control">
					<label class="label py-1" for="colonReplacement">
						<span class="label-text font-medium">Colon Replacement</span>
					</label>
					<select
						id="colonReplacement"
						class="select-bordered select select-sm"
						bind:value={config.colonReplacement}
					>
						<option value="smart">Smart</option>
						<option value="delete">Delete</option>
						<option value="dash">Dash</option>
						<option value="spaceDash">Space Dash</option>
						<option value="spaceDashSpace">Space Dash Space</option>
					</select>
				</div>
			</div>
		</div>
	</div>

	<!-- Custom Presets (collapsed by default) -->
	{#if customPresets.length > 0 || true}
		<div class="card mb-6 bg-base-200">
			<div
				class="card-body cursor-pointer p-4"
				onclick={() => (customPresetsSectionOpen = !customPresetsSectionOpen)}
				onkeydown={(e) =>
					e.key === 'Enter' && (customPresetsSectionOpen = !customPresetsSectionOpen)}
				role="button"
				tabindex="0"
			>
				<div class="flex items-center justify-between">
					<h2 class="card-title gap-2 text-base">
						<Settings2 class="h-4 w-4" />
						Custom Presets
					</h2>
					{#if customPresetsSectionOpen}
						<ChevronUp class="h-5 w-5" />
					{:else}
						<ChevronDown class="h-5 w-5" />
					{/if}
				</div>
			</div>
			{#if customPresetsSectionOpen}
				<div class="card-body border-t border-base-300 pt-4 pb-4">
					<div class="flex flex-wrap items-center gap-4">
						{#if customPresets.length > 0}
							<div class="form-control min-w-[200px] flex-1">
								<select
									id="customPresetSelect"
									class="select-bordered select select-sm"
									bind:value={selectedPresetId}
									disabled={loadingPresets}
								>
									<option value="">Select a custom preset...</option>
									{#each customPresets as preset}
										<option value={preset.id}>{preset.name}</option>
									{/each}
								</select>
							</div>
							<button
								class="btn gap-1 btn-sm btn-primary"
								onclick={applyCustomPreset}
								disabled={!selectedPresetId}
							>
								<Download class="h-4 w-4" />
								Load
							</button>
							{#if selectedPresetId}
								<button
									class="btn gap-1 btn-ghost btn-sm btn-error"
									onclick={() => {
										const preset = customPresets.find((p) => p.id === selectedPresetId);
										if (preset) deletePreset(preset.id, preset.name);
									}}
								>
									<Trash2 class="h-4 w-4" />
								</button>
							{/if}
						{:else}
							<p class="text-sm text-base-content/60">No custom presets yet.</p>
						{/if}
						<button class="btn gap-1 btn-ghost btn-sm" onclick={() => (showSavePresetModal = true)}>
							<Plus class="h-4 w-4" />
							Save Current as Preset
						</button>
					</div>
					{#if selectedPresetId}
						{@const selectedPreset = customPresets.find((p) => p.id === selectedPresetId)}
						{#if selectedPreset?.description}
							<p class="mt-2 text-sm text-base-content/70">{selectedPreset.description}</p>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Settings Column -->
		<div class="space-y-4 lg:col-span-2">
			<!-- Movie Settings -->
			<div class="card bg-base-200">
				<div
					class="card-body cursor-pointer p-4"
					onclick={() => (movieSectionOpen = !movieSectionOpen)}
					onkeydown={(e) => e.key === 'Enter' && (movieSectionOpen = !movieSectionOpen)}
					role="button"
					tabindex="0"
				>
					<div class="flex items-center justify-between">
						<h2 class="card-title gap-2">
							<Film class="h-5 w-5" />
							Movie Naming
						</h2>
						{#if movieSectionOpen}
							<ChevronUp class="h-5 w-5" />
						{:else}
							<ChevronDown class="h-5 w-5" />
						{/if}
					</div>
				</div>
				{#if movieSectionOpen}
					<div class="card-body space-y-4 border-t border-base-300 pt-4">
						<div class="form-control">
							<label class="label" for="movieFolderFormat">
								<span class="label-text font-medium">Folder Format</span>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => resetField('movieFolderFormat')}
								>
									Reset
								</button>
							</label>
							<input
								id="movieFolderFormat"
								type="text"
								class="input-bordered input font-mono text-sm"
								bind:value={config.movieFolderFormat}
							/>
							{#if previews?.movie?.folder}
								<div class="mt-1 truncate font-mono text-xs text-success/80">
									{previews.movie.folder}
								</div>
							{/if}
						</div>

						<div class="form-control">
							<label class="label" for="movieFileFormat">
								<span class="label-text font-medium">File Format</span>
								<button class="btn btn-ghost btn-xs" onclick={() => resetField('movieFileFormat')}>
									Reset
								</button>
							</label>
							<textarea
								id="movieFileFormat"
								class="textarea-bordered textarea font-mono text-sm"
								rows="2"
								bind:value={config.movieFileFormat}
							></textarea>
							{#if previews?.movie?.file}
								<div class="mt-1 font-mono text-xs break-all text-success/80">
									{previews.movie.file}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Series Settings -->
			<div class="card bg-base-200">
				<div
					class="card-body cursor-pointer p-4"
					onclick={() => (seriesSectionOpen = !seriesSectionOpen)}
					onkeydown={(e) => e.key === 'Enter' && (seriesSectionOpen = !seriesSectionOpen)}
					role="button"
					tabindex="0"
				>
					<div class="flex items-center justify-between">
						<h2 class="card-title gap-2">
							<Tv class="h-5 w-5" />
							Series Naming
						</h2>
						{#if seriesSectionOpen}
							<ChevronUp class="h-5 w-5" />
						{:else}
							<ChevronDown class="h-5 w-5" />
						{/if}
					</div>
				</div>
				{#if seriesSectionOpen}
					<div class="card-body space-y-4 border-t border-base-300 pt-4">
						<div class="form-control">
							<label class="label" for="seriesFolderFormat">
								<span class="label-text font-medium">Series Folder Format</span>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => resetField('seriesFolderFormat')}
								>
									Reset
								</button>
							</label>
							<input
								id="seriesFolderFormat"
								type="text"
								class="input-bordered input font-mono text-sm"
								bind:value={config.seriesFolderFormat}
							/>
							{#if previews?.series?.folder}
								<div class="mt-1 truncate font-mono text-xs text-success/80">
									{previews.series.folder}
								</div>
							{/if}
						</div>

						<div class="form-control">
							<label class="label" for="seasonFolderFormat">
								<span class="label-text font-medium">Season Folder Format</span>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => resetField('seasonFolderFormat')}
								>
									Reset
								</button>
							</label>
							<input
								id="seasonFolderFormat"
								type="text"
								class="input-bordered input font-mono text-sm"
								bind:value={config.seasonFolderFormat}
							/>
							{#if previews?.series?.season}
								<div class="mt-1 truncate font-mono text-xs text-success/80">
									{previews.series.season}
								</div>
							{/if}
						</div>

						<div class="form-control">
							<label class="label" for="episodeFileFormat">
								<span class="label-text font-medium">Standard Episode Format</span>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => resetField('episodeFileFormat')}
								>
									Reset
								</button>
							</label>
							<textarea
								id="episodeFileFormat"
								class="textarea-bordered textarea font-mono text-sm"
								rows="2"
								bind:value={config.episodeFileFormat}
							></textarea>
							{#if previews?.episode?.file}
								<div class="mt-1 font-mono text-xs break-all text-success/80">
									{previews.episode.file}
								</div>
							{/if}
						</div>

						<div class="form-control">
							<label class="label" for="dailyEpisodeFormat">
								<span class="label-text font-medium">Daily Show Format</span>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => resetField('dailyEpisodeFormat')}
								>
									Reset
								</button>
							</label>
							<textarea
								id="dailyEpisodeFormat"
								class="textarea-bordered textarea font-mono text-sm"
								rows="2"
								bind:value={config.dailyEpisodeFormat}
							></textarea>
							{#if previews?.daily?.file}
								<div class="mt-1 font-mono text-xs break-all text-success/80">
									{previews.daily.file}
								</div>
							{/if}
						</div>

						<div class="form-control">
							<label class="label" for="animeEpisodeFormat">
								<span class="label-text font-medium">Anime Episode Format</span>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => resetField('animeEpisodeFormat')}
								>
									Reset
								</button>
							</label>
							<textarea
								id="animeEpisodeFormat"
								class="textarea-bordered textarea font-mono text-sm"
								rows="2"
								bind:value={config.animeEpisodeFormat}
							></textarea>
							{#if previews?.anime?.file}
								<div class="mt-1 font-mono text-xs break-all text-success/80">
									{previews.anime.file}
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Token Reference -->
			<div class="card bg-base-200">
				<div
					class="card-body cursor-pointer p-4"
					onclick={() => (tokensSectionOpen = !tokensSectionOpen)}
					onkeydown={(e) => e.key === 'Enter' && (tokensSectionOpen = !tokensSectionOpen)}
					role="button"
					tabindex="0"
				>
					<div class="flex items-center justify-between">
						<h2 class="card-title gap-2">
							<Info class="h-5 w-5" />
							Available Tokens
						</h2>
						{#if tokensSectionOpen}
							<ChevronUp class="h-5 w-5" />
						{:else}
							<ChevronDown class="h-5 w-5" />
						{/if}
					</div>
				</div>
				{#if tokensSectionOpen}
					<div class="card-body space-y-4 border-t border-base-300 pt-4">
						{#each Object.entries(data.tokens) as [category, tokens] (category)}
							<div>
								<h3 class="mb-2 font-medium capitalize">{category}</h3>
								<div class="grid grid-cols-1 gap-1 md:grid-cols-2">
									{#each tokens as { token, description } (token)}
										<div class="flex items-center gap-2 text-sm">
											<code class="rounded bg-base-300 px-1.5 py-0.5 font-mono text-xs"
												>{token}</code
											>
											<span class="text-base-content/70">{description}</span>
										</div>
									{/each}
								</div>
							</div>
						{/each}

						<div class="mt-4 rounded-lg bg-base-300 p-3 text-sm">
							<p class="font-medium">Conditional Blocks:</p>
							<ul class="mt-1 list-inside list-disc space-y-1 text-base-content/70">
								<li>
									<code class="font-mono">{'{[{Token}]}'}</code> - Include brackets only if Token has
									value
								</li>
								<li>
									<code class="font-mono">{'{prefix{Token}suffix}'}</code> - Include prefix/suffix only
									if Token exists
								</li>
								<li>
									<code class="font-mono">{'{-{ReleaseGroup}}'}</code> - Outputs "-GROUP" only if group
									exists
								</li>
							</ul>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Preview Column -->
		<div class="lg:col-span-1">
			<div class="sticky top-4">
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<h2 class="card-title gap-2">
							Live Preview
							{#if loadingPreviews}
								<RefreshCw class="h-4 w-4 animate-spin" />
							{/if}
						</h2>

						{#if previews}
							<div class="space-y-4 text-sm">
								<!-- Movie Preview -->
								<div>
									<h3 class="mb-1 font-medium text-primary">Movie</h3>
									<div class="space-y-1 text-base-content/80">
										<div>
											<span class="text-xs text-base-content/50">Folder:</span>
											<p class="truncate font-mono text-xs">{previews.movie?.folder}</p>
										</div>
										<div>
											<span class="text-xs text-base-content/50">File:</span>
											<p class="font-mono text-xs break-all">{previews.movie?.file}</p>
										</div>
									</div>
								</div>

								<!-- Movie with Edition -->
								<div>
									<h3 class="mb-1 font-medium text-primary">Movie (with Edition)</h3>
									<div class="space-y-1 text-base-content/80">
										<p class="font-mono text-xs break-all">{previews.movieWithEdition?.file}</p>
									</div>
								</div>

								<!-- Series Preview -->
								<div>
									<h3 class="mb-1 font-medium text-secondary">Series</h3>
									<div class="space-y-1 text-base-content/80">
										<div>
											<span class="text-xs text-base-content/50">Series Folder:</span>
											<p class="truncate font-mono text-xs">{previews.series?.folder}</p>
										</div>
										<div>
											<span class="text-xs text-base-content/50">Season Folder:</span>
											<p class="font-mono text-xs">{previews.series?.season}</p>
										</div>
									</div>
								</div>

								<!-- Episode Preview -->
								<div>
									<h3 class="mb-1 font-medium text-secondary">Episode</h3>
									<p class="font-mono text-xs break-all text-base-content/80">
										{previews.episode?.file}
									</p>
								</div>

								<!-- Multi-Episode Preview -->
								<div>
									<h3 class="mb-1 font-medium text-secondary">Multi-Episode</h3>
									<p class="font-mono text-xs break-all text-base-content/80">
										{previews.multiEpisode?.file}
									</p>
								</div>

								<!-- Anime Preview -->
								<div>
									<h3 class="mb-1 font-medium text-accent">Anime</h3>
									<p class="font-mono text-xs break-all text-base-content/80">
										{previews.anime?.file}
									</p>
								</div>

								<!-- Daily Preview -->
								<div>
									<h3 class="mb-1 font-medium text-accent">Daily Show</h3>
									<p class="font-mono text-xs break-all text-base-content/80">
										{previews.daily?.file}
									</p>
								</div>
							</div>
						{:else}
							<p class="text-sm text-base-content/60">Loading preview...</p>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Save Preset Modal -->
{#if showSavePresetModal}
	<div class="modal-open modal">
		<div class="modal-box">
			<h3 class="mb-4 text-lg font-bold">Save Current Settings as Preset</h3>
			<div class="form-control mb-4">
				<label class="label" for="newPresetName">
					<span class="label-text">Preset Name</span>
				</label>
				<input
					id="newPresetName"
					type="text"
					class="input-bordered input"
					placeholder="My Custom Preset"
					bind:value={newPresetName}
				/>
			</div>
			<div class="form-control mb-4">
				<label class="label" for="newPresetDescription">
					<span class="label-text">Description (optional)</span>
				</label>
				<textarea
					id="newPresetDescription"
					class="textarea-bordered textarea"
					placeholder="Description of this preset..."
					bind:value={newPresetDescription}
				></textarea>
			</div>
			<div class="modal-action">
				<button
					class="btn btn-ghost"
					onclick={() => {
						showSavePresetModal = false;
						newPresetName = '';
						newPresetDescription = '';
					}}
				>
					Cancel
				</button>
				<button
					class="btn btn-primary"
					onclick={saveAsPreset}
					disabled={!newPresetName.trim() || savingPreset}
				>
					{#if savingPreset}
						<RefreshCw class="mr-2 h-4 w-4 animate-spin" />
						Saving...
					{:else}
						Save Preset
					{/if}
				</button>
			</div>
		</div>
		<div class="modal-backdrop" onclick={() => (showSavePresetModal = false)}></div>
	</div>
{/if}
