<script lang="ts">
	interface Props {
		label: string;
		description?: string;
		checked: boolean;
		disabled?: boolean;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		variant?: 'checkbox' | 'toggle';
		color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'info' | 'error';
		onchange?: (checked: boolean) => void;
	}

	let {
		label,
		description,
		checked = $bindable(),
		disabled = false,
		size = 'sm',
		variant = 'checkbox',
		color = 'primary',
		onchange
	}: Props = $props();

	function handleChange(e: Event) {
		const target = e.target as HTMLInputElement;
		checked = target.checked;
		onchange?.(checked);
	}

	const inputClass = $derived(
		variant === 'toggle'
			? `toggle toggle-${size} toggle-${color} mt-0.5 shrink-0`
			: `checkbox checkbox-${size} checkbox-${color} mt-0.5 shrink-0`
	);
</script>

<label class="flex cursor-pointer items-start gap-3 py-2">
	<input type="checkbox" class={inputClass} {checked} {disabled} onchange={handleChange} />
	<div class="min-w-0">
		<span class="text-sm">{label}</span>
		{#if description}
			<p class="text-xs wrap-break-word whitespace-normal text-base-content/60">{description}</p>
		{/if}
	</div>
</label>
