<script lang="ts">
	import { Search, Globe, Lock, Zap } from 'lucide-svelte';
	import type { IndexerDefinition } from '$lib/types/indexer';

	interface Props {
		definitions: IndexerDefinition[];
		onSelect: (definitionId: string) => void;
		onCancel: () => void;
	}

	let { definitions, onSelect, onCancel }: Props = $props();

	let searchQuery = $state('');

	const filteredDefinitions = $derived(() => {
		if (!searchQuery.trim()) return definitions;
		const query = searchQuery.toLowerCase();
		return definitions.filter(
			(d) =>
				d.name.toLowerCase().includes(query) ||
				d.description?.toLowerCase().includes(query) ||
				d.id.toLowerCase().includes(query)
		);
	});

	const groupedDefinitions = $derived(() => {
		const filtered = filteredDefinitions();
		return {
			public: filtered.filter((d) => d.type === 'public' && d.protocol !== 'streaming'),
			private: filtered.filter(
				(d) => (d.type === 'private' || d.type === 'semi-private') && d.protocol !== 'streaming'
			),
			streaming: filtered.filter((d) => d.protocol === 'streaming')
		};
	});
</script>

<div class="space-y-4">
	<!-- Search -->
	<div class="form-control">
		<div class="relative">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/50" />
			<input
				type="text"
				class="input-bordered input w-full pl-10"
				placeholder="Search indexers..."
				bind:value={searchQuery}
			/>
		</div>
	</div>

	<!-- Definition List -->
	<div class="max-h-100 overflow-y-auto rounded-lg border border-base-300">
		{#if groupedDefinitions().public.length > 0}
			<div class="sticky top-0 z-10 border-b border-base-300 bg-base-200 px-4 py-2">
				<span class="flex items-center gap-2 text-sm font-medium text-base-content/70">
					<Globe class="h-4 w-4" />
					Public Indexers
				</span>
			</div>
			{#each groupedDefinitions().public as def (def.id)}
				<button
					type="button"
					class="flex w-full items-center gap-4 border-b border-base-200 p-4 text-left transition-colors last:border-b-0 hover:bg-base-200"
					onclick={() => onSelect(def.id)}
				>
					<div class="rounded-lg bg-success/10 p-2">
						<Globe class="h-5 w-5 text-success" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="font-semibold">{def.name}</span>
							<span class="badge badge-ghost badge-xs">{def.protocol}</span>
							{#if def.isCustom}
								<span class="badge badge-ghost badge-xs">custom</span>
							{/if}
						</div>
						{#if def.description}
							<p class="mt-0.5 truncate text-sm text-base-content/60">{def.description}</p>
						{/if}
					</div>
					<div class="flex flex-col items-end gap-1">
						<span class="badge badge-sm badge-success">Public</span>
					</div>
				</button>
			{/each}
		{/if}

		{#if groupedDefinitions().private.length > 0}
			<div class="sticky top-0 z-10 border-b border-base-300 bg-base-200 px-4 py-2">
				<span class="flex items-center gap-2 text-sm font-medium text-base-content/70">
					<Lock class="h-4 w-4" />
					Private Indexers
				</span>
			</div>
			{#each groupedDefinitions().private as def (def.id)}
				<button
					type="button"
					class="flex w-full items-center gap-4 border-b border-base-200 p-4 text-left transition-colors last:border-b-0 hover:bg-base-200"
					onclick={() => onSelect(def.id)}
				>
					<div class="rounded-lg bg-warning/10 p-2">
						<Lock class="h-5 w-5 text-warning" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="font-semibold">{def.name}</span>
							<span class="badge badge-ghost badge-xs">{def.protocol}</span>
							{#if def.isCustom}
								<span class="badge badge-ghost badge-xs">custom</span>
							{/if}
						</div>
						{#if def.description}
							<p class="mt-0.5 truncate text-sm text-base-content/60">{def.description}</p>
						{/if}
					</div>
					<div class="flex flex-col items-end gap-1">
						<span class="badge badge-sm badge-warning">Private</span>
						{#if def.settings && def.settings.length > 0}
							<span class="badge badge-ghost badge-xs">Auth Required</span>
						{/if}
					</div>
				</button>
			{/each}
		{/if}

		{#if groupedDefinitions().streaming.length > 0}
			<div class="sticky top-0 z-10 border-b border-base-300 bg-base-200 px-4 py-2">
				<span class="flex items-center gap-2 text-sm font-medium text-base-content/70">
					<Zap class="h-4 w-4" />
					Streaming
				</span>
			</div>
			{#each groupedDefinitions().streaming as def (def.id)}
				<button
					type="button"
					class="flex w-full items-center gap-4 border-b border-base-200 p-4 text-left transition-colors last:border-b-0 hover:bg-base-200"
					onclick={() => onSelect(def.id)}
				>
					<div class="rounded-lg bg-info/10 p-2">
						<Zap class="h-5 w-5 text-info" />
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<span class="font-semibold">{def.name}</span>
							<span class="badge badge-ghost badge-xs">streaming</span>
							{#if def.isCustom}
								<span class="badge badge-ghost badge-xs">custom</span>
							{/if}
						</div>
						{#if def.description}
							<p class="mt-0.5 truncate text-sm text-base-content/60">{def.description}</p>
						{/if}
					</div>
					<div class="flex flex-col items-end gap-1">
						<span class="badge badge-sm badge-info">Streaming</span>
					</div>
				</button>
			{/each}
		{/if}

		{#if filteredDefinitions().length === 0}
			<div class="p-8 text-center text-base-content/50">
				No indexers match "{searchQuery}"
			</div>
		{/if}
	</div>

	<p class="text-center text-sm text-base-content/50">
		{definitions.length} indexers available
	</p>
</div>

<div class="modal-action">
	<button class="btn btn-ghost" onclick={onCancel}>Cancel</button>
</div>
