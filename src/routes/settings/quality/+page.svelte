<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import type { ScoringProfile, ScoringProfileFormData } from '$lib/types/profile';
	import type { UICustomFormat } from '$lib/types/format';
	import type { CustomFormatFormData } from '$lib/components/formats';
	import { ProfileList, ProfileModal } from '$lib/components/profiles';
	import { FormatList, CustomFormatModal } from '$lib/components/formats';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import { SettingsPage } from '$lib/components/ui/settings';
	import { toasts } from '$lib/stores/toast.svelte';
	import { Sliders, Layers } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	// Tab state - derived from URL
	const activeTab = $derived($page.url.searchParams.get('tab') || 'profiles');

	function setTab(tab: string) {
		const url = new URL($page.url);
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

	// Profile delete confirmation
	let profileDeleteConfirmOpen = $state(false);
	let profileDeleteTarget = $state<ScoringProfile | null>(null);

	function openAddProfileModal() {
		profileModalMode = 'add';
		selectedProfile = null;
		profileError = null;
		profileModalOpen = true;
	}

	function openEditProfileModal(profile: ScoringProfile) {
		profileModalMode = 'edit';
		selectedProfile = profile;
		profileError = null;
		profileModalOpen = true;
	}

	function closeProfileModal() {
		profileModalOpen = false;
		selectedProfile = null;
		profileError = null;
	}

	async function handleProfileSave(formData: ScoringProfileFormData) {
		profileSaving = true;
		profileError = null;

		try {
			const url = '/api/scoring-profiles';
			const method = profileModalMode === 'add' ? 'POST' : 'PUT';
			const body = profileModalMode === 'add' ? formData : { id: selectedProfile?.id, ...formData };

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save profile');
			}

			await invalidateAll();
			closeProfileModal();
		} catch (e) {
			profileError = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			profileSaving = false;
		}
	}

	async function handleProfileReset(profileId: string) {
		profileSaving = true;
		profileError = null;

		try {
			// Reset built-in profile scores by saving with empty formatScores (server computes diff)
			const response = await fetch('/api/scoring-profiles', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: profileId, formatScores: {} })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to reset profile');
			}

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
			const response = await fetch('/api/scoring-profiles', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: profileDeleteTarget.id })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to delete profile');
			}

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
			const response = await fetch('/api/scoring-profiles', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					id: profile.id,
					isDefault: true
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to set default');
			}

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
			const url = '/api/custom-formats';
			const method = formatModalMode === 'add' ? 'POST' : 'PUT';
			const body = formatModalMode === 'add' ? formData : { id: selectedFormat?.id, ...formData };

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const responseData = await response.json();
				throw new Error(responseData.error || 'Failed to save format');
			}

			await invalidateAll();
			closeFormatModal();
		} catch (e) {
			formatError = e instanceof Error ? e.message : 'An unexpected error occurred';
		} finally {
			formatSaving = false;
		}
	}

	function _confirmFormatDelete(format: UICustomFormat) {
		formatDeleteTarget = format;
		formatDeleteConfirmOpen = true;
	}

	async function handleFormatDelete() {
		if (!formatDeleteTarget) return;

		try {
			const response = await fetch('/api/custom-formats', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: formatDeleteTarget.id })
			});

			if (!response.ok) {
				const responseData = await response.json();
				throw new Error(responseData.error || 'Failed to delete format');
			}

			await invalidateAll();
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : m.settings_quality_failedToDeleteFormat());
		} finally {
			formatDeleteConfirmOpen = false;
			formatDeleteTarget = null;
		}
	}
</script>

<SettingsPage title={m.settings_quality_heading()} subtitle={m.settings_quality_subtitle()}>
	<!-- Tabs -->
	<div class="tabs-boxed tabs w-fit">
		<button
			type="button"
			class="tab gap-2"
			class:tab-active={activeTab === 'profiles'}
			onclick={() => setTab('profiles')}
		>
			<Sliders class="h-4 w-4" />
			{m.settings_quality_tabProfiles()}
		</button>
		<button
			type="button"
			class="tab gap-2"
			class:tab-active={activeTab === 'formats'}
			onclick={() => setTab('formats')}
		>
			<Layers class="h-4 w-4" />
			{m.settings_quality_tabFormats()}
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
		/>
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
