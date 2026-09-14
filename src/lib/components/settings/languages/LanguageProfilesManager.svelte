<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus, Trash2, Pencil, Star, Globe, ArrowUp, ArrowDown } from 'lucide-svelte';
	import { getResponseErrorMessage } from '$lib/utils/http';
	import {
		ALL_LANGUAGE_OPTIONS,
		getLanguageName as getLanguageNameFromLib
	} from '$lib/shared/languages';
	import type {
		LanguageProfileV2,
		SubtitleAccessibility,
		SubtitleRequirement,
		SubtitleVariant
	} from '$lib/shared/language-profile.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import { SettingsSection } from '$lib/components/ui/settings';
	import {
		ConfirmationModal,
		ModalWrapper,
		ModalHeader,
		ModalFooter
	} from '$lib/components/ui/modal';
	import * as m from '$lib/paraglide/messages.js';
	import {
		createLanguageProfile,
		updateLanguageProfile,
		deleteLanguageProfile,
		ApiError
	} from '$lib/api';

	/** Server-load profile row: v2 shape plus timestamps. */
	interface LanguageProfile extends LanguageProfileV2 {
		createdAt?: string;
		updatedAt?: string;
	}

	interface Props {
		/** All language profiles. */
		profiles: LanguageProfile[];
		/** The default profile id (language_settings.defaultProfileId) for the badge. */
		defaultProfileId: string | null;
	}

	let { profiles, defaultProfileId }: Props = $props();

	// Use centralized language definitions
	const LANGUAGES = ALL_LANGUAGE_OPTIONS;

	const VARIANT_OPTIONS: ReadonlyArray<SubtitleVariant> = ['regular', 'forced', 'both'];

	const ACCESSIBILITY_OPTIONS: ReadonlyArray<SubtitleAccessibility> = [
		'any',
		'prefer-hi',
		'require-hi',
		'exclude-hi'
	];

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingProfile = $state<LanguageProfile | null>(null);
	let saving = $state(false);

	// Form state (v2 profile shape)
	let formName = $state('');
	const MAX_NAME_LENGTH = 20;
	const nameTooLong = $derived(formName.length > MAX_NAME_LENGTH);
	let formAudioPreferOriginal = $state(true);
	let formAudioLanguages = $state<string[]>([]);
	let formSubtitles = $state<SubtitleRequirement[]>([]);
	let formCutoffRank = $state<number | null>(null);
	let formMinimumScore = $state(70);
	let formUpgradesAllowed = $state(true);

	// Delete confirmation
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<LanguageProfile | null>(null);

	function getLanguageName(code: string): string {
		return getLanguageNameFromLib(code);
	}

	function variantLabel(variant: SubtitleVariant): string {
		switch (variant) {
			case 'regular':
				return m.settings_integrations_languageProfiles_variantRegular();
			case 'forced':
				return m.settings_integrations_languageProfiles_variantForced();
			case 'both':
				return m.settings_integrations_languageProfiles_variantBoth();
		}
	}

	function accessibilityLabel(accessibility: SubtitleAccessibility): string {
		switch (accessibility) {
			case 'any':
				return m.settings_integrations_languageProfiles_accessibilityAny();
			case 'prefer-hi':
				return m.settings_integrations_languageProfiles_accessibilityPreferHi();
			case 'require-hi':
				return m.settings_integrations_languageProfiles_accessibilityRequireHi();
			case 'exclude-hi':
				return m.settings_integrations_languageProfiles_accessibilityExcludeHi();
		}
	}

	function makeRequirement(): SubtitleRequirement {
		return { tag: 'en', variant: 'regular', accessibility: 'any' };
	}

	function openAddModal() {
		modalMode = 'add';
		editingProfile = null;
		formName = '';
		formAudioPreferOriginal = true;
		formAudioLanguages = [];
		formSubtitles = [makeRequirement()];
		formCutoffRank = null;
		formMinimumScore = 70;
		formUpgradesAllowed = true;
		modalOpen = true;
	}

	function openEditModal(profile: LanguageProfile) {
		modalMode = 'edit';
		editingProfile = profile;
		formName = profile.name;
		formAudioPreferOriginal = profile.audio?.preferOriginal ?? true;
		formAudioLanguages = [...(profile.audio?.languages ?? [])];
		formSubtitles = (profile.subtitles ?? []).map((requirement) => ({ ...requirement }));
		formCutoffRank = profile.cutoffRank ?? null;
		formMinimumScore = profile.minimumScore ?? 70;
		formUpgradesAllowed = profile.upgradesAllowed ?? true;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingProfile = null;
	}

	// --- Subtitle requirement rows ---
	function addSubtitle() {
		formSubtitles = [...formSubtitles, makeRequirement()];
	}

	function removeSubtitle(index: number) {
		formSubtitles = formSubtitles.filter((_, i) => i !== index);
		if (formCutoffRank === null) return;
		if (formCutoffRank === index) {
			formCutoffRank = null;
		} else if (formCutoffRank > index) {
			formCutoffRank -= 1;
		}
	}

	function updateSubtitle(index: number, field: keyof SubtitleRequirement, value: string) {
		formSubtitles = formSubtitles.map((requirement, i) =>
			i === index ? { ...requirement, [field]: value } : requirement
		);
	}

	function moveSubtitle(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= formSubtitles.length) return;
		const next = [...formSubtitles];
		[next[index], next[target]] = [next[target], next[index]];
		formSubtitles = next;
		// Keep the cutoff pointing at the same requirement after reordering.
		if (formCutoffRank === index) formCutoffRank = target;
		else if (formCutoffRank === target) formCutoffRank = index;
	}

	// --- Audio fallback language list ---
	function addAudioLanguage() {
		formAudioLanguages = [...formAudioLanguages, 'en'];
	}

	function removeAudioLanguage(index: number) {
		formAudioLanguages = formAudioLanguages.filter((_, i) => i !== index);
	}

	function updateAudioLanguage(index: number, value: string) {
		formAudioLanguages = formAudioLanguages.map((code, i) => (i === index ? value : code));
	}

	function moveAudioLanguage(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= formAudioLanguages.length) return;
		const next = [...formAudioLanguages];
		[next[index], next[target]] = [next[target], next[index]];
		formAudioLanguages = next;
	}

	async function handleSave() {
		if (!formName.trim() || formSubtitles.length === 0) {
			toasts.warning(m.settings_integrations_languageProfiles_nameAndLanguageRequired());
			return;
		}
		if (formName.trim().length > MAX_NAME_LENGTH) {
			toasts.warning(
				m.settings_integrations_languageProfiles_nameTooLong({ max: MAX_NAME_LENGTH })
			);
			return;
		}

		saving = true;
		try {
			const payload = {
				name: formName,
				audio: {
					preferOriginal: formAudioPreferOriginal,
					languages: formAudioLanguages
				},
				subtitles: formSubtitles,
				cutoffRank: formCutoffRank,
				minimumScore: formMinimumScore,
				upgradesAllowed: formUpgradesAllowed
			};

			if (modalMode === 'edit' && editingProfile) {
				await updateLanguageProfile(editingProfile.id, payload);
			} else {
				await createLanguageProfile(payload);
			}

			await invalidateAll();
			closeModal();
		} catch (e) {
			if (e instanceof ApiError) {
				toasts.error(getResponseErrorMessage(e.response, 'Failed to save language profile'));
			} else {
				toasts.error(e instanceof Error ? e.message : 'Failed to save language profile');
			}
		} finally {
			saving = false;
		}
	}

	function confirmDelete(profile: LanguageProfile) {
		deleteTarget = profile;
		confirmDeleteOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;
		try {
			await deleteLanguageProfile(deleteTarget.id);
			await invalidateAll();
			confirmDeleteOpen = false;
			deleteTarget = null;
		} catch (error) {
			toasts.error(
				error instanceof ApiError
					? getResponseErrorMessage(error.response, 'Failed to delete language profile')
					: error instanceof Error
						? error.message
						: 'Failed to delete language profile'
			);
		}
	}
</script>

<!-- Profiles List -->
<SettingsSection title={m.settings_integrations_languageProfiles_profiles()} variant="flat">
	{#snippet actions()}
		<button class="btn w-full gap-2 btn-primary btn-sm sm:w-auto" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			{m.settings_integrations_languageProfiles_addProfile()}
		</button>
	{/snippet}

	{#if profiles.length === 0}
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body text-center">
				<Globe class="mx-auto h-12 w-12 text-base-content/30" />
				<p class="text-base-content/70">
					{m.settings_integrations_languageProfiles_noProfiles()}
				</p>
				<p class="text-sm text-base-content/50">
					{m.settings_integrations_languageProfiles_noProfilesHint()}
				</p>
			</div>
		</div>
	{:else}
		<div class="grid gap-3 sm:gap-4">
			{#each profiles as profile (profile.id)}
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body gap-3 p-4 sm:p-6">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<h3 class="card-title flex flex-wrap items-center gap-2 leading-tight">
									<span class="wrap-break-word">{profile.name}</span>
									{#if profile.id === defaultProfileId}
										<span class="badge gap-1 badge-primary">
											<Star class="h-3 w-3" />
											{m.common_default()}
										</span>
									{/if}
								</h3>
								{#if profile.audio?.languages?.length}
									<div class="mt-1 text-xs text-base-content/60">
										{m.settings_integrations_languageProfiles_cardAudioLabel()}
										{profile.audio.preferOriginal
											? m.settings_integrations_languageProfiles_cardAudioPreferOriginal()
											: m.settings_integrations_languageProfiles_cardAudioNoPreference()}
										{#if profile.audio.languages.length}
											&middot;
											{profile.audio.languages.map((code) => getLanguageName(code)).join(', ')}
										{/if}
									</div>
								{/if}
								<div class="mt-2 flex flex-wrap gap-2">
									{#each profile.subtitles as requirement, i (i)}
										<span class="badge badge-outline">
											{getLanguageName(requirement.tag)}
											<span class="ml-1 text-xs">({variantLabel(requirement.variant)})</span>
											{#if requirement.accessibility !== 'any'}
												<span class="ml-1 text-xs"
													>({accessibilityLabel(requirement.accessibility)})</span
												>
											{/if}
											{#if i === profile.cutoffRank}
												<span class="ml-1 text-xs text-warning"
													>{m.settings_integrations_languageProfiles_cutoff()}</span
												>
											{/if}
										</span>
									{/each}
								</div>
								<div class="mt-2 text-sm text-base-content/60">
									<span class="block sm:inline"
										>{m.settings_integrations_languageProfiles_minScore()}: {profile.minimumScore}</span
									>
									<span class="hidden sm:inline"> | </span>
									<span class="block sm:inline">
										{m.settings_integrations_languageProfiles_upgrades()}: {profile.upgradesAllowed
											? m.settings_integrations_languageProfiles_allowed()
											: m.common_disabled()}
									</span>
								</div>
							</div>
							<div class="flex shrink-0 gap-1 sm:gap-2">
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => openEditModal(profile)}
									aria-label={m.settings_integrations_languageProfiles_editProfile()}
								>
									<Pencil class="h-4 w-4" />
								</button>
								<button
									class="btn btn-ghost text-error btn-sm"
									onclick={() => confirmDelete(profile)}
									aria-label={m.settings_integrations_languageProfiles_deleteProfile()}
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</SettingsSection>

<!-- Add/Edit Modal -->
<ModalWrapper
	open={modalOpen}
	onClose={closeModal}
	maxWidth="2xl"
	labelledBy="language-profile-modal-title"
>
	<ModalHeader
		title={modalMode === 'add'
			? m.settings_integrations_languageProfiles_addTitle()
			: m.settings_integrations_languageProfiles_editTitle()}
		onClose={closeModal}
	/>

	<div class="space-y-4">
		<div class="form-control">
			<label class="label" for="profileName">
				<span class="label-text">{m.settings_integrations_languageProfiles_profileName()}</span>
			</label>
			<input
				id="profileName"
				type="text"
				class="input-bordered input"
				bind:value={formName}
				maxlength={MAX_NAME_LENGTH}
				placeholder={m.settings_integrations_languageProfiles_profileNamePlaceholder()}
			/>
			<div class="label py-1">
				<span
					class="label-text-alt text-xs wrap-break-word whitespace-normal {nameTooLong
						? 'text-error'
						: 'text-base-content/60'}"
				>
					{formName.length}/{MAX_NAME_LENGTH}
				</span>
				{#if nameTooLong}
					<span class="label-text-alt text-xs text-error"
						>{m.settings_integrations_languageProfiles_maxChars({ max: MAX_NAME_LENGTH })}</span
					>
				{/if}
			</div>
		</div>

		<!-- Audio -->
		<div class="form-control">
			<span class="label">
				<span class="label-text">{m.settings_integrations_languageProfiles_audioSection()}</span>
			</span>
			<label class="label cursor-pointer justify-start gap-2">
				<input
					type="checkbox"
					class="checkbox checkbox-sm"
					bind:checked={formAudioPreferOriginal}
				/>
				<span class="label-text text-xs"
					>{m.settings_integrations_languageProfiles_preferOriginalAudio()}</span
				>
			</label>
			<div class="mt-2 space-y-2">
				{#each formAudioLanguages as code, i (i)}
					<div class="flex items-center gap-2 rounded-lg bg-base-200 p-2">
						<select
							class="select-bordered select flex-1 select-sm"
							value={code}
							onchange={(e) => updateAudioLanguage(i, e.currentTarget.value)}
							aria-label={m.settings_integrations_languageProfiles_fallbackAudioLanguage()}
						>
							{#each LANGUAGES as lang (lang.code)}
								<option value={lang.code}>{lang.name}</option>
							{/each}
						</select>
						<button
							class="btn btn-ghost btn-sm"
							onclick={() => moveAudioLanguage(i, -1)}
							disabled={i === 0}
							aria-label={m.settings_integrations_languageProfiles_moveAudioLanguageUp()}
						>
							<ArrowUp class="h-4 w-4" />
						</button>
						<button
							class="btn btn-ghost btn-sm"
							onclick={() => moveAudioLanguage(i, 1)}
							disabled={i === formAudioLanguages.length - 1}
							aria-label={m.settings_integrations_languageProfiles_moveAudioLanguageDown()}
						>
							<ArrowDown class="h-4 w-4" />
						</button>
						<button
							class="btn btn-ghost text-error btn-sm"
							onclick={() => removeAudioLanguage(i)}
							aria-label={m.settings_integrations_languageProfiles_removeAudioLanguage()}
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</div>
				{/each}
			</div>
			<button class="btn mt-2 btn-ghost btn-sm" onclick={addAudioLanguage}>
				<Plus class="h-4 w-4" />
				{m.settings_integrations_languageProfiles_addFallbackLanguage()}
			</button>
		</div>

		<!-- Subtitle requirements -->
		<div class="form-control">
			<span class="label">
				<span class="label-text"
					>{m.settings_integrations_languageProfiles_subtitleRequirementsSection()}</span
				>
			</span>
			<label class="label cursor-pointer justify-start gap-2 pb-1">
				<input
					type="radio"
					class="radio radio-sm"
					name="cutoffRank"
					checked={formCutoffRank === null}
					onchange={() => (formCutoffRank = null)}
				/>
				<span class="label-text text-xs">{m.settings_integrations_languageProfiles_noCutoff()}</span
				>
			</label>
			<div class="space-y-2">
				{#each formSubtitles as requirement, i (i)}
					<div class="flex flex-wrap items-center gap-2 rounded-lg bg-base-200 p-2">
						<select
							class="select-bordered select flex-1 select-sm"
							value={requirement.tag}
							onchange={(e) => updateSubtitle(i, 'tag', e.currentTarget.value)}
							aria-label={m.settings_integrations_languageProfiles_subtitleLanguageSelect()}
						>
							{#each LANGUAGES as lang (lang.code)}
								<option value={lang.code}>{lang.name}</option>
							{/each}
						</select>

						<select
							class="select-bordered select select-sm"
							value={requirement.variant}
							onchange={(e) => updateSubtitle(i, 'variant', e.currentTarget.value)}
							aria-label={m.settings_integrations_languageProfiles_subtitleVariantSelect()}
						>
							{#each VARIANT_OPTIONS as option (option)}
								<option value={option}>{variantLabel(option)}</option>
							{/each}
						</select>

						<select
							class="select-bordered select select-sm"
							value={requirement.accessibility}
							onchange={(e) => updateSubtitle(i, 'accessibility', e.currentTarget.value)}
							aria-label={m.settings_integrations_languageProfiles_subtitleAccessibilitySelect()}
						>
							{#each ACCESSIBILITY_OPTIONS as option (option)}
								<option value={option}>{accessibilityLabel(option)}</option>
							{/each}
						</select>

						<label class="label cursor-pointer gap-1">
							<input
								type="radio"
								class="radio radio-sm"
								name="cutoffRank"
								checked={formCutoffRank === i}
								onchange={() => (formCutoffRank = i)}
							/>
							<span class="label-text text-xs"
								>{m.settings_integrations_languageProfiles_stopAfterThis()}</span
							>
						</label>

						<button
							class="btn btn-ghost btn-sm"
							onclick={() => moveSubtitle(i, -1)}
							disabled={i === 0}
							aria-label={m.settings_integrations_languageProfiles_moveRequirementUp()}
						>
							<ArrowUp class="h-4 w-4" />
						</button>
						<button
							class="btn btn-ghost btn-sm"
							onclick={() => moveSubtitle(i, 1)}
							disabled={i === formSubtitles.length - 1}
							aria-label={m.settings_integrations_languageProfiles_moveRequirementDown()}
						>
							<ArrowDown class="h-4 w-4" />
						</button>
						<button
							class="btn btn-ghost text-error btn-sm"
							onclick={() => removeSubtitle(i)}
							disabled={formSubtitles.length === 1}
							aria-label={m.settings_integrations_languageProfiles_removeLanguage()}
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</div>
				{/each}
			</div>
			<button class="btn mt-2 btn-ghost btn-sm" onclick={addSubtitle}>
				<Plus class="h-4 w-4" />
				{m.settings_integrations_languageProfiles_addLanguage()}
			</button>
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="form-control">
				<label class="label" for="minimumScore">
					<span class="label-text">{m.settings_integrations_languageProfiles_minimumScore()}</span>
				</label>
				<input
					id="minimumScore"
					type="number"
					class="input-bordered input"
					bind:value={formMinimumScore}
					min="0"
					max="100"
				/>
				<p class="label">
					<span class="label-text-alt wrap-break-word whitespace-normal">
						{m.settings_integrations_languageProfiles_minimumScoreHelp()}
					</span>
				</p>
			</div>
		</div>

		<div class="flex flex-col gap-2 sm:flex-row sm:gap-4">
			<label class="label cursor-pointer gap-2">
				<input type="checkbox" class="checkbox" bind:checked={formUpgradesAllowed} />
				<span class="label-text">{m.settings_integrations_languageProfiles_allowUpgrades()}</span>
			</label>
		</div>
	</div>

	<ModalFooter
		onCancel={closeModal}
		onSave={handleSave}
		{saving}
		saveDisabled={nameTooLong}
		saveLabel={modalMode === 'add' ? m.action_create() : m.action_save()}
	/>
</ModalWrapper>

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	open={confirmDeleteOpen}
	title={m.ui_modal_confirmTitle()}
	messagePrefix={m.settings_integrations_deleteConfirmPrefix()}
	messageEmphasis={deleteTarget?.name ?? ''}
	messageSuffix={m.settings_integrations_deleteConfirmSuffix()}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
	onConfirm={handleConfirmDelete}
	onCancel={() => (confirmDeleteOpen = false)}
/>
