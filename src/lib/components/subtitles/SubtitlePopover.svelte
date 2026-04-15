<script lang="ts">
	import { RefreshCw, Trash2, Search, Captions, CaptionsOff, Loader2, Clock3 } from 'lucide-svelte';
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
		isEmbedded?: boolean;
	}

	interface Props {
		subtitles: Subtitle[];
		hasFile: boolean;
		syncingId?: string | null;
		deletingId?: string | null;
		onSync?: (subtitleId: string) => void;
		onDelete?: (subtitleId: string) => void;
		onSearch?: () => void;
		onAutoSearch?: () => void;
	}

	let {
		subtitles,
		hasFile,
		syncingId = null,
		deletingId = null,
		onSync,
		onDelete,
		onSearch,
		onAutoSearch
	}: Props = $props();

	let confirmDeleteId = $state<string | null>(null);

	const externalSubtitles = $derived(subtitles.filter((s) => !s.isEmbedded));
	const embeddedSubtitles = $derived(subtitles.filter((s) => s.isEmbedded));

	function formatOffset(syncOffset?: number | null): string {
		if (syncOffset === null || syncOffset === undefined) return 'Not synced';
		const seconds = syncOffset / 1000;
		const rounded = Math.abs(seconds) >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
		const prefix = seconds > 0 ? '+' : '';
		return `${prefix}${rounded}s`;
	}

	function handleDelete(subtitleId: string) {
		if (confirmDeleteId === subtitleId) {
			onDelete?.(subtitleId);
			confirmDeleteId = null;
		} else {
			confirmDeleteId = subtitleId;
		}
	}

	function cancelDelete() {
		confirmDeleteId = null;
	}
</script>

<div
	tabindex="0"
	role="dialog"
	class="dropdown-content z-50 w-72 rounded-lg border border-base-300 bg-base-200 p-3 shadow-xl sm:w-80"
	onmouseleave={cancelDelete}
>
	{#if !hasFile}
		<div class="py-2 text-center text-sm text-base-content/50">No media file available</div>
	{:else if subtitles.length === 0}
		<!-- No subtitles at all -->
		<div class="space-y-3">
			<div class="py-2 text-center text-sm text-base-content/50">
				<CaptionsOff size={20} class="mx-auto mb-1 text-base-content/30" />
				No subtitles
			</div>
			<div class="flex gap-2">
				{#if onAutoSearch}
					<button class="btn flex-1 gap-1 btn-xs btn-primary" onclick={onAutoSearch}>
						<Captions size={12} />
						Auto-download
					</button>
				{/if}
				{#if onSearch}
					<button class="btn flex-1 gap-1 btn-outline btn-xs" onclick={onSearch}>
						<Search size={12} />
						Search
					</button>
				{/if}
			</div>
		</div>
	{:else}
		<div class="space-y-2">
			<!-- External subtitles (downloaded) -->
			{#if externalSubtitles.length > 0}
				<div class="text-xs font-semibold text-base-content/50">Downloaded</div>
				{#each externalSubtitles as sub (sub.id)}
					<div class="flex items-center justify-between gap-2 rounded-md bg-base-100 px-2 py-1.5">
						<div class="flex min-w-0 flex-col gap-1">
							<div class="flex items-center gap-1.5">
								<SubtitleBadge
									language={sub.language}
									isForced={sub.isForced}
									isHearingImpaired={sub.isHearingImpaired}
									format={sub.format}
									size="xs"
								/>
								{#if sub.wasSynced}
									<SubtitleSyncBadge
										wasSynced={sub.wasSynced}
										syncOffset={sub.syncOffset}
										size="xs"
									/>
								{/if}
							</div>
							<div class="flex items-center gap-1 text-xs text-base-content/50">
								<Clock3 size={10} />
								<span>{formatOffset(sub.syncOffset)}</span>
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-1">
							{#if onSync}
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => onSync?.(sub.id)}
									disabled={syncingId === sub.id}
									title="Re-sync subtitle"
								>
									{#if syncingId === sub.id}
										<Loader2 size={12} class="animate-spin" />
									{:else}
										<RefreshCw size={12} />
									{/if}
								</button>
							{/if}
							{#if onDelete}
								{#if confirmDeleteId === sub.id}
									<button
										class="btn btn-xs btn-error"
										onclick={() => handleDelete(sub.id)}
										disabled={deletingId === sub.id}
									>
										{#if deletingId === sub.id}
											<Loader2 size={12} class="animate-spin" />
										{:else}
											Confirm
										{/if}
									</button>
								{:else}
									<button
										class="btn text-error/60 btn-ghost btn-xs hover:text-error"
										onclick={() => handleDelete(sub.id)}
										title="Delete subtitle"
									>
										<Trash2 size={12} />
									</button>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			{/if}

			<!-- Embedded subtitles -->
			{#if embeddedSubtitles.length > 0}
				<div class="text-xs font-semibold text-base-content/50">Embedded</div>
				{#each embeddedSubtitles as sub (sub.id)}
					<div class="flex items-center gap-1.5 rounded-md bg-base-100/50 px-2 py-1.5">
						<SubtitleBadge
							language={sub.language}
							isForced={sub.isForced}
							isHearingImpaired={sub.isHearingImpaired}
							format={sub.format}
							size="xs"
						/>
						<span class="text-xs text-base-content/40">embedded</span>
					</div>
				{/each}
			{/if}

			<!-- Actions -->
			<div class="border-t border-base-300 pt-2">
				<div class="flex gap-2">
					{#if onAutoSearch}
						<button class="btn flex-1 gap-1 btn-ghost btn-xs" onclick={onAutoSearch}>
							<Captions size={12} />
							Auto-download
						</button>
					{/if}
					{#if onSearch}
						<button class="btn flex-1 gap-1 btn-ghost btn-xs" onclick={onSearch}>
							<Search size={12} />
							Search subs
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
