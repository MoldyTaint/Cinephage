<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import { Info } from 'lucide-svelte';

	interface Props {
		label: string;
		id?: string;
		helpText?: string;
		error?: string | null;
		tooltip?: string;
		required?: boolean;
		children: Snippet;
	}

	let { label, id, helpText, error = null, tooltip, required = false, children }: Props = $props();
</script>

<div class="form-control">
	<label class="label py-1" for={id}>
		<span class="label-text">
			{label}
			{#if required}
				<span class="text-error">*</span>
			{/if}
		</span>
		{#if tooltip}
			<span class="label-text-alt">
				<div class="tooltip" data-tip={tooltip}>
					<Info class="h-4 w-4 text-base-content/50" />
				</div>
			</span>
		{/if}
	</label>

	{@render children()}

	{#if error}
		<div class="label py-1">
			<span class="label-text-alt text-error">{error}</span>
		</div>
	{:else if helpText}
		<div class="label py-1">
			<span class="label-text-alt text-xs text-base-content/60">{helpText}</span>
		</div>
	{/if}
</div>
