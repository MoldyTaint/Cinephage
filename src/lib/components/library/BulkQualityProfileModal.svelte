<script lang="ts">
	import { X, Loader2 } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

	interface QualityProfile {
		id: string;
		name: string;
		description: string;
		isBuiltIn: boolean;
		isDefault: boolean;
	}

	interface Props {
		open: boolean;
		selectedCount: number;
		qualityProfiles: QualityProfile[];
		saving: boolean;
		mediaType: 'movie' | 'series';
		onSave: (profileId: string | null) => void;
		onCancel: () => void;
	}

	let { open, selectedCount, qualityProfiles, saving, mediaType, onSave, onCancel }: Props =
		$props();

	let qualityProfileId = $state('');

	// Reset when modal opens
	$effect(() => {
		if (open) {
			qualityProfileId = '';
		}
	});

	const defaultProfile = $derived(qualityProfiles.find((p) => p.isDefault));
	const nonDefaultProfiles = $derived(qualityProfiles.filter((p) => p.id !== defaultProfile?.id));
	const currentProfile = $derived(
		qualityProfiles.find((p) => p.id === qualityProfileId) ?? defaultProfile
	);

	const itemLabel = $derived(
		mediaType === 'movie'
			? selectedCount === 1
				? 'movie'
				: 'movies'
			: selectedCount === 1
				? 'series'
				: 'series'
	);

	function handleSave() {
		onSave(qualityProfileId || null);
	}
</script>

<ModalWrapper {open} onClose={onCancel} maxWidth="md" labelledBy="bulk-profile-modal-title">
	<div class="mb-4 flex items-center justify-between">
		<h3 id="bulk-profile-modal-title" class="text-lg font-bold">Change Quality Profile</h3>
		<button
			type="button"
			class="btn btn-circle btn-ghost btn-sm"
			onclick={onCancel}
			aria-label="Close"
		>
			<X class="h-4 w-4" />
		</button>
	</div>

	<div class="mb-4 rounded-lg bg-base-200 p-3">
		<div class="font-medium">
			{selectedCount}
			{itemLabel} selected
		</div>
		<div class="text-sm text-base-content/60">
			The selected quality profile will be applied to all selected items.
		</div>
	</div>

	<div class="form-control">
		<label class="label" for="bulk-quality-profile">
			<span class="label-text font-medium">Quality Profile</span>
		</label>
		<select
			id="bulk-quality-profile"
			bind:value={qualityProfileId}
			class="select-bordered select w-full"
		>
			<option value="">{defaultProfile?.name ?? 'System Default'} (Default)</option>
			{#each nonDefaultProfiles as profile (profile.id)}
				<option value={profile.id}>{profile.name}</option>
			{/each}
		</select>
		<div class="label">
			<span class="label-text-alt text-base-content/60">
				{#if currentProfile}
					{currentProfile.description}
				{:else}
					Controls quality scoring and upgrade behavior
				{/if}
			</span>
		</div>
	</div>

	<div class="modal-action">
		<button type="button" class="btn btn-ghost" onclick={onCancel} disabled={saving}>
			Cancel
		</button>
		<button type="button" class="btn btn-primary" onclick={handleSave} disabled={saving}>
			{#if saving}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			Apply to {selectedCount}
			{itemLabel}
		</button>
	</div>
</ModalWrapper>
