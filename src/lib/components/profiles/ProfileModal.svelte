<script lang="ts">
	import type { ScoringProfile, ScoringProfileFormData } from '$lib/types/profile';
	import type { FormatCategory } from '$lib/types/format';
	import { groupFormatScoresByCategory } from '$lib/types/format';
	import { X, Save, Info, Loader2, Settings, Layers } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import { SectionHeader } from '$lib/components/ui/modal';
	import FormatScoreAccordion from './FormatScoreAccordion.svelte';

	interface Props {
		open: boolean;
		mode: 'add' | 'edit' | 'view';
		profile?: ScoringProfile | null;
		/** All profiles available to copy from (built-in + custom) */
		allProfiles: { id: string; name: string; isBuiltIn?: boolean }[];
		/** All available formats for score editing */
		allFormats?: { id: string; name: string; category: FormatCategory }[];
		defaultCopyFromId?: string;
		saving?: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: ScoringProfileFormData) => void;
	}

	let {
		open,
		mode,
		profile = null,
		allProfiles,
		allFormats = [],
		defaultCopyFromId = 'balanced',
		saving = false,
		error = null,
		onClose,
		onSave
	}: Props = $props();

	// Tab state
	let activeTab = $state<'general' | 'formats'>('general');

	// Form state
	let name = $state('');
	let description = $state('');
	let copyFromId = $state<string>('');
	let upgradesAllowed = $state(true);
	// Media-specific size limits (string inputs to preserve cursor/editing)
	let movieMinSizeGbInput = $state('');
	let movieMaxSizeGbInput = $state('');
	let episodeMinSizeMbInput = $state('');
	let episodeMaxSizeMbInput = $state('');
	let isDefault = $state(false);
	// Format scores state
	let formatScores = $state<Record<string, number>>({});

	function coerceLimit(value: number | string | null | undefined): number | null {
		if (value === null || value === undefined) return null;
		if (typeof value === 'number') return Number.isFinite(value) ? value : null;
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}

	const movieMinSizeGbValue = $derived(parseNumberInput(movieMinSizeGbInput));
	const movieMaxSizeGbValue = $derived(parseNumberInput(movieMaxSizeGbInput));
	const episodeMinSizeMbValue = $derived(parseNumberInput(episodeMinSizeMbInput));
	const episodeMaxSizeMbValue = $derived(parseNumberInput(episodeMaxSizeMbInput));

	function stringifyLimit(value: number | null | undefined): string {
		if (value === null || value === undefined) return '';
		return Number.isFinite(value) ? String(value) : '';
	}

	// Initialize form when profile changes
	$effect(() => {
		if (open) {
			if (profile) {
				name = profile.name;
				description = profile.description || '';
				copyFromId = ''; // No copy when editing existing profile
				upgradesAllowed = profile.upgradesAllowed;
				movieMinSizeGbInput = stringifyLimit(coerceLimit(profile.movieMinSizeGb));
				movieMaxSizeGbInput = stringifyLimit(coerceLimit(profile.movieMaxSizeGb));
				episodeMinSizeMbInput = stringifyLimit(coerceLimit(profile.episodeMinSizeMb));
				episodeMaxSizeMbInput = stringifyLimit(coerceLimit(profile.episodeMaxSizeMb));
				isDefault = profile.isDefault;
				// Initialize format scores from profile
				formatScores = { ...(profile.formatScores ?? {}) };
			} else {
				// Reset form for new profile - use provided default
				name = '';
				description = '';
				copyFromId = defaultCopyFromId;
				upgradesAllowed = true;
				movieMinSizeGbInput = '';
				movieMaxSizeGbInput = '';
				episodeMinSizeMbInput = '';
				episodeMaxSizeMbInput = '';
				isDefault = false;
				// For new profiles, start with empty scores (copyFrom is handled server-side)
				formatScores = {};
			}
			// Reset to General tab when opening
			activeTab = 'general';
		}
	});

	const maxDescriptionLength = 70;
	const descriptionTooLong = $derived(description.length > maxDescriptionLength);

	// Convert Record<string, number> to Map<FormatCategory, FormatScoreEntry[]> for accordion
	const groupedFormatScores = $derived(() => {
		const enriched: Record<string, { score: number; formatName: string; formatCategory: string }> =
			{};

		for (const format of allFormats) {
			enriched[format.id] = {
				score: formatScores[format.id] ?? 0,
				formatName: format.name,
				formatCategory: format.category
			};
		}

		return groupFormatScoresByCategory(enriched);
	});

	function handleScoreChange(formatId: string, score: number) {
		formatScores = { ...formatScores, [formatId]: score };
	}

	function normalizeLimit(value: number | string | null | undefined) {
		const coerced = coerceLimit(value);
		if (coerced === null) return null;
		if (coerced === 0 || Number.isNaN(coerced)) return null;
		return coerced;
	}

	function normalizeGbLimit(value: number | string | null | undefined) {
		const coerced = normalizeLimit(value);
		if (coerced === null) return null;
		return Number(coerced.toFixed(2));
	}

	function normalizeMbLimit(value: number | string | null | undefined) {
		const coerced = normalizeLimit(value);
		if (coerced === null) return null;
		return Math.round(coerced);
	}

	function parseNumberInput(value: string): number | null {
		const trimmed = value.trim();
		if (!trimmed) return null;
		if (!/^\d*(\.\d*)?$/.test(trimmed)) return null;
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function sanitizeDecimalInput(value: string, maxDecimals: number): string {
		// Keep only digits and a single dot; enforce max decimals.
		let cleaned = '';
		let dotSeen = false;
		let decimals = 0;
		for (const ch of value) {
			if (ch >= '0' && ch <= '9') {
				if (dotSeen) {
					if (decimals >= maxDecimals) continue;
					decimals += 1;
				}
				cleaned += ch;
				continue;
			}
			if (ch === '.' && !dotSeen && maxDecimals > 0) {
				cleaned += ch;
				dotSeen = true;
			}
		}
		return cleaned;
	}

	function allowDecimalKey(event: KeyboardEvent, currentValue: string, maxDecimals: number) {
		const key = event.key;
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (
			key === 'Backspace' ||
			key === 'Delete' ||
			key === 'ArrowLeft' ||
			key === 'ArrowRight' ||
			key === 'ArrowUp' ||
			key === 'ArrowDown' ||
			key === 'Home' ||
			key === 'End' ||
			key === 'Tab'
		) {
			return;
		}
		if (key === '.') {
			if (maxDecimals === 0 || currentValue.includes('.')) {
				event.preventDefault();
			}
			return;
		}
		if (key >= '0' && key <= '9') {
			if (maxDecimals === 0 && currentValue.includes('.')) {
				event.preventDefault();
				return;
			}
			const dotIndex = currentValue.indexOf('.');
			if (dotIndex !== -1 && currentValue.length - dotIndex - 1 >= maxDecimals) {
				event.preventDefault();
				return;
			}
			return;
		}
		event.preventDefault();
	}

	function sanitizePaste(
		event: ClipboardEvent,
		setter: (value: string) => void,
		maxDecimals: number
	) {
		const text = event.clipboardData?.getData('text') ?? '';
		const cleaned = sanitizeDecimalInput(text, maxDecimals);
		if (cleaned !== text) {
			event.preventDefault();
			setter(cleaned);
		}
	}

	function handleSave() {
		if (descriptionTooLong) {
			return;
		}
		onSave({
			name,
			description: description || undefined,
			copyFromId: copyFromId || undefined, // Only include if creating new profile
			upgradesAllowed,
			movieMinSizeGb: normalizeGbLimit(movieMinSizeGbValue),
			movieMaxSizeGb: normalizeGbLimit(movieMaxSizeGbValue),
			episodeMinSizeMb: normalizeMbLimit(episodeMinSizeMbValue),
			episodeMaxSizeMb: normalizeMbLimit(episodeMaxSizeMbValue),
			isDefault,
			// Include format scores (filter out zeros to keep payload lean)
			formatScores: Object.fromEntries(
				Object.entries(formatScores).filter(([, score]) => score !== 0)
			)
		});
	}

	const isCoreReadonly = $derived(mode === 'view' || (profile?.isBuiltIn ?? false));
	const isFullyReadonly = $derived(mode === 'view');
	const isNewProfile = $derived(mode === 'add');
	const isStreamerProfile = $derived(profile?.id === 'streamer');
	const modalTitle = $derived(
		mode === 'add' ? 'Create Profile' : profile?.isBuiltIn ? 'Edit Size Limits' : 'Edit Profile'
	);

	// Only show Format Scores tab for custom profiles (not built-in) or when creating new
	const showFormatsTab = $derived(!profile?.isBuiltIn && allFormats.length > 0);

	// Separate built-in and custom profiles for the dropdown
	const builtInProfiles = $derived(allProfiles.filter((p) => p.isBuiltIn));
	const customProfiles = $derived(allProfiles.filter((p) => !p.isBuiltIn));
</script>

<ModalWrapper {open} {onClose} maxWidth="3xl" labelledBy="profile-modal-title">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<h3 id="profile-modal-title" class="text-xl font-bold">{modalTitle}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	{#if error}
		<div class="mb-4 alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	<!-- Tab Navigation (only show if formats tab is available) -->
	{#if showFormatsTab}
		<div class="tabs-bordered mb-6 tabs w-full">
			<button
				type="button"
				class="tab-lg tab flex-1 gap-2"
				class:tab-active={activeTab === 'general'}
				onclick={() => (activeTab = 'general')}
			>
				<Settings class="h-4 w-4" />
				General
			</button>
			<button
				type="button"
				class="tab-lg tab flex-1 gap-2"
				class:tab-active={activeTab === 'formats'}
				onclick={() => (activeTab = 'formats')}
			>
				<Layers class="h-4 w-4" />
				Format Scores
			</button>
		</div>
	{/if}

	<!-- Tab Content -->
	{#if activeTab === 'general'}
		<!-- Main Form - Responsive Two Column Layout -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
			<!-- Left Column: Profile Details -->
			<div class="space-y-4">
				<SectionHeader title="Profile" />

				<div class="form-control">
					<label class="label py-1" for="profile-name">
						<span class="label-text">Name</span>
					</label>
					<input
						id="profile-name"
						type="text"
						class="input-bordered input input-sm"
						bind:value={name}
						disabled={isCoreReadonly}
						placeholder="My Custom Profile"
					/>
				</div>

				<div class="form-control">
					<label class="label py-1" for="profile-description">
						<span class="label-text">Description</span>
					</label>
					<textarea
						id="profile-description"
						class="textarea-bordered textarea h-20 resize-none textarea-sm"
						bind:value={description}
						disabled={isCoreReadonly}
						maxlength={maxDescriptionLength}
						placeholder="Describe what this profile is for..."
					></textarea>
					{#if !isCoreReadonly}
						<div class="label py-1">
							<span class="label-text-alt text-xs {descriptionTooLong ? 'text-error' : ''}">
								{description.length}/{maxDescriptionLength}
							</span>
							{#if descriptionTooLong}
								<span class="label-text-alt text-xs text-error">
									Max {maxDescriptionLength} characters.
								</span>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Copy From (only shown when creating new profile) -->
				{#if isNewProfile}
					<div class="form-control">
						<label class="label py-1" for="copy-from">
							<span class="label-text">Copy From</span>
						</label>
						<select id="copy-from" class="select-bordered select select-sm" bind:value={copyFromId}>
							<option value="">Start from scratch</option>
							{#if builtInProfiles.length > 0}
								<optgroup label="Built-in Profiles">
									{#each builtInProfiles as bp (bp.id)}
										<option value={bp.id}>{bp.name}</option>
									{/each}
								</optgroup>
							{/if}
							{#if customProfiles.length > 0}
								<optgroup label="Custom Profiles">
									{#each customProfiles as cp (cp.id)}
										<option value={cp.id}>{cp.name}</option>
									{/each}
								</optgroup>
							{/if}
						</select>
						<div class="label py-1">
							<span class="label-text-alt text-xs">
								{copyFromId
									? 'Format scores will be copied from the selected profile'
									: 'All format scores will start at 0'}
							</span>
						</div>
					</div>
				{/if}

				<!-- Options -->
				<div class="flex gap-4 pt-2">
					<label class="label cursor-pointer gap-2">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							bind:checked={upgradesAllowed}
							disabled={isCoreReadonly}
						/>
						<span class="label-text">Allow Upgrades</span>
					</label>

					{#if !profile?.isBuiltIn}
						<label class="label cursor-pointer gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								bind:checked={isDefault}
								disabled={isFullyReadonly}
							/>
							<span class="label-text">Set as Default</span>
						</label>
					{/if}
				</div>
			</div>

			<!-- Right Column: Size Limits -->
			<div class="space-y-4">
				<SectionHeader title="Size Limits" />

				{#if isStreamerProfile}
					<div class="rounded-lg bg-base-200 p-3 text-xs text-base-content/70">
						<Info class="mr-1 inline h-3 w-3" />
						Streaming profiles use external sources, so size limits are not configurable.
					</div>
				{:else}
					<div class="grid grid-cols-2 gap-2 sm:gap-3">
						<div class="form-control">
							<label class="label py-1" for="movie-min-size">
								<span class="label-text">Movie Min (GB)</span>
							</label>
							<input
								id="movie-min-size"
								type="text"
								inputmode="decimal"
								class="input-bordered input input-sm"
								value={movieMinSizeGbInput}
								oninput={(event) => {
									const target = event.currentTarget as HTMLInputElement;
									movieMinSizeGbInput = sanitizeDecimalInput(target.value, 2);
								}}
								onkeydown={(event) => allowDecimalKey(event, movieMinSizeGbInput, 2)}
								onpaste={(event) =>
									sanitizePaste(
										event,
										(value) => {
											movieMinSizeGbInput = value;
										},
										2
									)}
								disabled={isFullyReadonly}
								placeholder="No min"
							/>
						</div>

						<div class="form-control">
							<label class="label py-1" for="movie-max-size">
								<span class="label-text">Movie Max (GB)</span>
							</label>
							<input
								id="movie-max-size"
								type="text"
								inputmode="decimal"
								class="input-bordered input input-sm"
								value={movieMaxSizeGbInput}
								oninput={(event) => {
									const target = event.currentTarget as HTMLInputElement;
									movieMaxSizeGbInput = sanitizeDecimalInput(target.value, 2);
								}}
								onkeydown={(event) => allowDecimalKey(event, movieMaxSizeGbInput, 2)}
								onpaste={(event) =>
									sanitizePaste(
										event,
										(value) => {
											movieMaxSizeGbInput = value;
										},
										2
									)}
								disabled={isFullyReadonly}
								placeholder="No max"
							/>
						</div>
					</div>

					<div class="grid grid-cols-2 gap-2 sm:gap-3">
						<div class="form-control">
							<label class="label py-1" for="episode-min-size">
								<span class="label-text">Episode Min (MB)</span>
							</label>
							<input
								id="episode-min-size"
								type="text"
								inputmode="decimal"
								class="input-bordered input input-sm"
								value={episodeMinSizeMbInput}
								oninput={(event) => {
									const target = event.currentTarget as HTMLInputElement;
									episodeMinSizeMbInput = sanitizeDecimalInput(target.value, 0);
								}}
								onkeydown={(event) => allowDecimalKey(event, episodeMinSizeMbInput, 0)}
								onpaste={(event) =>
									sanitizePaste(
										event,
										(value) => {
											episodeMinSizeMbInput = value;
										},
										0
									)}
								disabled={isFullyReadonly}
								placeholder="No min"
							/>
							{#if episodeMinSizeMbValue}
								<div class="label py-0">
									<span class="label-text-alt text-xs">
										= {(episodeMinSizeMbValue / 1024).toFixed(2)} GB
									</span>
								</div>
							{/if}
						</div>

						<div class="form-control">
							<label class="label py-1" for="episode-max-size">
								<span class="label-text">Episode Max (MB)</span>
							</label>
							<input
								id="episode-max-size"
								type="text"
								inputmode="decimal"
								class="input-bordered input input-sm"
								value={episodeMaxSizeMbInput}
								oninput={(event) => {
									const target = event.currentTarget as HTMLInputElement;
									episodeMaxSizeMbInput = sanitizeDecimalInput(target.value, 0);
								}}
								onkeydown={(event) => allowDecimalKey(event, episodeMaxSizeMbInput, 0)}
								onpaste={(event) =>
									sanitizePaste(
										event,
										(value) => {
											episodeMaxSizeMbInput = value;
										},
										0
									)}
								disabled={isFullyReadonly}
								placeholder="No max"
							/>
							{#if episodeMaxSizeMbValue}
								<div class="label py-0">
									<span class="label-text-alt text-xs">
										= {(episodeMaxSizeMbValue / 1024).toFixed(2)} GB
									</span>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<div class="rounded-lg bg-base-200 p-3 text-xs text-base-content/70">
					<Info class="mr-1 inline h-3 w-3" />
					For season packs, the average size per episode is calculated.
				</div>
			</div>
		</div>
	{:else if activeTab === 'formats'}
		<div class="py-2">
			{#if isNewProfile && copyFromId}
				<div class="mb-4 alert text-sm alert-info">
					<Info class="h-4 w-4" />
					<span>
						Format scores will be copied from the selected profile when you save. You can edit them
						after creation.
					</span>
				</div>
			{/if}
			<FormatScoreAccordion
				formatScores={groupedFormatScores()}
				readonly={isFullyReadonly}
				onScoreChange={handleScoreChange}
			/>
		</div>
	{/if}

	<!-- Footer -->
	<div class="modal-action mt-6 border-t border-base-300 pt-4">
		<button class="btn btn-ghost" onclick={onClose}>
			{isFullyReadonly ? 'Close' : 'Cancel'}
		</button>
		{#if !isFullyReadonly}
			<button
				class="btn gap-2 btn-primary"
				onclick={handleSave}
				disabled={saving || !name || descriptionTooLong}
			>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Save class="h-4 w-4" />
				{/if}
				Save
			</button>
		{/if}
	</div>
</ModalWrapper>
