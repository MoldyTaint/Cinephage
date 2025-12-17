<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import type { ScoringProfile, ScoringProfileFormData } from '$lib/types/profile';
	import type { UICustomFormat } from '$lib/types/format';
	import type { CustomFormatFormData } from '$lib/components/formats';
	import { ProfileList, ProfileModal } from '$lib/components/profiles';
	import { FormatList, CustomFormatModal } from '$lib/components/formats';
	import { ConfirmationModal } from '$lib/components/ui/modal';
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
			console.error('Delete failed:', e);
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
			console.error('Set default failed:', e);
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

	function confirmFormatDelete(format: UICustomFormat) {
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
			console.error('Delete failed:', e);
		} finally {
			formatDeleteConfirmOpen = false;
			formatDeleteTarget = null;
		}
	}
</script>

<div class="w-full p-4">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Quality Settings</h1>
		<p class="text-base-content/70">
			Manage quality profiles and custom formats to control how releases are scored and selected.
		</p>
	</div>

	<!-- Tabs -->
	<div class="tabs-boxed mb-6 tabs w-fit">
		<button
			type="button"
			class="tab gap-2"
			class:tab-active={activeTab === 'profiles'}
			onclick={() => setTab('profiles')}
		>
			<Sliders class="h-4 w-4" />
			Profiles
		</button>
		<button
			type="button"
			class="tab gap-2"
			class:tab-active={activeTab === 'formats'}
			onclick={() => setTab('formats')}
		>
			<Layers class="h-4 w-4" />
			Custom Formats
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'profiles'}
		<div class="mb-4">
			<p class="text-sm text-base-content/60">
				Quality profiles determine how releases are scored. Each profile assigns scores to different
				formats (resolution, audio, HDR, etc.) to rank releases by quality.
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
		<div class="mb-4">
			<p class="text-sm text-base-content/60">
				Custom formats define matching rules for releases. Create formats to match specific codecs,
				audio formats, release groups, and more. Use conditions to precisely target the releases you
				want.
			</p>
		</div>
		<FormatList
			formats={data.formats as UICustomFormat[]}
			onView={openViewFormatModal}
			onEdit={openEditFormatModal}
			onCreate={openAddFormatModal}
		/>
	{/if}
</div>

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
/>

<!-- Profile Delete Confirmation -->
<ConfirmationModal
	open={profileDeleteConfirmOpen}
	title="Confirm Delete"
	message="Are you sure you want to delete {profileDeleteTarget?.name}? This action cannot be undone."
	confirmLabel="Delete"
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
	title="Confirm Delete"
	message="Are you sure you want to delete {formatDeleteTarget?.name}? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	onConfirm={handleFormatDelete}
	onCancel={() => (formatDeleteConfirmOpen = false)}
/>
