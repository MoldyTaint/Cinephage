<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import type { ScoringProfile, ScoringProfileFormData } from '$lib/types/profile';
	import type { UICustomFormat } from '$lib/types/format';
	import type { CustomFormatFormData } from '$lib/components/formats';
	import { ProfileList, ProfileModal } from '$lib/components/profiles';
	import { FormatList, CustomFormatModal } from '$lib/components/formats';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { SettingsPage } from '$lib/components/ui/settings';
	import { toasts } from '$lib/stores/toast.svelte';
	import { Sliders, Layers, Clock, Plus, Pencil, Trash2 } from 'lucide-svelte';
	import { ModalWrapper, ModalHeader, ModalFooter } from '$lib/components/ui/modal';
	import { getResponseErrorMessage } from '$lib/utils/http';
	import {
		createScoringProfile,
		updateScoringProfile,
		deleteScoringProfile
	} from '$lib/api/settings.js';
	import { createCustomFormat, updateCustomFormat, deleteCustomFormat } from '$lib/api/indexers.js';
	import type {
		ScoringProfileCreate,
		ScoringProfileUpdate,
		CustomFormatCreate,
		CustomFormatUpdateBody
	} from '$lib/validation/schemas.js';

	let { data }: { data: PageData } = $props();

	// Tab state - derived from URL
	const activeTab = $derived(page.url.searchParams.get('tab') || 'profiles');

	function setTab(tab: string) {
		const url = new URL(page.url);
		url.searchParams.set('tab', tab);
		goto(url.toString(), { replaceState: true });
	}

	// ===================
	// Profile Modal State
	// ===================
	let profileModalOpen = $state(false);
	let profileModalMode = $state<'add' | 'edit' | 'view'>('add');
	let selectedProfile = $state<ScoringProfile | null>(null);
	let profileSaving = $state(false);
	let profileError = $state<string | null>(null);
	let profileErrorPrefix = $state<string | null>(null);
	let profileErrorEmphasis = $state<string | null>(null);
	let profileErrorSuffix = $state<string | null>(null);

	// Profile delete confirmation
	let profileDeleteConfirmOpen = $state(false);
	let profileDeleteTarget = $state<ScoringProfile | null>(null);

	function openAddProfileModal() {
		profileModalMode = 'add';
		selectedProfile = null;
		profileError = null;
		profileErrorPrefix = null;
		profileErrorEmphasis = null;
		profileErrorSuffix = null;
		profileModalOpen = true;
	}

	function openEditProfileModal(profile: ScoringProfile) {
		profileModalMode = 'edit';
		selectedProfile = profile;
		profileError = null;
		profileErrorPrefix = null;
		profileErrorEmphasis = null;
		profileErrorSuffix = null;
		profileModalOpen = true;
	}

	function closeProfileModal() {
		profileModalOpen = false;
		selectedProfile = null;
		profileError = null;
		profileErrorPrefix = null;
		profileErrorEmphasis = null;
		profileErrorSuffix = null;
	}

	async function handleProfileSave(formData: ScoringProfileFormData) {
		profileSaving = true;
		profileError = null;
		profileErrorPrefix = null;
		profileErrorEmphasis = null;
		profileErrorSuffix = null;

		try {
			if (profileModalMode === 'add') {
				await createScoringProfile(formData as ScoringProfileCreate);
			} else {
				await updateScoringProfile({ id: selectedProfile?.id, ...formData } as {
					id: string;
				} & ScoringProfileUpdate);
			}

			await invalidateAll();
			closeProfileModal();
		} catch (e) {
			profileError = e instanceof Error ? e.message : 'An unexpected error occurred';
			const duplicateMatch = profileError.match(/^Profile with name '(.+)' already exists$/);
			if (duplicateMatch) {
				profileErrorPrefix = "Profile with name '";
				profileErrorEmphasis = duplicateMatch[1] ?? '';
				profileErrorSuffix = "' already exists";
			}
		} finally {
			profileSaving = false;
		}
	}

	async function handleProfileReset(profileId: string) {
		profileSaving = true;
		profileError = null;

		try {
			await updateScoringProfile({ id: profileId, formatScores: {} });

			await invalidateAll();
		} catch (e) {
			profileError = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			profileSaving = false;
		}
	}

	function confirmProfileDelete(profile: ScoringProfile) {
		profileDeleteTarget = profile;
		profileDeleteConfirmOpen = true;
	}

	async function handleProfileDelete() {
		if (!profileDeleteTarget) return;

		try {
			await deleteScoringProfile(profileDeleteTarget.id);

			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : m.settings_quality_failedToDeleteProfile());
		} finally {
			profileDeleteConfirmOpen = false;
			profileDeleteTarget = null;
		}
	}

	async function handleSetDefault(profile: ScoringProfile) {
		try {
			await updateScoringProfile({
				id: profile.id,
				isDefault: true
			});

			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : m.settings_quality_failedToSetDefault());
		}
	}

	// ===================
	// Format Modal State
	// ===================
	let formatModalOpen = $state(false);
	let formatModalMode = $state<'add' | 'edit' | 'view'>('add');
	let selectedFormat = $state<UICustomFormat | null>(null);
	let formatSaving = $state(false);
	let formatError = $state<string | null>(null);

	// Format delete confirmation
	let formatDeleteConfirmOpen = $state(false);
	let formatDeleteTarget = $state<UICustomFormat | null>(null);

	function openAddFormatModal() {
		formatModalMode = 'add';
		selectedFormat = null;
		formatError = null;
		formatModalOpen = true;
	}

	function openViewFormatModal(format: UICustomFormat) {
		formatModalMode = 'view';
		selectedFormat = format;
		formatError = null;
		formatModalOpen = true;
	}

	function openEditFormatModal(format: UICustomFormat) {
		formatModalMode = 'edit';
		selectedFormat = format;
		formatError = null;
		formatModalOpen = true;
	}

	function closeFormatModal() {
		formatModalOpen = false;
		selectedFormat = null;
		formatError = null;
	}

	async function handleFormatSave(formData: CustomFormatFormData) {
		formatSaving = true;
		formatError = null;

		try {
			if (formatModalMode === 'add') {
				await createCustomFormat(formData as CustomFormatCreate);
			} else {
				await updateCustomFormat(
					(selectedFormat?.id as string) ?? '',
					formData as CustomFormatUpdateBody
				);
			}

			await invalidateAll();
			closeFormatModal();
		} catch (e) {
			formatError = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			formatSaving = false;
		}
	}

	function confirmFormatDelete(format: UICustomFormat) {
		formatDeleteTarget = format;
		formatDeleteConfirmOpen = true;
	}

	async function handleFormatDelete() {
		if (!formatDeleteTarget) return;

		try {
			await deleteCustomFormat(formatDeleteTarget.id);

			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : m.settings_quality_failedToDeleteFormat());
		} finally {
			formatDeleteConfirmOpen = false;
			formatDeleteTarget = null;
		}
	}

	// ===================
	// Delay Profiles State
	// ===================
	type DelayProfile = (typeof data.delayProfiles)[number];

	let dpModalOpen = $state(false);
	let dpModalMode = $state<'add' | 'edit'>('add');
	let dpEditing = $state<DelayProfile | null>(null);
	let dpSaving = $state(false);

	let dpDeleteOpen = $state(false);
	let dpDeleteTarget = $state<DelayProfile | null>(null);
	let dpDeleting = $state(false);

	let dpName = $state('');
	let dpEnabled = $state(true);
	let dpTorrentDelay = $state(0);
	let dpUsenetDelay = $state(0);
	let dpPreferredProtocol = $state<'torrent' | 'usenet' | ''>('');
	let dpBypassIfHighestQuality = $state(true);
	let dpBypassIfAboveScore = $state<number | null>(null);

	function openAddDelay() {
		dpModalMode = 'add';
		dpEditing = null;
		dpName = '';
		dpEnabled = true;
		dpTorrentDelay = 0;
		dpUsenetDelay = 0;
		dpPreferredProtocol = '';
		dpBypassIfHighestQuality = true;
		dpBypassIfAboveScore = null;
		dpModalOpen = true;
	}

	function openEditDelay(profile: DelayProfile) {
		dpModalMode = 'edit';
		dpEditing = profile;
		dpName = profile.name;
		dpEnabled = profile.enabled ?? true;
		dpTorrentDelay = profile.torrentDelay;
		dpUsenetDelay = profile.usenetDelay;
		dpPreferredProtocol = (profile.preferredProtocol as 'torrent' | 'usenet' | '') ?? '';
		dpBypassIfHighestQuality = profile.bypassIfHighestQuality ?? true;
		dpBypassIfAboveScore = profile.bypassIfAboveScore ?? null;
		dpModalOpen = true;
	}

	async function saveDelay() {
		if (!dpName.trim()) return;
		dpSaving = true;
		try {
			const body = {
				name: dpName.trim(),
				enabled: dpEnabled,
				torrentDelay: dpTorrentDelay,
				usenetDelay: dpUsenetDelay,
				preferredProtocol: dpPreferredProtocol || null,
				bypassIfHighestQuality: dpBypassIfHighestQuality,
				bypassIfAboveScore: dpBypassIfAboveScore
			};
			if (dpModalMode === 'add') {
				const res = await fetch('/api/settings/delay-profiles', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				if (!res.ok)
					throw new Error(
						getResponseErrorMessage(
							await res.json().catch(() => null),
							'Failed to create delay profile'
						)
					);
				toasts.success('Delay profile created');
			} else {
				const res = await fetch(`/api/settings/delay-profiles/${dpEditing!.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				if (!res.ok)
					throw new Error(
						getResponseErrorMessage(
							await res.json().catch(() => null),
							'Failed to update delay profile'
						)
					);
				toasts.success('Delay profile updated');
			}
			dpModalOpen = false;
			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to save');
		} finally {
			dpSaving = false;
		}
	}

	async function deleteDelay() {
		if (!dpDeleteTarget) return;
		dpDeleting = true;
		try {
			const res = await fetch(`/api/settings/delay-profiles/${dpDeleteTarget.id}`, {
				method: 'DELETE'
			});
			if (!res.ok)
				throw new Error(
					getResponseErrorMessage(
						await res.json().catch(() => null),
						'Failed to delete delay profile'
					)
				);
			toasts.success(`"${dpDeleteTarget.name}" deleted`);
			dpDeleteOpen = false;
			dpDeleteTarget = null;
			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to delete');
		} finally {
			dpDeleting = false;
		}
	}

	function formatDelay(minutes: number): string {
		if (minutes === 0) return 'Immediate';
		if (minutes < 60) return `${minutes}m`;
		const h = Math.floor(minutes / 60);
		const m2 = minutes % 60;
		return m2 > 0 ? `${h}h ${m2}m` : `${h}h`;
	}
</script>

<svelte:head>
	<title>{m.nav_qualitySettings()}</title>
</svelte:head>

<SettingsPage title={m.settings_quality_heading()} subtitle={m.settings_quality_subtitle()}>
	<!-- Tabs -->
	<div role="tablist" class="tabs-boxed tabs w-fit">
		<button
			type="button"
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'profiles'}
			onclick={() => setTab('profiles')}
		>
			<Sliders class="h-4 w-4" />
			{m.settings_quality_tabProfiles()}
		</button>
		<button
			type="button"
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'formats'}
			onclick={() => setTab('formats')}
		>
			<Layers class="h-4 w-4" />
			{m.settings_quality_tabFormats()}
		</button>
		<button
			type="button"
			role="tab"
			class="tab gap-2"
			class:tab-active={activeTab === 'delay-profiles'}
			onclick={() => setTab('delay-profiles')}
		>
			<Clock class="h-4 w-4" />
			Delay Profiles
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'profiles'}
		<div class="-mt-2">
			<p class="text-sm text-base-content/60">
				{m.settings_quality_profilesDescription()}
			</p>
		</div>
		<ProfileList
			profiles={data.profiles}
			onAdd={openAddProfileModal}
			onEdit={openEditProfileModal}
			onDelete={confirmProfileDelete}
			onSetDefault={handleSetDefault}
		/>
	{:else if activeTab === 'formats'}
		<div class="-mt-2">
			<p class="text-sm text-base-content/60">
				{m.settings_quality_formatsDescription()}
			</p>
		</div>
		<FormatList
			formats={data.formats as UICustomFormat[]}
			onView={openViewFormatModal}
			onEdit={openEditFormatModal}
			onCreate={openAddFormatModal}
			onDelete={confirmFormatDelete}
		/>
	{:else if activeTab === 'delay-profiles'}
		<div class="-mt-2 flex items-center justify-between">
			<p class="text-sm text-base-content/60">
				Hold releases in a queue before sending to a download client, giving time for better
				versions to appear.
			</p>
			<button class="btn btn-primary btn-sm" onclick={openAddDelay}>
				<Plus class="h-4 w-4" />
				Add Profile
			</button>
		</div>
		{#if data.delayProfiles.length === 0}
			<div class="rounded-lg border border-dashed border-base-300 p-8 text-center">
				<Clock class="mx-auto mb-3 h-10 w-10 text-base-content/30" />
				<p class="font-medium">No delay profiles</p>
				<p class="mt-1 text-sm text-base-content/60">
					Create a profile to hold releases before grabbing them.
				</p>
				<button class="btn btn-primary btn-sm mt-4" onclick={openAddDelay}>
					<Plus class="h-4 w-4" />
					Add Profile
				</button>
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each data.delayProfiles as profile (profile.id)}
					<div
						class="flex items-center justify-between rounded-lg border border-base-300 bg-base-100 p-4"
					>
						<div class="flex items-center gap-3">
							<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
								<Clock class="h-4 w-4 text-primary" />
							</div>
							<div>
								<div class="flex items-center gap-2">
									<span class="font-medium">{profile.name}</span>
									{#if !profile.enabled}
										<span class="badge badge-ghost badge-sm">Disabled</span>
									{/if}
								</div>
								<div class="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-base-content/60">
									<span>Torrent: {formatDelay(profile.torrentDelay)}</span>
									<span>Usenet: {formatDelay(profile.usenetDelay)}</span>
									{#if profile.preferredProtocol}
										<span>Preferred: {profile.preferredProtocol}</span>
									{/if}
									{#if profile.bypassIfHighestQuality}
										<span>Bypass at 4K</span>
									{/if}
									{#if profile.bypassIfAboveScore != null}
										<span>Bypass if score &gt; {profile.bypassIfAboveScore}</span>
									{/if}
								</div>
							</div>
						</div>
						<div class="flex items-center gap-2">
							<button class="btn btn-ghost btn-sm" onclick={() => openEditDelay(profile)}>
								<Pencil class="h-4 w-4" />
							</button>
							<button
								class="btn btn-ghost btn-sm text-error"
								onclick={() => {
									dpDeleteTarget = profile;
									dpDeleteOpen = true;
								}}
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</SettingsPage>

<!-- Profile Modal -->
<ProfileModal
	open={profileModalOpen}
	mode={profileModalMode}
	profile={selectedProfile}
	allProfiles={data.profiles.map((p) => ({ id: p.id, name: p.name, isBuiltIn: p.isBuiltIn }))}
	allFormats={data.formats.map((f) => ({ id: f.id, name: f.name, category: f.category }))}
	defaultCopyFromId={data.defaultProfileId}
	saving={profileSaving}
	error={profileError}
	errorPrefix={profileErrorPrefix}
	errorEmphasis={profileErrorEmphasis}
	errorSuffix={profileErrorSuffix}
	onClose={closeProfileModal}
	onSave={handleProfileSave}
	onReset={handleProfileReset}
/>

<!-- Profile Delete Confirmation -->
<ConfirmationModal
	open={profileDeleteConfirmOpen}
	title={m.settings_quality_confirmDeleteTitle()}
	message={m.settings_quality_confirmDeleteProfileMessage({
		name: profileDeleteTarget?.name ?? ''
	})}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
	onConfirm={handleProfileDelete}
	onCancel={() => (profileDeleteConfirmOpen = false)}
/>

<!-- Format Modal -->
<CustomFormatModal
	open={formatModalOpen}
	mode={formatModalMode}
	format={selectedFormat}
	saving={formatSaving}
	error={formatError}
	onClose={closeFormatModal}
	onSave={handleFormatSave}
/>

<!-- Format Delete Confirmation -->
<ConfirmationModal
	open={formatDeleteConfirmOpen}
	title={m.settings_quality_confirmDeleteTitle()}
	message={m.settings_quality_confirmDeleteFormatMessage({ name: formatDeleteTarget?.name ?? '' })}
	confirmLabel={m.action_delete()}
	confirmVariant="error"
	onConfirm={handleFormatDelete}
	onCancel={() => (formatDeleteConfirmOpen = false)}
/>

<!-- Delay Profile Modal -->
<ModalWrapper open={dpModalOpen} onClose={() => (dpModalOpen = false)}>
	<ModalHeader
		title={dpModalMode === 'add' ? 'Add Delay Profile' : 'Edit Delay Profile'}
		onClose={() => (dpModalOpen = false)}
	/>
	<div class="space-y-5 p-6">
		<div class="form-control">
			<label class="label" for="dp-name"><span class="label-text">Name</span></label>
			<input
				id="dp-name"
				type="text"
				class="input input-bordered w-full"
				bind:value={dpName}
				placeholder="Dub Wait"
			/>
		</div>
		<div class="form-control">
			<label class="label cursor-pointer justify-start gap-3">
				<input type="checkbox" class="toggle toggle-primary toggle-sm" bind:checked={dpEnabled} />
				<span class="label-text">Enabled</span>
			</label>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div class="form-control">
				<label class="label" for="dp-torrent"
					><span class="label-text">Torrent delay (minutes)</span></label
				>
				<input
					id="dp-torrent"
					type="number"
					class="input input-bordered w-full"
					bind:value={dpTorrentDelay}
					min="0"
				/>
				<span class="label-text-alt mt-1 text-base-content/60">{formatDelay(dpTorrentDelay)}</span>
			</div>
			<div class="form-control">
				<label class="label" for="dp-usenet"
					><span class="label-text">Usenet delay (minutes)</span></label
				>
				<input
					id="dp-usenet"
					type="number"
					class="input input-bordered w-full"
					bind:value={dpUsenetDelay}
					min="0"
				/>
				<span class="label-text-alt mt-1 text-base-content/60">{formatDelay(dpUsenetDelay)}</span>
			</div>
		</div>
		<div class="form-control">
			<label class="label" for="dp-preferred"
				><span class="label-text">Preferred protocol (grabs immediately)</span></label
			>
			<select
				id="dp-preferred"
				class="select select-bordered w-full"
				bind:value={dpPreferredProtocol}
			>
				<option value="">None</option>
				<option value="torrent">Torrent</option>
				<option value="usenet">Usenet</option>
			</select>
		</div>
		<div class="form-control">
			<label class="label cursor-pointer justify-start gap-3">
				<input
					type="checkbox"
					class="toggle toggle-primary toggle-sm"
					bind:checked={dpBypassIfHighestQuality}
				/>
				<span class="label-text">Bypass delay for 4K (2160p) releases</span>
			</label>
		</div>
		<div class="form-control">
			<label class="label" for="dp-score"
				><span class="label-text">Bypass delay if score exceeds</span></label
			>
			<input
				id="dp-score"
				type="number"
				class="input input-bordered w-full"
				value={dpBypassIfAboveScore ?? ''}
				oninput={(e) => {
					const v = (e.currentTarget as HTMLInputElement).value;
					dpBypassIfAboveScore = v === '' ? null : parseInt(v, 10);
				}}
				placeholder="Leave empty to disable"
			/>
		</div>
	</div>
	<ModalFooter
		onCancel={() => (dpModalOpen = false)}
		onSave={saveDelay}
		saving={dpSaving}
		saveDisabled={!dpName.trim()}
		saveLabel={dpModalMode === 'add' ? 'Create' : 'Save'}
	/>
</ModalWrapper>

<!-- Delay Profile Delete Confirmation -->
<ConfirmationModal
	open={dpDeleteOpen}
	title="Delete Delay Profile"
	message={`Delete "${dpDeleteTarget?.name}"? Media assigned to this profile will fall back to no delay.`}
	confirmLabel="Delete"
	confirmVariant="error"
	loading={dpDeleting}
	onConfirm={deleteDelay}
	onCancel={() => (dpDeleteOpen = false)}
/>
