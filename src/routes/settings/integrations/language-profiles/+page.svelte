<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Plus, Trash2, Pencil, Star, Globe, CheckCircle } from 'lucide-svelte';
	import type { PageData, ActionData } from './$types';
	import {
		ALL_LANGUAGE_OPTIONS,
		getLanguageName as getLanguageNameFromLib
	} from '$lib/shared/languages';
	import { toasts } from '$lib/stores/toast.svelte';

	interface LanguagePreference {
		code: string;
		forced: boolean;
		hearingImpaired: boolean;
		excludeHi: boolean;
		isCutoff: boolean;
	}

	interface LanguageProfile {
		id: string;
		name: string;
		languages: LanguagePreference[];
		cutoffIndex: number;
		upgradesAllowed: boolean;
		minimumScore: number;
		isDefault: boolean;
	}

	// Use centralized language definitions
	const LANGUAGES = ALL_LANGUAGE_OPTIONS;

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingProfile = $state<LanguageProfile | null>(null);
	let saving = $state(false);

	// Form state
	let formName = $state('');
	const MAX_NAME_LENGTH = 20;
	const nameTooLong = $derived(formName.length > MAX_NAME_LENGTH);
	let formLanguages = $state<LanguagePreference[]>([]);
	let formUpgradesAllowed = $state(true);
	let formIsDefault = $state(false);
	let formCutoffIndex = $state(0);
	let formMinimumScore = $state(80);

	// Settings state (defaults only, effect syncs from props)
	let selectedDefaultProfile = $state('');
	let selectedFallbackLanguage = $state('en');

	// Sync settings from props
	$effect(() => {
		selectedDefaultProfile = data.defaultProfileId || '';
		selectedFallbackLanguage = data.defaultFallbackLanguage || 'en';
	});

	// Delete confirmation
	let confirmDeleteOpen = $state(false);
	let deleteTarget = $state<LanguageProfile | null>(null);

	function getLanguageName(code: string): string {
		return getLanguageNameFromLib(code);
	}

	function openAddModal() {
		modalMode = 'add';
		editingProfile = null;
		formName = '';
		formLanguages = [
			{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
		];
		formUpgradesAllowed = true;
		formIsDefault = false;
		formCutoffIndex = 0;
		formMinimumScore = 80;
		modalOpen = true;
	}

	function openEditModal(profile: LanguageProfile) {
		modalMode = 'edit';
		editingProfile = profile;
		formName = profile.name;
		formLanguages = [...profile.languages];
		formUpgradesAllowed = profile.upgradesAllowed;
		formIsDefault = profile.isDefault;
		formCutoffIndex = profile.cutoffIndex;
		formMinimumScore = profile.minimumScore;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingProfile = null;
	}

	function addLanguage() {
		formLanguages = [
			...formLanguages,
			{ code: 'en', forced: false, hearingImpaired: false, excludeHi: false, isCutoff: false }
		];
	}

	function removeLanguage(index: number) {
		formLanguages = formLanguages.filter((_, i) => i !== index);
	}

	function updateLanguage(index: number, field: keyof LanguagePreference, value: string | boolean) {
		formLanguages = formLanguages.map((lang, i) => {
			if (i === index) {
				return { ...lang, [field]: value };
			}
			return lang;
		});
	}

	async function handleSave() {
		if (!formName.trim() || formLanguages.length === 0) {
			toasts.warning('Please provide a name and at least one language');
			return;
		}
		if (formName.trim().length > MAX_NAME_LENGTH) {
			toasts.warning(`Profile name must be ${MAX_NAME_LENGTH} characters or less`);
			return;
		}

		saving = true;
		try {
			const formData = new FormData();
			formData.append(
				'data',
				JSON.stringify({
					name: formName,
					languages: formLanguages,
					upgradesAllowed: formUpgradesAllowed,
					isDefault: formIsDefault,
					cutoffIndex: formCutoffIndex,
					minimumScore: formMinimumScore
				})
			);

			if (modalMode === 'edit' && editingProfile) {
				formData.append('id', editingProfile.id);
				await fetch('?/updateProfile', {
					method: 'POST',
					body: formData
				});
			} else {
				await fetch('?/createProfile', {
					method: 'POST',
					body: formData
				});
			}

			await invalidateAll();
			closeModal();
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
		const formData = new FormData();
		formData.append('id', deleteTarget.id);
		await fetch('?/deleteProfile', {
			method: 'POST',
			body: formData
		});
		await invalidateAll();
		confirmDeleteOpen = false;
		deleteTarget = null;
	}

	async function handleSaveSettings() {
		const formData = new FormData();
		formData.append('defaultProfileId', selectedDefaultProfile);
		formData.append('fallbackLanguage', selectedFallbackLanguage);
		await fetch('?/updateSettings', {
			method: 'POST',
			body: formData
		});
		await invalidateAll();
	}
</script>

<div class="w-full p-3 sm:p-4">
	<div class="mb-6">
		<h1 class="text-2xl font-bold">Language Profiles</h1>
		<p class="text-base-content/70">
			Define which subtitle languages to search for and their preferences.
		</p>
	</div>

	{#if form?.error}
		<div class="mb-4 alert alert-error">
			<span>{form.error}</span>
		</div>
	{/if}

	{#if form?.success}
		<div class="mb-4 alert alert-success">
			<span>Operation completed successfully!</span>
		</div>
	{/if}

	<!-- Global Settings -->
	<div class="card mb-6 bg-base-100 shadow-xl">
		<div class="card-body p-4 sm:p-6">
			<h2 class="card-title">Default Settings</h2>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="form-control">
					<label class="label" for="defaultProfile">
						<span class="label-text">Default Language Profile</span>
					</label>
					<select
						id="defaultProfile"
						class="select-bordered select"
						bind:value={selectedDefaultProfile}
					>
						<option value="">None</option>
						{#each data.profiles as profile (profile.id)}
							<option value={profile.id}>{profile.name}</option>
						{/each}
					</select>
					<p class="label">
						<span class="label-text-alt wrap-break-word whitespace-normal">
							Applied to new movies and series
						</span>
					</p>
				</div>

				<div class="form-control">
					<label class="label" for="fallbackLanguage">
						<span class="label-text">Fallback Language</span>
					</label>
					<select
						id="fallbackLanguage"
						class="select-bordered select"
						bind:value={selectedFallbackLanguage}
					>
						{#each LANGUAGES as lang (lang.code)}
							<option value={lang.code}>{lang.name}</option>
						{/each}
					</select>
					<p class="label">
						<span class="label-text-alt wrap-break-word whitespace-normal">
							Used when subtitle file language cannot be detected
						</span>
					</p>
				</div>
			</div>

			<div class="mt-4 card-actions justify-stretch sm:justify-end">
				<button class="btn w-full gap-2 btn-sm btn-primary sm:w-auto" onclick={handleSaveSettings}>
					<CheckCircle size={16} />
					Save Settings
				</button>
			</div>
		</div>
	</div>

	<!-- Profiles List -->
	<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<h2 class="text-xl font-semibold">Profiles</h2>
		<button class="btn w-full gap-2 btn-sm btn-primary sm:w-auto" onclick={openAddModal}>
			<Plus class="h-4 w-4" />
			Add Profile
		</button>
	</div>

	{#if data.profiles.length === 0}
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body text-center">
				<Globe class="mx-auto h-12 w-12 text-base-content/30" />
				<p class="text-base-content/70">No language profiles yet.</p>
				<p class="text-sm text-base-content/50">
					Create a profile to define which subtitle languages to search for.
				</p>
			</div>
		</div>
	{:else}
		<div class="grid gap-3 sm:gap-4">
			{#each data.profiles as profile (profile.id)}
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body gap-3 p-4 sm:p-6">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<h3 class="card-title flex flex-wrap items-center gap-2 leading-tight">
									<span class="wrap-break-word">{profile.name}</span>
									{#if profile.isDefault}
										<span class="badge gap-1 badge-primary">
											<Star class="h-3 w-3" />
											Default
										</span>
									{/if}
								</h3>
								<div class="mt-2 flex flex-wrap gap-2">
									{#each profile.languages as lang, i (i)}
										<span class="badge badge-outline">
											{getLanguageName(lang.code)}
											{#if lang.forced}<span class="ml-1 text-xs">(forced)</span>{/if}
											{#if lang.hearingImpaired}<span class="ml-1 text-xs">(HI)</span>{/if}
											{#if i === profile.cutoffIndex}
												<span class="ml-1 text-xs text-warning">cutoff</span>
											{/if}
										</span>
									{/each}
								</div>
								<div class="mt-2 text-sm text-base-content/60">
									<span class="block sm:inline">Min score: {profile.minimumScore}</span>
									<span class="hidden sm:inline"> | </span>
									<span class="block sm:inline">
										Upgrades: {profile.upgradesAllowed ? 'Allowed' : 'Disabled'}
									</span>
								</div>
							</div>
							<div class="flex shrink-0 gap-1 sm:gap-2">
								<button
									class="btn btn-ghost btn-sm"
									onclick={() => openEditModal(profile)}
									aria-label="Edit profile"
								>
									<Pencil class="h-4 w-4" />
								</button>
								<button
									class="btn text-error btn-ghost btn-sm"
									onclick={() => confirmDelete(profile)}
									aria-label="Delete profile"
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
</div>

<!-- Add/Edit Modal -->
{#if modalOpen}
	<div class="modal-open modal">
		<div class="modal-box w-full max-w-[min(42rem,calc(100vw-2rem))] wrap-break-word">
			<h3 class="mb-4 text-lg font-bold">
				{modalMode === 'add' ? 'Add Language Profile' : 'Edit Language Profile'}
			</h3>

			<div class="space-y-4">
				<div class="form-control">
					<label class="label" for="profileName">
						<span class="label-text">Profile Name</span>
					</label>
					<input
						id="profileName"
						type="text"
						class="input-bordered input"
						bind:value={formName}
						maxlength={MAX_NAME_LENGTH}
						placeholder="e.g., English + Spanish"
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
								>Max {MAX_NAME_LENGTH} characters.</span
							>
						{/if}
					</div>
				</div>

				<div class="form-control">
					<span class="label">
						<span class="label-text">Languages</span>
					</span>
					<div class="space-y-2">
						{#each formLanguages as lang, i (i)}
							<div class="flex items-center gap-2 rounded-lg bg-base-200 p-2">
								<select
									class="select-bordered select flex-1 select-sm"
									value={lang.code}
									onchange={(e) => updateLanguage(i, 'code', e.currentTarget.value)}
								>
									{#each LANGUAGES as l (l.code)}
										<option value={l.code}>{l.name}</option>
									{/each}
								</select>

								<label class="label cursor-pointer gap-1">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={lang.forced}
										onchange={(e) => updateLanguage(i, 'forced', e.currentTarget.checked)}
									/>
									<span class="label-text text-xs">Forced</span>
								</label>

								<label class="label cursor-pointer gap-1">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={lang.hearingImpaired}
										onchange={(e) => updateLanguage(i, 'hearingImpaired', e.currentTarget.checked)}
									/>
									<span class="label-text text-xs">HI</span>
								</label>

								<label class="label cursor-pointer gap-1">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={lang.excludeHi}
										onchange={(e) => updateLanguage(i, 'excludeHi', e.currentTarget.checked)}
									/>
									<span class="label-text text-xs">Exclude HI</span>
								</label>

								<button
									class="btn text-error btn-ghost btn-sm"
									onclick={() => removeLanguage(i)}
									disabled={formLanguages.length === 1}
									aria-label="Remove language"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						{/each}
					</div>
					<button class="btn mt-2 btn-ghost btn-sm" onclick={addLanguage}>
						<Plus class="h-4 w-4" />
						Add Language
					</button>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="form-control">
						<label class="label" for="cutoffIndex">
							<span class="label-text">Cutoff Index</span>
						</label>
						<input
							id="cutoffIndex"
							type="number"
							class="input-bordered input"
							bind:value={formCutoffIndex}
							min="0"
							max={formLanguages.length - 1}
						/>
						<p class="label">
							<span class="label-text-alt wrap-break-word whitespace-normal">
								Stop searching after this language index
							</span>
						</p>
					</div>

					<div class="form-control">
						<label class="label" for="minimumScore">
							<span class="label-text">Minimum Score</span>
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
								Auto-download threshold (0-100)
							</span>
						</p>
					</div>
				</div>

				<div class="flex flex-col gap-2 sm:flex-row sm:gap-4">
					<label class="label cursor-pointer gap-2">
						<input type="checkbox" class="checkbox" bind:checked={formUpgradesAllowed} />
						<span class="label-text">Allow upgrades</span>
					</label>

					<label class="label cursor-pointer gap-2">
						<input type="checkbox" class="checkbox" bind:checked={formIsDefault} />
						<span class="label-text">Set as default</span>
					</label>
				</div>
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" onclick={closeModal}>Cancel</button>
				<button class="btn btn-primary" onclick={handleSave} disabled={saving || nameTooLong}>
					{#if saving}
						<span class="loading loading-sm loading-spinner"></span>
					{/if}
					{modalMode === 'add' ? 'Create' : 'Save'}
				</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={closeModal}
			aria-label="Close modal"
		></button>
	</div>
{/if}

<!-- Delete Confirmation Modal -->
{#if confirmDeleteOpen}
	<div class="modal-open modal">
		<div class="modal-box w-full max-w-[min(28rem,calc(100vw-2rem))] wrap-break-word">
			<h3 class="text-lg font-bold">Confirm Delete</h3>
			<p class="py-4">
				Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be
				undone.
			</p>
			<div class="modal-action">
				<button class="btn btn-ghost" onclick={() => (confirmDeleteOpen = false)}>Cancel</button>
				<button class="btn btn-error" onclick={handleConfirmDelete}>Delete</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={() => (confirmDeleteOpen = false)}
			aria-label="Close modal"
		></button>
	</div>
{/if}
