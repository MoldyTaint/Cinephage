<script lang="ts">
	import { Info } from 'lucide-svelte';

	interface Props {
		label: string;
		id: string;
		value: string;
		rows?: number;
		placeholder?: string;
		helpText?: string;
		error?: string | null;
		tooltip?: string;
		disabled?: boolean;
		required?: boolean;
		onchange?: (value: string) => void;
	}

	let {
		label,
		id,
		value = $bindable(),
		rows = 3,
		placeholder,
		helpText,
		error = null,
		tooltip,
		disabled = false,
		required = false,
		onchange
	}: Props = $props();

	function handleInput(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		value = target.value;
		onchange?.(value);
	}
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

	<textarea
		{id}
		class="textarea-bordered textarea w-full"
		class:textarea-error={error}
		{rows}
		{placeholder}
		{disabled}
		{value}
		oninput={handleInput}
	></textarea>

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
