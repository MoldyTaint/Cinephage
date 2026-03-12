<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import {
		CheckCircle,
		ChevronDown,
		ChevronUp,
		Download,
		FileEdit,
		Film,
		Info,
		Plus,
		RefreshCw,
		RotateCcw,
		Save,
		Settings2,
		Trash2,
		Tv,
		Wand2,
		X
	} from 'lucide-svelte';
	import type { PageData as GeneratedPageData } from './$types';
	import NamingFormatField from '$lib/components/naming/NamingFormatField.svelte';
	import TokenPicker from '$lib/components/naming/TokenPicker.svelte';
	import { FormInput, FormSelect } from '$lib/components/ui/form';
	import { ModalWrapper } from '$lib/components/ui/modal';
	import {
		createNormalizedNamingConfig,
		getPresetLabelById,
		normalizeNamingPresetSelection,
		serializeNamingEditorState,
		type NamingPresetSelection
	} from '$lib/naming/editor-state';
	import { buildConfigFromSetup, type NamingPreset } from '$lib/naming/setup-presets';

	interface ValidationResult {
		valid: boolean;
		errors: Array<{ position: number; message: string; token?: string }>;
		warnings: Array<{ position: number; message: string; suggestion?: string }>;
		tokens: string[];
	}

	type PageData = GeneratedPageData & {
		presetSelection: NamingPresetSelection;
	};

	const FORMAT_FIELDS = [
		'movieFolderFormat',
		'movieFileFormat',
		'seriesFolderFormat',
		'seasonFolderFormat',
		'episodeFileFormat',
		'dailyEpisodeFormat',
		'animeEpisodeFormat'
	] as const;

	const FORMAT_FIELD_LABELS: Record<(typeof FORMAT_FIELDS)[number], string> = {
		movieFolderFormat: 'Movie folder format',
		movieFileFormat: 'Movie file format',
		seriesFolderFormat: 'Series folder format',
		seasonFolderFormat: 'Season folder format',
		episodeFileFormat: 'Episode file format',
		dailyEpisodeFormat: 'Daily episode format',
		animeEpisodeFormat: 'Anime episode format'
	};

	let { data }: { data: PageData } = $props();

	function buildSetupSignature(selection: NamingPresetSelection) {
		return `${selection.selectedServerPresetId}|${selection.selectedStylePresetId}|${selection.selectedDetailPresetId}`;
	}

	function getDraftPresetSelection(): NamingPresetSelection {
		return normalizeNamingPresetSelection({
			selectedServerPresetId,
			selectedStylePresetId,
			selectedDetailPresetId,
			selectedCustomPresetId: selectedPresetId || undefined
		});
	}

	function applyPresetSelection(selection: NamingPresetSelection) {
		selectedServerPresetId = selection.selectedServerPresetId;
		selectedStylePresetId = selection.selectedStylePresetId;
		selectedDetailPresetId = selection.selectedDetailPresetId;
		selectedPresetId = selection.selectedCustomPresetId ?? '';
		activeSetupSignature = buildSetupSignature(selection);
		setupDirty = false;
		skipNextSetupApply = false;
	}

	let config = $state(createNormalizedNamingConfig({}));
	let savedConfigSnapshot = $state(createNormalizedNamingConfig({}));
	let savedPresetSelection = $state(normalizeNamingPresetSelection());
	let saving = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);

	let previews = $state<Record<string, Record<string, string>> | null>(null);
	let loadingPreviews = $state(false);
	let validationResults = $state<Record<string, ValidationResult>>({});
	let validatingFormats = $state(false);

	let movieSectionOpen = $state(true);
	let seriesSectionOpen = $state(true);
	let customPresetsSectionOpen = $state(true);
	let advancedSectionOpen = $state(false);

	let activeFieldId = $state<string>('');
	let activeContext = $derived<'movie' | 'series' | 'general'>(
		activeFieldId.startsWith('movie')
			? 'movie'
			: activeFieldId.startsWith('series') ||
				  activeFieldId.startsWith('season') ||
				  activeFieldId.startsWith('episode') ||
				  activeFieldId.startsWith('daily') ||
				  activeFieldId.startsWith('anime')
				? 'series'
				: 'general'
	);

	let movieFolderField = $state<NamingFormatField | null>(null);
	let movieFileField = $state<NamingFormatField | null>(null);
	let seriesFolderField = $state<NamingFormatField | null>(null);
	let seasonFolderField = $state<NamingFormatField | null>(null);
	let episodeFileField = $state<NamingFormatField | null>(null);
	let dailyEpisodeField = $state<NamingFormatField | null>(null);
	let animeEpisodeField = $state<NamingFormatField | null>(null);

	function handleFieldFocus(id: string) {
		activeFieldId = id;
	}

	function insertToken(token: string) {
		const fieldMap: Record<string, NamingFormatField | null> = {
			movieFolderFormat: movieFolderField,
			movieFileFormat: movieFileField,
			seriesFolderFormat: seriesFolderField,
			seasonFolderFormat: seasonFolderField,
			episodeFileFormat: episodeFileField,
			dailyEpisodeFormat: dailyEpisodeField,
			animeEpisodeFormat: animeEpisodeField
		};

		const field = fieldMap[activeFieldId];
		if (field) {
			field.insertAtCursor(token);
		}
	}

	let presets = $state<NamingPreset[]>([]);
	let selectedPresetId = $state<string>('');
	let loadingPresets = $state(false);
	let showSavePresetModal = $state(false);
	let newPresetName = $state('');
	let newPresetDescription = $state('');
	let savingPreset = $state(false);
	let selectedServerPresetId = $state('plex');
	let selectedStylePresetId = $state('recommended');
	let selectedDetailPresetId = $state('balanced');
	let activeSetupSignature = $state(buildSetupSignature(normalizeNamingPresetSelection()));
	let setupDirty = $state(false);
	let skipNextSetupApply = $state(false);
	let initializedFromData = $state(false);

	$effect(() => {
		if (initializedFromData) return;

		const initialSavedConfig = createNormalizedNamingConfig(data.config);
		const initialSavedPresetSelection = normalizeNamingPresetSelection(data.presetSelection);

		config = initialSavedConfig;
		savedConfigSnapshot = initialSavedConfig;
		savedPresetSelection = initialSavedPresetSelection;
		applyPresetSelection(initialSavedPresetSelection);
		initializedFromData = true;
	});

	onMount(() => {
		void loadPresets();
	});

	function applySetupPreset(forceConfirm = false) {
		if (
			forceConfirm &&
			setupDirty &&
			!confirm(
				'Change the current setup preset? This will replace the generated naming draft in the form, but will not save yet.'
			)
		) {
			skipNextSetupApply = true;
			return;
		}

		config = createNormalizedNamingConfig({
			...config,
			...buildConfigFromSetup({
				serverId: selectedServerPresetId,
				styleId: selectedStylePresetId,
				detailId: selectedDetailPresetId
			})
		});
		selectedPresetId = '';
		activeSetupSignature = `${selectedServerPresetId}|${selectedStylePresetId}|${selectedDetailPresetId}`;
		setupDirty = false;
		error = null;
	}

	$effect(() => {
		const nextSignature = `${selectedServerPresetId}|${selectedStylePresetId}|${selectedDetailPresetId}`;
		if (nextSignature === activeSetupSignature) return;

		if (skipNextSetupApply) {
			skipNextSetupApply = false;
			[selectedServerPresetId, selectedStylePresetId, selectedDetailPresetId] =
				activeSetupSignature.split('|');
			return;
		}

		applySetupPreset(true);
	});

	async function loadPresets() {
		loadingPresets = true;
		try {
			const response = await fetch('/api/naming/presets');
			if (response.ok) {
				const result = await response.json();
				presets = result.presets;
				if (
					selectedPresetId &&
					!result.presets.some((preset: NamingPreset) => preset.id === selectedPresetId)
				) {
					selectedPresetId = '';
				}
			}
		} catch {
			// Ignore preset loading errors
		} finally {
			loadingPresets = false;
		}
	}

	async function applyCustomPreset() {
		if (!selectedPresetId) return;

		if (
			hasChanges &&
			!confirm(
				'Load this custom preset into your current draft? This will replace the naming fields and options in the form, but will not save yet.'
			)
		) {
			return;
		}

		try {
			error = null;
			const response = await fetch(`/api/naming/presets/${selectedPresetId}`);
			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to load preset');
			}

			const result = await response.json();
			if (result.preset?.config) {
				config = createNormalizedNamingConfig({
					...config,
					...result.preset.config
				});
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
					config: createNormalizedNamingConfig(config)
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save preset');
			}

			await loadPresets();
			closeSavePresetModal();
			success = true;
			setTimeout(() => (success = false), 3000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Save preset failed';
		} finally {
			savingPreset = false;
		}
	}

	function closeSavePresetModal() {
		showSavePresetModal = false;
		newPresetName = '';
		newPresetDescription = '';
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

	const customPresets = $derived(presets.filter((preset) => !preset.isBuiltIn));
	const selectedServerPreset = $derived(
		data.setupPresets.servers.find((preset) => preset.id === selectedServerPresetId)
	);
	const selectedStylePreset = $derived(
		data.setupPresets.styles.find((preset) => preset.id === selectedStylePresetId)
	);
	const selectedDetailPreset = $derived(
		data.setupPresets.details.find((preset) => preset.id === selectedDetailPresetId)
	);
	const draftPresetSelection = $derived(getDraftPresetSelection());
	const hasChanges = $derived(
		serializeNamingEditorState($state.snapshot(config), draftPresetSelection) !==
			serializeNamingEditorState(savedConfigSnapshot, savedPresetSelection)
	);
	const renameHref = $derived(
		hasChanges
			? `/settings/naming/rename?unsaved=1&returnTo=${encodeURIComponent($page.url.pathname)}`
			: '/settings/naming/rename'
	);
	const savedCustomPresetName = $derived(
		getPresetLabelById(customPresets, savedPresetSelection.selectedCustomPresetId)
	);
	const draftCustomPresetName = $derived(getPresetLabelById(customPresets, selectedPresetId));
	const invalidFormatFields = $derived(
		FORMAT_FIELDS.filter((field) => validationResults[field] && !validationResults[field].valid)
	);
	const validationWarningFields = $derived(
		FORMAT_FIELDS.filter((field) => (validationResults[field]?.warnings.length ?? 0) > 0)
	);
	const canSave = $derived(!saving && hasChanges && invalidFormatFields.length === 0);

	$effect(() => {
		const currentSignature = `${selectedServerPresetId}|${selectedStylePresetId}|${selectedDetailPresetId}`;
		setupDirty = currentSignature === activeSetupSignature && hasChanges;
	});

	async function loadPreviews(previewConfig: PageData['config']) {
		loadingPreviews = true;
		try {
			const response = await fetch('/api/naming/preview', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ config: previewConfig })
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

	let validationRequestId = 0;
	async function loadValidation(previewConfig: PageData['config']) {
		validatingFormats = true;
		const requestId = ++validationRequestId;
		try {
			const response = await fetch('/api/naming/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					formats: Object.fromEntries(FORMAT_FIELDS.map((field) => [field, previewConfig[field]]))
				})
			});

			if (response.ok) {
				const result = await response.json();
				if (requestId === validationRequestId) {
					validationResults = result.results ?? {};
				}
			}
		} catch {
			// Ignore validation errors
		} finally {
			if (requestId === validationRequestId) {
				validatingFormats = false;
			}
		}
	}

	let previewTimeout: ReturnType<typeof setTimeout>;
	$effect(() => {
		const previewConfig = createNormalizedNamingConfig($state.snapshot(config));
		clearTimeout(previewTimeout);
		previewTimeout = setTimeout(() => {
			void loadPreviews(previewConfig);
			void loadValidation(previewConfig);
		}, 400);

		return () => clearTimeout(previewTimeout);
	});

	async function saveConfig() {
		saving = true;
		error = null;
		success = false;

		try {
			const normalizedConfig = createNormalizedNamingConfig($state.snapshot(config));
			const presetSelection = getDraftPresetSelection();
			const response = await fetch('/api/naming', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					config: normalizedConfig,
					presetSelection
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to save');
			}

			const result = await response.json();
			savedConfigSnapshot = createNormalizedNamingConfig(result.config);
			savedPresetSelection = normalizeNamingPresetSelection(result.presetSelection);
			config = createNormalizedNamingConfig(result.config);
			applyPresetSelection(savedPresetSelection);
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

			const result = await response.json();
			config = createNormalizedNamingConfig(result.config);
			savedConfigSnapshot = createNormalizedNamingConfig(result.config);
			savedPresetSelection = normalizeNamingPresetSelection(result.presetSelection);
			applyPresetSelection(savedPresetSelection);
			await invalidateAll();
			success = true;
			setTimeout(() => (success = false), 3000);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Reset failed';
		} finally {
			saving = false;
		}
	}

	function resetField(field: keyof typeof config) {
		// @ts-expect-error - dynamic field access
		config[field] = data.defaults[field];
	}
</script>

<svelte:head>
	<title>Media Naming - Settings - Cinephage</title>
</svelte:head>

<div class="naming-settings w-full p-3 sm:p-4 lg:p-6">
	<!-- Header Section -->
	<div class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold sm:text-3xl">Media Naming</h1>
			<p class="mt-1 text-base text-base-content/70">
				Configure how media files and folders are named using TRaSH Guides conventions for Plex and
				Jellyfin compatibility.
			</p>
		</div>
		<div class="flex flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
			<a href={renameHref} class="btn gap-2 btn-ghost btn-sm">
				<FileEdit class="h-4 w-4" />
				<span class="hidden sm:inline">Review Rename Plan</span>
				<span class="sm:hidden">Review</span>
			</a>
			<button class="btn gap-2 btn-ghost btn-sm" onclick={resetToDefaults} disabled={saving}>
				<RotateCcw class="h-4 w-4" />
				<span class="hidden sm:inline">Reset</span>
				<span class="sm:hidden">Reset</span>
			</button>
			<button class="btn gap-2 btn-sm btn-primary" onclick={saveConfig} disabled={!canSave}>
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

	<!-- Alerts -->
	{#if error}
		<div class="mb-4 alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	{#if hasChanges}
		<div class="mb-6 alert alert-warning">
			<div class="flex items-start gap-3">
				<Info class="mt-0.5 h-5 w-5 shrink-0" />
				<div>
					<p class="font-medium">Unsaved Changes</p>
					<p class="text-sm opacity-90">
						The live samples reflect your draft. Save changes before review if you want the rename
						plan to use this version.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Setup Presets Card -->
	<div class="card mb-6 bg-base-200">
		<div class="card-body p-4 sm:p-5">
			<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<div class="flex items-center gap-2">
						<Wand2 class="h-5 w-5 text-primary" />
						<h2 class="card-title text-base">Setup Presets</h2>
					</div>
					<p class="mt-1 text-sm text-base-content/65">
						Choose a starting point for your server and naming style. Applying a preset updates the
						editable fields below and does not save automatically.
					</p>
				</div>
				<div class="rounded-full bg-base-100 px-3 py-1 text-xs font-medium text-base-content/60">
					Presets update the draft only
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<FormSelect
					id="setupServerPreset"
					label="Server Preset"
					bind:value={selectedServerPresetId}
					options={data.setupPresets.servers.map((preset) => ({
						value: preset.id,
						label: preset.name
					}))}
					helpText={selectedServerPreset?.description}
				/>

				<FormSelect
					id="setupStylePreset"
					label="Naming Style"
					bind:value={selectedStylePresetId}
					options={data.setupPresets.styles.map((preset) => ({
						value: preset.id,
						label: preset.name
					}))}
					helpText={selectedStylePreset?.description}
				/>

				<FormSelect
					id="setupDetailPreset"
					label="Detail Level"
					bind:value={selectedDetailPresetId}
					options={data.setupPresets.details.map((preset) => ({
						value: preset.id,
						label: preset.name
					}))}
					helpText={selectedDetailPreset?.description}
				/>
			</div>

			<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div class="rounded-xl border border-base-300 bg-base-100 p-3">
					<p class="text-xs font-semibold tracking-wide text-base-content/50 uppercase">Server</p>
					<p class="mt-1 font-medium">{selectedServerPreset?.name}</p>
					<p class="mt-1 text-sm text-base-content/65">{selectedServerPreset?.description}</p>
				</div>
				<div class="rounded-xl border border-base-300 bg-base-100 p-3">
					<p class="text-xs font-semibold tracking-wide text-base-content/50 uppercase">Style</p>
					<p class="mt-1 font-medium">{selectedStylePreset?.name}</p>
					<p class="mt-1 text-sm text-base-content/65">{selectedStylePreset?.description}</p>
				</div>
				<div class="rounded-xl border border-base-300 bg-base-100 p-3">
					<p class="text-xs font-semibold tracking-wide text-base-content/50 uppercase">Detail</p>
					<p class="mt-1 font-medium">{selectedDetailPreset?.name}</p>
					<p class="mt-1 text-sm text-base-content/65">{selectedDetailPreset?.description}</p>
				</div>
			</div>

			<div class="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
				<div
					class="rounded-xl border border-base-300 bg-base-100 p-3 text-sm text-base-content/70 xl:col-span-2"
				>
					<p class="font-medium">Current saved setup</p>
					<p class="mt-1">
						These preset selectors open on whatever you last saved, so the setup section itself
						shows your current active baseline.
					</p>
					{#if savedCustomPresetName}
						<p class="mt-2 text-xs text-base-content/55">
							Saved custom source: {savedCustomPresetName}
						</p>
					{/if}
					{#if draftCustomPresetName && draftCustomPresetName !== savedCustomPresetName}
						<p class="mt-1 text-xs text-base-content/55">
							Draft custom source: {draftCustomPresetName}
						</p>
					{/if}
				</div>
				<div class="rounded-xl border border-base-300 bg-base-100 p-3 text-sm text-base-content/70">
					<p class="font-medium">Editor health</p>
					<p class="mt-1">
						{#if validatingFormats}
							Checking format syntax and token usage.
						{:else if invalidFormatFields.length > 0}
							Fix {invalidFormatFields.length} invalid format{invalidFormatFields.length === 1
								? ''
								: 's'} before saving.
						{:else if validationWarningFields.length > 0}
							{validationWarningFields.length} format warning{validationWarningFields.length === 1
								? ''
								: 's'} to review.
						{:else}
							All format fields validate cleanly.
						{/if}
					</p>
				</div>
			</div>

			{#if setupDirty}
				<div
					class="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-base-content/75"
				>
					You have edited this preset-generated draft. Switching presets will replace those draft
					values, but nothing will be saved until you use Save Changes.
				</div>
			{/if}
		</div>
	</div>

	<!-- Custom Presets Section -->
	<div class="card mb-6 bg-base-200">
		<button
			type="button"
			class="card-body w-full p-4 text-left"
			onclick={() => (customPresetsSectionOpen = !customPresetsSectionOpen)}
			aria-expanded={customPresetsSectionOpen}
			aria-controls="custom-presets-panel"
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Settings2 class="h-5 w-5 text-secondary" />
					<h2 class="card-title text-base">Custom Presets</h2>
					{#if customPresets.length > 0}
						<span class="badge badge-ghost badge-sm">{customPresets.length}</span>
					{/if}
				</div>
				{#if customPresetsSectionOpen}
					<ChevronUp class="h-5 w-5" />
				{:else}
					<ChevronDown class="h-5 w-5" />
				{/if}
			</div>
		</button>
		{#if customPresetsSectionOpen}
			<div id="custom-presets-panel" class="card-body border-t border-base-300 pt-4">
				<div class="flex flex-wrap items-start gap-3">
					{#if customPresets.length > 0}
						<div class="form-control max-w-md min-w-[200px] flex-1">
							<select
								id="customPresetSelect"
								class="select-bordered select select-sm"
								bind:value={selectedPresetId}
								disabled={loadingPresets}
							>
								<option value="">Select a custom preset...</option>
								{#each customPresets as preset (preset.id)}
									<option value={preset.id}>{preset.name}</option>
								{/each}
							</select>
							{#if selectedPresetId}
								{@const selectedPreset = customPresets.find((p) => p.id === selectedPresetId)}
								{#if selectedPreset?.description}
									<p class="mt-1 text-xs text-base-content/60">{selectedPreset.description}</p>
								{/if}
								<p class="mt-1 text-xs text-base-content/50">
									Loading a preset updates the draft only. Save changes to make it active.
								</p>
							{/if}
						</div>
						<div class="flex items-center gap-2">
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
						</div>
					{:else}
						<p class="py-2 text-sm text-base-content/60">No custom presets saved yet.</p>
					{/if}
					<button
						class="btn ml-auto gap-1 btn-ghost btn-sm"
						onclick={() => (showSavePresetModal = true)}
					>
						<Plus class="h-4 w-4" />
						Save Current as Preset
					</button>
				</div>
				{#if savedCustomPresetName || draftCustomPresetName}
					<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
						<div
							class="rounded-xl border border-base-300 bg-base-100 p-3 text-sm text-base-content/70"
						>
							<p class="font-medium">Saved custom source</p>
							<p class="mt-1">{savedCustomPresetName ?? 'None'}</p>
						</div>
						<div
							class="rounded-xl border border-base-300 bg-base-100 p-3 text-sm text-base-content/70"
						>
							<p class="font-medium">Draft custom source</p>
							<p class="mt-1">{draftCustomPresetName ?? 'None'}</p>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Main Content Grid -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
		<!-- Settings Column -->
		<div class="space-y-4 lg:col-span-2">
			<!-- Movie Settings -->
			<div class="card overflow-hidden bg-base-200">
				<button
					type="button"
					class="card-body w-full p-4 text-left"
					onclick={() => (movieSectionOpen = !movieSectionOpen)}
					aria-expanded={movieSectionOpen}
					aria-controls="movie-naming-panel"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<Film class="h-5 w-5 text-primary" />
							</div>
							<div>
								<h2 class="card-title">Movie Naming</h2>
								<p class="text-sm text-base-content/60">Folder and file name patterns</p>
							</div>
						</div>
						{#if movieSectionOpen}
							<ChevronUp class="h-5 w-5" />
						{:else}
							<ChevronDown class="h-5 w-5" />
						{/if}
					</div>
				</button>
				{#if movieSectionOpen}
					<div id="movie-naming-panel" class="card-body space-y-5 border-t border-base-300 pt-4">
						<NamingFormatField
							id="movieFolderFormat"
							label="Folder Format"
							mode="single"
							bind:this={movieFolderField}
							bind:value={config.movieFolderFormat}
							preview={previews?.movie?.folder}
							onReset={() => resetField('movieFolderFormat')}
							onFocus={handleFieldFocus}
						/>
						<NamingFormatField
							id="movieFileFormat"
							label="File Format"
							mode="multi"
							bind:this={movieFileField}
							bind:value={config.movieFileFormat}
							preview={previews?.movie?.file}
							onReset={() => resetField('movieFileFormat')}
							onFocus={handleFieldFocus}
						/>
					</div>
				{/if}
			</div>

			<!-- Series Settings -->
			<div class="card overflow-hidden bg-base-200">
				<button
					type="button"
					class="card-body w-full p-4 text-left"
					onclick={() => (seriesSectionOpen = !seriesSectionOpen)}
					aria-expanded={seriesSectionOpen}
					aria-controls="series-naming-panel"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
								<Tv class="h-5 w-5 text-secondary" />
							</div>
							<div>
								<h2 class="card-title">Series Naming</h2>
								<p class="text-sm text-base-content/60">Series, season, and episode patterns</p>
							</div>
						</div>
						{#if seriesSectionOpen}
							<ChevronUp class="h-5 w-5" />
						{:else}
							<ChevronDown class="h-5 w-5" />
						{/if}
					</div>
				</button>
				{#if seriesSectionOpen}
					<div id="series-naming-panel" class="card-body space-y-5 border-t border-base-300 pt-4">
						<NamingFormatField
							id="seriesFolderFormat"
							label="Series Folder"
							mode="single"
							bind:this={seriesFolderField}
							bind:value={config.seriesFolderFormat}
							preview={previews?.series?.folder}
							onReset={() => resetField('seriesFolderFormat')}
							onFocus={handleFieldFocus}
						/>
						<NamingFormatField
							id="seasonFolderFormat"
							label="Season Folder"
							mode="single"
							bind:this={seasonFolderField}
							bind:value={config.seasonFolderFormat}
							preview={previews?.series?.season}
							onReset={() => resetField('seasonFolderFormat')}
							onFocus={handleFieldFocus}
						/>
						<NamingFormatField
							id="episodeFileFormat"
							label="Standard Episode"
							mode="multi"
							bind:this={episodeFileField}
							bind:value={config.episodeFileFormat}
							preview={previews?.episode?.file}
							onReset={() => resetField('episodeFileFormat')}
							onFocus={handleFieldFocus}
						/>
						<NamingFormatField
							id="dailyEpisodeFormat"
							label="Daily Show Episode"
							mode="multi"
							bind:this={dailyEpisodeField}
							bind:value={config.dailyEpisodeFormat}
							preview={previews?.daily?.file}
							onReset={() => resetField('dailyEpisodeFormat')}
							onFocus={handleFieldFocus}
						/>
						<NamingFormatField
							id="animeEpisodeFormat"
							label="Anime Episode"
							mode="multi"
							bind:this={animeEpisodeField}
							bind:value={config.animeEpisodeFormat}
							preview={previews?.anime?.file}
							onReset={() => resetField('animeEpisodeFormat')}
							onFocus={handleFieldFocus}
						/>
					</div>
				{/if}
			</div>

			<!-- Advanced Options -->
			<div class="card overflow-hidden bg-base-200">
				<button
					type="button"
					class="card-body w-full p-4 text-left"
					onclick={() => (advancedSectionOpen = !advancedSectionOpen)}
					aria-expanded={advancedSectionOpen}
					aria-controls="advanced-options-panel"
				>
					<div class="flex items-center justify-between">
						<h2 class="card-title text-base">Advanced Options</h2>
						{#if advancedSectionOpen}
							<ChevronUp class="h-5 w-5" />
						{:else}
							<ChevronDown class="h-5 w-5" />
						{/if}
					</div>
				</button>
				{#if advancedSectionOpen}
					<div id="advanced-options-panel" class="card-body border-t border-base-300 pt-4">
						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							<div
								class="rounded-xl border border-base-300 bg-base-100 p-3 sm:col-span-2 lg:col-span-3"
							>
								<p class="text-xs font-semibold tracking-wide text-base-content/50 uppercase">
									Preset-aware options
								</p>
								<p class="mt-1 text-sm text-base-content/65">
									These controls stay editable even after you apply a setup preset, so you can
									fine-tune naming behavior without rebuilding your formats from scratch.
								</p>
							</div>
							<!-- Replace Spaces -->
							<FormInput
								id="replaceSpacesWith"
								label="Replace Spaces With"
								bind:value={config.replaceSpacesWith}
								placeholder="Leave blank for spaces"
								helpText="Blank values are normalized and will not cause false unsaved changes"
							/>

							<FormSelect
								id="multiEpisodeStyle"
								label="Multi-Episode Style"
								bind:value={config.multiEpisodeStyle}
								options={[
									{ value: 'range', label: 'Range' },
									{ value: 'extend', label: 'Extend' },
									{ value: 'duplicate', label: 'Duplicate' },
									{ value: 'repeat', label: 'Repeat' },
									{ value: 'scene', label: 'Scene' }
								]}
								helpText="Controls how files with multiple episode numbers are rendered"
							/>

							<FormSelect
								id="colonReplacement"
								label="Colon Replacement"
								bind:value={config.colonReplacement}
								options={[
									{ value: 'smart', label: 'Smart' },
									{ value: 'delete', label: 'Delete' },
									{ value: 'dash', label: 'Dash' },
									{ value: 'spaceDash', label: 'Space + Dash' },
									{ value: 'spaceDashSpace', label: 'Space + Dash + Space' }
								]}
								helpText="How titles like Title: Subtitle are normalized for the filesystem"
							/>

							<FormSelect
								id="mediaServerIdFormat"
								label="Media Server ID Format"
								bind:value={config.mediaServerIdFormat}
								options={[
									{ value: 'plex', label: 'Plex braces' },
									{ value: 'jellyfin', label: 'Jellyfin brackets' }
								]}
								helpText="Matches folder ID tokens to the media server style you want"
							/>

							<!-- Checkboxes -->
							<div class="space-y-3 sm:col-span-2 lg:col-span-3">
								<label
									class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 px-3 py-2 transition-colors hover:bg-base-300/50"
								>
									<input
										type="checkbox"
										class="checkbox checkbox-sm checkbox-primary"
										bind:checked={config.includeQuality}
									/>
									<span class="label-text">Include quality tokens (e.g., 1080p, BluRay)</span>
								</label>

								<label
									class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 px-3 py-2 transition-colors hover:bg-base-300/50"
								>
									<input
										type="checkbox"
										class="checkbox checkbox-sm checkbox-primary"
										bind:checked={config.includeMediaInfo}
									/>
									<span class="label-text">Include media info (e.g., x264, DTS)</span>
								</label>

								<label
									class="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 px-3 py-2 transition-colors hover:bg-base-300/50"
								>
									<input
										type="checkbox"
										class="checkbox checkbox-sm checkbox-primary"
										bind:checked={config.includeReleaseGroup}
									/>
									<span class="label-text">Include release group</span>
								</label>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Right Column -->
		<div class="lg:col-span-1">
			<div class="space-y-4 lg:sticky lg:top-4">
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<div class="flex items-center justify-between gap-3">
							<h2 class="card-title text-base">Review Outcome</h2>
							{#if validatingFormats}
								<div class="flex items-center gap-2 text-xs text-base-content/60">
									<RefreshCw class="h-3.5 w-3.5 animate-spin text-primary" />
									Validating
								</div>
							{/if}
						</div>
						<div class="mt-4 space-y-3 text-sm text-base-content/70">
							<div class="rounded-xl border border-base-300 bg-base-100 p-3">
								<p class="font-medium">Draft vs saved</p>
								<p class="mt-1">
									{#if hasChanges}
										You have draft changes. Samples update instantly, but rename review uses saved
										settings.
									{:else}
										Draft and saved settings match.
									{/if}
								</p>
							</div>
							<div class="rounded-xl border border-base-300 bg-base-100 p-3">
								<p class="font-medium">Format validation</p>
								{#if invalidFormatFields.length > 0}
									<ul class="mt-2 space-y-1 text-sm text-error">
										{#each invalidFormatFields as field}
											<li>{FORMAT_FIELD_LABELS[field]} has syntax issues.</li>
										{/each}
									</ul>
								{:else if validationWarningFields.length > 0}
									<ul class="mt-2 space-y-1 text-sm text-warning">
										{#each validationWarningFields as field}
											<li>{FORMAT_FIELD_LABELS[field]} has warnings worth reviewing.</li>
										{/each}
									</ul>
								{:else}
									<p class="mt-1">All format fields validate cleanly.</p>
								{/if}
							</div>
							<div class="rounded-xl border border-base-300 bg-base-100 p-3">
								<p class="font-medium">Next step</p>
								<p class="mt-1">
									Save this draft when it looks right, then review the rename plan before applying
									file changes across the library.
								</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Token Picker -->
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<div class="mb-4 flex items-center justify-between gap-3">
							<h2 class="card-title text-base">Token Browser</h2>
							{#if loadingPreviews}
								<div class="flex items-center gap-2 text-xs text-base-content/60">
									<RefreshCw class="h-3.5 w-3.5 animate-spin text-primary" />
									Updating previews
								</div>
							{/if}
						</div>
						<TokenPicker
							tokens={data.tokens}
							{activeFieldId}
							context={activeContext}
							onInsert={insertToken}
						/>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Save Preset Modal -->
<ModalWrapper
	open={showSavePresetModal}
	onClose={closeSavePresetModal}
	maxWidth="md"
	labelledBy="preset-modal-title"
>
	<div class="p-6">
		<div class="mb-4 flex items-center justify-between">
			<h3 id="preset-modal-title" class="text-lg font-bold">Save Preset</h3>
			<button class="btn btn-square btn-ghost btn-sm" onclick={closeSavePresetModal}>
				<X class="h-4 w-4" />
			</button>
		</div>

		<div class="space-y-4">
			<FormInput
				id="newPresetName"
				label="Preset Name"
				bind:value={newPresetName}
				placeholder="My Custom Preset"
				required
			/>

			<div class="form-control">
				<label class="label py-1" for="newPresetDescription">
					<span class="label-text">Description (optional)</span>
				</label>
				<textarea
					id="newPresetDescription"
					class="textarea-bordered textarea"
					placeholder="What this preset is for..."
					bind:value={newPresetDescription}
				></textarea>
			</div>
		</div>

		<div class="modal-action mt-6">
			<button class="btn btn-ghost" onclick={closeSavePresetModal}>Cancel</button>
			<button
				class="btn gap-2 btn-primary"
				onclick={saveAsPreset}
				disabled={!newPresetName.trim() || savingPreset}
			>
				{#if savingPreset}
					<RefreshCw class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					<Save class="h-4 w-4" />
					Save Preset
				{/if}
			</button>
		</div>
	</div>
</ModalWrapper>
