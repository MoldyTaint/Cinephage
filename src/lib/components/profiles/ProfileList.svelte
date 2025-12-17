<script lang="ts">
	import type { ScoringProfile } from '$lib/types/profile';
	import ProfileTable from './ProfileTable.svelte';
	import { Plus } from 'lucide-svelte';

	interface Props {
		profiles: ScoringProfile[];
		onAdd?: () => void;
		onEdit?: (profile: ScoringProfile) => void;
		onDelete?: (profile: ScoringProfile) => void;
		onSetDefault?: (profile: ScoringProfile) => void;
	}

	let { profiles, onAdd, onEdit, onDelete, onSetDefault }: Props = $props();

	// Sort profiles: built-in first (sorted by name), then custom (sorted by name)
	const sortedProfiles = $derived(() => {
		const builtIn = profiles
			.filter((p) => p.isBuiltIn)
			.sort((a, b) => a.name.localeCompare(b.name));
		const custom = profiles
			.filter((p) => !p.isBuiltIn)
			.sort((a, b) => a.name.localeCompare(b.name));
		return [...builtIn, ...custom];
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-end">
		{#if onAdd}
			<button class="btn gap-2 btn-primary" onclick={onAdd}>
				<Plus class="h-4 w-4" />
				Add Profile
			</button>
		{/if}
	</div>

	<div class="card bg-base-100 shadow-xl">
		<div class="card-body p-0">
			<ProfileTable
				profiles={sortedProfiles()}
				onEdit={onEdit ?? (() => {})}
				onDelete={onDelete ?? (() => {})}
				onSetDefault={onSetDefault ?? (() => {})}
			/>
		</div>
	</div>
</div>
