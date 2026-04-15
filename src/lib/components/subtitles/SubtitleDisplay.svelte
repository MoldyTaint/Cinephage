<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import SubtitleBadge from './SubtitleBadge.svelte';
	import SubtitleSyncBadge from './SubtitleSyncBadge.svelte';

	interface Subtitle {
		id: string;
		language: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
		wasSynced?: boolean;
		syncOffset?: number | null;
	}

	interface Props {
		subtitles: Subtitle[];
		maxDisplay?: number;
		size?: 'xs' | 'sm' | 'md';
		showSyncStatus?: boolean;
		noWrap?: boolean;
		countVariant?: 'text' | 'badge';
	}

	let {
		subtitles,
		maxDisplay = 5,
		size = 'sm',
		showSyncStatus = false,
		noWrap = false,
		countVariant = 'text'
	}: Props = $props();

	// Group by language, keeping track of forced/HI variants
	const grouped = $derived.by(() => {
		const byLang = new SvelteMap<string, Subtitle[]>();
		for (const sub of subtitles) {
			const existing = byLang.get(sub.language) || [];
			existing.push(sub);
			byLang.set(sub.language, existing);
		}
		return byLang;
	});

	// Get unique subtitles to display (prefer regular over forced/HI for display)
	const displaySubtitles = $derived.by(() => {
		const result: Subtitle[] = [];
		for (const [, subs] of grouped) {
			// Find the "main" subtitle (prefer regular, then forced, then HI)
			const regular = subs.find((s) => !s.isForced && !s.isHearingImpaired);
			const forced = subs.find((s) => s.isForced);
			const hi = subs.find((s) => s.isHearingImpaired);

			if (regular) result.push(regular);
			if (forced) result.push(forced);
			if (hi && !forced) result.push(hi);
		}
		return result.slice(0, maxDisplay);
	});

	const hiddenCount = $derived(subtitles.length - displaySubtitles.length);
</script>

{#if subtitles.length > 0}
	<div
		class="flex items-center gap-1 {noWrap ? 'min-w-0 flex-nowrap overflow-hidden' : 'flex-wrap'}"
	>
		{#each displaySubtitles as sub (sub.id)}
			<div class="flex shrink-0 items-center gap-1">
				<SubtitleBadge
					language={sub.language}
					isForced={sub.isForced}
					isHearingImpaired={sub.isHearingImpaired}
					format={sub.format}
					{size}
				/>
				{#if showSyncStatus && sub.wasSynced}
					<SubtitleSyncBadge wasSynced={sub.wasSynced} syncOffset={sub.syncOffset} {size} />
				{/if}
			</div>
		{/each}
		{#if hiddenCount > 0}
			<span
				class="shrink-0 {countVariant === 'badge'
					? 'badge badge-outline badge-xs text-base-content/70'
					: 'text-xs text-base-content/50'}"
			>
				+{hiddenCount}
			</span>
		{/if}
	</div>
{:else}
	<span class="text-xs text-base-content/40">No subtitles</span>
{/if}
