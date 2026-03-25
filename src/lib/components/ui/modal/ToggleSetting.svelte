<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		checked: boolean;
		label: string;
		description?: string;
		disabled?: boolean;
		onchange?: () => void;
	}

	let { checked = $bindable(), label, description, disabled = false, onchange }: Props = $props();

	function handleChange() {
		if (onchange) {
			onchange();
		}
	}
</script>

<label class="flex cursor-pointer items-start gap-3 py-2">
	<input
		type="checkbox"
		class="checkbox mt-0.5 shrink-0 checkbox-sm"
		bind:checked
		{disabled}
		onchange={handleChange}
	/>
	<div class="min-w-0">
		<span class="text-sm">{label}</span>
		{#if description}
			<p class="text-xs text-base-content/50">{description}</p>
		{/if}
	</div>
</label>
