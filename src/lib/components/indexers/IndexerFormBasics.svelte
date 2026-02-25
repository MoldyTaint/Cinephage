<script lang="ts">
	import type { IndexerDefinition } from '$lib/types/indexer';

	interface Props {
		definitions: IndexerDefinition[];
		selectedDefinitionId: string;
		name: string;
		url: string;
		enabled: boolean;
		priority: number;
		mode: 'add' | 'edit';
	}

	let {
		definitions,
		selectedDefinitionId = $bindable(),
		name = $bindable(),
		url = $bindable(),
		enabled = $bindable(),
		priority = $bindable(),
		mode
	}: Props = $props();

	const selectedDefinition = $derived(definitions.find((d) => d.id === selectedDefinitionId));

	// All available URLs from definition (primary + alternates)
	const definitionUrls = $derived(
		[selectedDefinition?.siteUrl ?? '', ...(selectedDefinition?.alternateUrls ?? [])].filter(
			Boolean
		)
	);

	// Alternate URLs = all definition URLs except the selected primary
	const alternateUrls = $derived(definitionUrls.filter((u) => u !== url));
	const MAX_NAME_LENGTH = 20;
	const nameTooLong = $derived(name.length > MAX_NAME_LENGTH);
</script>

<!-- Definition Select -->
<div class="form-control">
	<label class="label" for="definition">
		<span class="label-text">Definition</span>
	</label>
	<select
		id="definition"
		class="select-bordered select w-full"
		bind:value={selectedDefinitionId}
		disabled={mode === 'edit'}
	>
		{#each definitions as def (def.id)}
			<option value={def.id}>
				{def.name} ({def.protocol})
			</option>
		{/each}
	</select>
	{#if selectedDefinition?.description}
		<div class="label">
			<span class="label-text-alt text-base-content/60">
				{selectedDefinition.description}
			</span>
		</div>
	{/if}
</div>

<!-- Name -->
<div class="form-control">
	<label class="label" for="name">
		<span class="label-text">Name</span>
	</label>
	<input
		type="text"
		id="name"
		class="input-bordered input w-full"
		placeholder="Enter indexer name"
		bind:value={name}
		maxlength={MAX_NAME_LENGTH}
		required
	/>
	<div class="label">
		<span class="label-text-alt text-xs {nameTooLong ? 'text-error' : 'text-base-content/60'}">
			{name.length}/{MAX_NAME_LENGTH}
		</span>
		{#if nameTooLong}
			<span class="label-text-alt text-xs text-error">Max {MAX_NAME_LENGTH} characters.</span>
		{/if}
	</div>
</div>

<!-- URL Selection -->
<div class="form-control">
	<label class="label" for="url">
		<span class="label-text">Primary URL</span>
		{#if alternateUrls.length > 0}
			<span class="label-text-alt text-base-content/60">
				+{alternateUrls.length} failover{alternateUrls.length > 1 ? 's' : ''}
			</span>
		{/if}
	</label>

	<select id="url" class="select-bordered select w-full" bind:value={url}>
		{#each definitionUrls as availableUrl (availableUrl)}
			<option value={availableUrl}>
				{availableUrl}
				{#if availableUrl === selectedDefinition?.siteUrl}(default){/if}
			</option>
		{/each}
	</select>

	<!-- Failover URLs preview -->
	{#if alternateUrls.length > 0}
		<div class="mt-2 text-xs text-base-content/60">
			<span class="font-medium">Failover order:</span>
			{#each alternateUrls as altUrl, i (altUrl)}
				<span class="ml-1">
					{i + 1}. {new URL(altUrl).hostname}{i < alternateUrls.length - 1 ? ',' : ''}
				</span>
			{/each}
		</div>
	{/if}
</div>

<!-- Enabled & Priority Row -->
<div class="flex gap-4">
	<div class="flex-1">
		<label class="flex cursor-pointer items-center gap-2 py-2">
			<input type="checkbox" class="toggle shrink-0 toggle-primary" bind:checked={enabled} />
			<span class="text-sm">Enabled</span>
		</label>
	</div>

	<div class="form-control flex-1">
		<label class="label" for="priority">
			<span class="label-text">Priority (1-100)</span>
		</label>
		<input
			type="number"
			id="priority"
			class="input-bordered input w-full"
			min="1"
			max="100"
			bind:value={priority}
		/>
	</div>
</div>
