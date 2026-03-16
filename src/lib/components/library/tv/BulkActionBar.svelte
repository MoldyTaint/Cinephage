<script lang="ts">
	import { X, Download, Loader2, Subtitles, RefreshCw } from 'lucide-svelte';

	interface Props {
		selectedCount: number;
		searching: boolean;
		subtitleAutoSearching?: boolean;
		subtitleSyncing?: boolean;
		onSearch: () => void;
		onClear: () => void;
		onSubtitleAutoSearch?: () => void;
		onSubtitleSync?: () => void;
	}

	let {
		selectedCount,
		searching,
		subtitleAutoSearching = false,
		subtitleSyncing = false,
		onSearch,
		onClear,
		onSubtitleAutoSearch,
		onSubtitleSync
	}: Props = $props();
</script>

{#if selectedCount > 0}
	<div
		class="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 mx-auto max-w-fit"
	>
		<div
			class="flex items-center gap-3 rounded-full border border-base-content/10 bg-base-300 px-4 py-2.5 shadow-xl sm:gap-4 sm:px-6 sm:py-3"
		>
			<span class="text-sm font-medium">
				{selectedCount} episode{selectedCount !== 1 ? 's' : ''} selected
			</span>

			<div class="flex items-center gap-2">
				<button class="btn gap-2 btn-sm btn-primary" onclick={onSearch} disabled={searching}>
					{#if searching}
						<Loader2 size={16} class="animate-spin" />
						Searching...
					{:else}
						<Download size={16} />
						Search Selected
					{/if}
				</button>

				{#if onSubtitleAutoSearch}
					<button
						class="btn gap-2 btn-sm btn-secondary"
						onclick={onSubtitleAutoSearch}
						disabled={subtitleAutoSearching}
						title="Auto-download subtitles for selected episodes"
					>
						{#if subtitleAutoSearching}
							<Loader2 size={16} class="animate-spin" />
							Downloading...
						{:else}
							<Subtitles size={16} />
							<span class="hidden sm:inline">Auto-download Subs</span>
							<span class="sm:hidden">Subs</span>
						{/if}
					</button>
				{/if}

				{#if onSubtitleSync}
					<button
						class="btn gap-2 btn-outline btn-sm"
						onclick={onSubtitleSync}
						disabled={subtitleSyncing}
						title="Sync subtitles for selected episodes"
					>
						{#if subtitleSyncing}
							<Loader2 size={16} class="animate-spin" />
							Syncing...
						{:else}
							<RefreshCw size={16} />
							<span class="hidden sm:inline">Sync Subs</span>
							<span class="sm:hidden">Sync</span>
						{/if}
					</button>
				{/if}

				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClear} title="Clear selection">
					<X size={16} />
				</button>
			</div>
		</div>
	</div>
{/if}
