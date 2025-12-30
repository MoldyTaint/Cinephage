<script lang="ts">
	import { FolderOpen } from 'lucide-svelte';
	import { SectionHeader } from '$lib/components/ui/modal';
	import type { DownloadClientDefinition } from '$lib/types/downloadClient';

	interface Props {
		definition: DownloadClientDefinition | null | undefined;
		movieCategory: string;
		tvCategory: string;
		recentPriority: 'normal' | 'high' | 'force';
		olderPriority: 'normal' | 'high' | 'force';
		initialState: 'start' | 'pause' | 'force';
		downloadPathLocal: string;
		onBrowse: () => void;
	}

	let {
		definition,
		movieCategory = $bindable(),
		tvCategory = $bindable(),
		recentPriority = $bindable(),
		olderPriority = $bindable(),
		initialState = $bindable(),
		downloadPathLocal = $bindable(),
		onBrowse
	}: Props = $props();
</script>

<!-- Categories (if supported) -->
{#if definition?.supportsCategories}
	<SectionHeader title="Categories" />

	<div class="grid grid-cols-2 gap-3">
		<div class="form-control">
			<label class="label py-1" for="movieCategory">
				<span class="label-text">Movies</span>
			</label>
			<input
				id="movieCategory"
				type="text"
				class="input-bordered input input-sm"
				bind:value={movieCategory}
				placeholder="movies"
			/>
		</div>

		<div class="form-control">
			<label class="label py-1" for="tvCategory">
				<span class="label-text">TV Shows</span>
			</label>
			<input
				id="tvCategory"
				type="text"
				class="input-bordered input input-sm"
				bind:value={tvCategory}
				placeholder="tv"
			/>
		</div>
	</div>
{/if}

<!-- Priority & Initial State (if supported) -->
{#if definition?.supportsPriority}
	<SectionHeader title="Download Behavior" class={definition?.supportsCategories ? 'mt-4' : ''} />

	<div class="grid grid-cols-3 gap-3">
		<div class="form-control">
			<label class="label py-1" for="recentPriority">
				<span class="label-text text-xs">Recent</span>
			</label>
			<select
				id="recentPriority"
				class="select-bordered select select-sm"
				bind:value={recentPriority}
			>
				<option value="normal">Normal</option>
				<option value="high">High</option>
				<option value="force">Force</option>
			</select>
		</div>

		<div class="form-control">
			<label class="label py-1" for="olderPriority">
				<span class="label-text text-xs">Older</span>
			</label>
			<select
				id="olderPriority"
				class="select-bordered select select-sm"
				bind:value={olderPriority}
			>
				<option value="normal">Normal</option>
				<option value="high">High</option>
				<option value="force">Force</option>
			</select>
		</div>

		<div class="form-control">
			<label class="label py-1" for="initialState">
				<span class="label-text text-xs">Start As</span>
			</label>
			<select id="initialState" class="select-bordered select select-sm" bind:value={initialState}>
				<option value="start">Start</option>
				<option value="pause">Paused</option>
				<option value="force">Force</option>
			</select>
		</div>
	</div>
{/if}

<!-- Path Mapping -->
<SectionHeader title="Path Mapping" class="mt-4" />

<div class="form-control">
	<label class="label py-1" for="downloadPathLocal">
		<span class="label-text">Local Download Path</span>
	</label>
	<div class="join w-full">
		<input
			id="downloadPathLocal"
			type="text"
			class="input-bordered input input-sm join-item flex-1"
			bind:value={downloadPathLocal}
			placeholder="/path/to/downloads"
		/>
		<button
			type="button"
			class="btn join-item border border-base-300 btn-ghost btn-sm"
			onclick={onBrowse}
			title="Browse folders"
		>
			<FolderOpen class="h-4 w-4" />
		</button>
	</div>
	<div class="label py-1">
		<span class="label-text-alt text-xs">
			Where downloads appear on THIS server (may differ from client's view)
		</span>
	</div>
</div>
