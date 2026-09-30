<script lang="ts">
	interface Props {
		/** Display name; its first letter is the fallback when no image loads. */
		name: string;
		/** Optional avatar image URL (e.g. the Jellyfin avatar proxy route). */
		src?: string | null;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}

	let { name, src = null, size = 'sm', class: className = '' }: Props = $props();

	let failed = $state(false);

	const sizeClass = $derived(
		size === 'lg' ? 'h-16 w-16 text-2xl' : size === 'md' ? 'h-9 w-9 text-sm' : 'h-8 w-8 text-sm'
	);
</script>

<span
	class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-semibold text-primary {sizeClass} {className}"
>
	<span aria-hidden="true">{(name || '?').charAt(0).toUpperCase()}</span>
	{#if src && !failed}
		<img
			{src}
			alt={name}
			class="absolute inset-0 h-full w-full object-cover"
			onerror={() => (failed = true)}
		/>
	{/if}
</span>
