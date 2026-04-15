<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Section heading */
		title: string;
		/** Optional description below heading */
		description?: string;
		/** Optional action area rendered to the right of the heading */
		actions?: Snippet;
		/** Section content */
		children: Snippet;
		/** Visual variant: 'card' renders in a card, 'flat' renders without a card wrapper */
		variant?: 'card' | 'flat';
		/** Extra classes for the outer container */
		class?: string;
	}

	let {
		title,
		description,
		actions,
		children,
		variant = 'card',
		class: className = ''
	}: Props = $props();
</script>

{#if variant === 'card'}
	<div class="card bg-base-200 {className}">
		<div class="card-body gap-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="min-w-0">
					<h2 class="text-lg font-semibold">{title}</h2>
					{#if description}
						<p class="mt-1 text-sm text-base-content/70">{description}</p>
					{/if}
				</div>
				{#if actions}
					<div class="flex shrink-0 items-center gap-2">
						{@render actions()}
					</div>
				{/if}
			</div>
			{@render children()}
		</div>
	</div>
{:else}
	<div class={className}>
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="min-w-0">
				<h2 class="text-lg font-semibold">{title}</h2>
				{#if description}
					<p class="mt-1 text-sm text-base-content/70">{description}</p>
				{/if}
			</div>
			{#if actions}
				<div class="flex shrink-0 items-center gap-2">
					{@render actions()}
				</div>
			{/if}
		</div>
		{@render children()}
	</div>
{/if}
