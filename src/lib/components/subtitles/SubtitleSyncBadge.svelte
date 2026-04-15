<script lang="ts">
	interface Props {
		wasSynced?: boolean;
		syncOffset?: number | null;
		size?: 'xs' | 'sm' | 'md';
		showLabel?: boolean;
	}

	let { wasSynced = false, syncOffset = null, size = 'sm', showLabel = false }: Props = $props();

	const offsetLabel = $derived.by(() => {
		if (!wasSynced || syncOffset === null || syncOffset === undefined) {
			return null;
		}

		const seconds = syncOffset / 1000;
		const rounded = Math.abs(seconds) >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
		const prefix = seconds > 0 ? '+' : '';

		return `${prefix}${rounded}s`;
	});

	const sizeClasses = {
		xs: 'badge-xs text-[10px]',
		sm: 'badge-sm text-xs',
		md: 'text-sm'
	};
</script>

{#if wasSynced}
	<span
		class={`badge gap-1 badge-soft badge-accent ${sizeClasses[size]}`}
		title={offsetLabel ? `Subtitle synced (${offsetLabel})` : 'Subtitle synced'}
	>
		<span>SYNC</span>
		{#if showLabel && offsetLabel}
			<span class="font-mono opacity-80">{offsetLabel}</span>
		{/if}
	</span>
{/if}
