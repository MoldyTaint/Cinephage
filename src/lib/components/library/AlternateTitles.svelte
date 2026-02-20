<script lang="ts">
	import { Plus, X, Globe, User, Loader2 } from 'lucide-svelte';
	import { mediaTypeApiSegment, type MediaType } from '$lib/utils/media-type';

	interface AlternateTitle {
		id: number;
		title: string;
		source: 'tmdb' | 'user';
		language?: string | null;
		country?: string | null;
	}

	interface Props {
		mediaType: MediaType;
		mediaId: string;
		primaryTitle?: string;
		originalTitle?: string | null;
	}

	let { mediaType, mediaId, primaryTitle = '', originalTitle = null }: Props = $props();

	let alternateTitles = $state<AlternateTitle[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let newTitle = $state('');
	let adding = $state(false);
	let deletingId = $state<number | null>(null);

	// Fetch alternate titles on mount
	$effect(() => {
		fetchAlternateTitles();
	});

	async function fetchAlternateTitles() {
		loading = true;
		error = null;
		try {
			const response = await fetch(
				`/api/library/${mediaTypeApiSegment(mediaType)}/${mediaId}/alternate-titles`
			);
			const data = await response.json();
			if (data.success) {
				alternateTitles = data.alternateTitles;
			} else {
				error = data.error || 'Failed to fetch alternate titles';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch alternate titles';
		} finally {
			loading = false;
		}
	}

	async function addTitle() {
		if (!newTitle.trim() || adding) return;

		adding = true;
		error = null;
		try {
			const response = await fetch(
				`/api/library/${mediaTypeApiSegment(mediaType)}/${mediaId}/alternate-titles`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ title: newTitle.trim() })
				}
			);
			const data = await response.json();
			if (data.success) {
				alternateTitles = [...alternateTitles, data.alternateTitle];
				newTitle = '';
			} else {
				error = data.error || 'Failed to add alternate title';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add alternate title';
		} finally {
			adding = false;
		}
	}

	async function removeTitle(title: AlternateTitle) {
		if (title.source !== 'user' || deletingId !== null) return;

		deletingId = title.id;
		error = null;
		try {
			const response = await fetch(
				`/api/library/${mediaTypeApiSegment(mediaType)}/${mediaId}/alternate-titles`,
				{
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: title.id })
				}
			);
			const data = await response.json();
			if (data.success) {
				alternateTitles = alternateTitles.filter((t) => t.id !== title.id);
			} else {
				error = data.error || 'Failed to remove alternate title';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to remove alternate title';
		} finally {
			deletingId = null;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addTitle();
		}
	}

	const tmdbTitles = $derived(alternateTitles.filter((t) => t.source === 'tmdb'));
	const userTitles = $derived(alternateTitles.filter((t) => t.source === 'user'));
</script>

<div class="space-y-4">
	<!-- Primary and Original Titles -->
	<div class="space-y-2">
		{#if primaryTitle}
			<div class="flex items-center gap-2">
				<span class="badge badge-sm badge-primary">Primary</span>
				<span class="text-sm">{primaryTitle}</span>
			</div>
		{/if}
		{#if originalTitle && originalTitle !== primaryTitle}
			<div class="flex items-center gap-2">
				<span class="badge badge-sm badge-secondary">Original</span>
				<span class="text-sm">{originalTitle}</span>
			</div>
		{/if}
	</div>

	<!-- Loading State -->
	{#if loading}
		<div class="flex items-center justify-center py-4">
			<Loader2 class="h-5 w-5 animate-spin text-base-content/50" />
		</div>
	{:else}
		<!-- TMDB Alternate Titles -->
		{#if tmdbTitles.length > 0}
			<div class="space-y-2">
				<h4 class="flex items-center gap-2 text-sm font-medium text-base-content/70">
					<Globe class="h-4 w-4" />
					From TMDB ({tmdbTitles.length})
				</h4>
				<div class="flex flex-wrap gap-2">
					{#each tmdbTitles as title (title.id)}
						<div
							class="badge gap-1 badge-outline badge-sm"
							title={title.country ? `${title.country}` : undefined}
						>
							{title.title}
							{#if title.country}
								<span class="opacity-50">({title.country})</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- User Alternate Titles -->
		<div class="space-y-2">
			<h4 class="flex items-center gap-2 text-sm font-medium text-base-content/70">
				<User class="h-4 w-4" />
				Custom Titles ({userTitles.length})
			</h4>
			{#if userTitles.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each userTitles as title (title.id)}
						<div class="badge gap-1 badge-sm badge-info">
							{title.title}
							<button
								class="btn h-auto min-h-0 p-0 btn-ghost btn-xs"
								onclick={() => removeTitle(title)}
								disabled={deletingId === title.id}
								title="Remove"
							>
								{#if deletingId === title.id}
									<Loader2 class="h-3 w-3 animate-spin" />
								{:else}
									<X class="h-3 w-3" />
								{/if}
							</button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-base-content/50">No custom titles added</p>
			{/if}

			<!-- Add Title Input -->
			<div class="mt-3 flex gap-2">
				<input
					type="text"
					class="input-bordered input input-sm flex-1"
					placeholder="Add custom search title..."
					bind:value={newTitle}
					onkeydown={handleKeydown}
					disabled={adding}
				/>
				<button
					class="btn btn-sm btn-primary"
					onclick={addTitle}
					disabled={!newTitle.trim() || adding}
				>
					{#if adding}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Plus class="h-4 w-4" />
					{/if}
					Add
				</button>
			</div>
		</div>
	{/if}

	<!-- Error Display -->
	{#if error}
		<div class="alert-sm alert alert-error">
			<span>{error}</span>
		</div>
	{/if}
</div>
