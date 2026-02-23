<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { SvelteSet } from 'svelte/reactivity';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import {
		Plus,
		List,
		RefreshCw,
		Trash2,
		Edit,
		Film,
		Tv,
		CheckCircle,
		AlertCircle,
		Clock,
		ExternalLink
	} from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let refreshingIds = new SvelteSet<string>();
	let deletingIds = new SvelteSet<string>();
	let actionError = $state<string | null>(null);
	let confirmDeleteOpen = $state(false);
	let deleteLoading = $state(false);
	let deleteTarget = $state<{ id: string; name: string } | null>(null);
	type SmartListRow = (typeof data.lists)[number];

	function navigateToCreate() {
		goto('/smartlists/new');
	}

	async function refreshList(id: string) {
		actionError = null;
		refreshingIds.add(id);
		try {
			const response = await fetch(`/api/smartlists/${id}/refresh`, { method: 'POST' });
			const result = (await response.json().catch(() => null)) as {
				error?: string;
				errorMessage?: string;
				status?: string;
			} | null;

			if (!response.ok || result?.status === 'failed') {
				throw new Error(result?.errorMessage ?? result?.error ?? 'Smart list refresh failed');
			}

			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Smart list refresh failed';
		} finally {
			refreshingIds.delete(id);
		}
	}

	function openDeleteModal(list: (typeof data.lists)[0]) {
		actionError = null;
		deleteTarget = { id: list.id, name: list.name };
		confirmDeleteOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget || deleteLoading) return;

		const { id } = deleteTarget;
		deleteLoading = true;
		deletingIds.add(id);
		try {
			const response = await fetch(`/api/smartlists/${id}`, { method: 'DELETE' });
			const result = (await response.json().catch(() => null)) as { error?: string } | null;

			if (!response.ok) {
				throw new Error(result?.error ?? 'Failed to delete smart list');
			}

			await invalidateAll();
			confirmDeleteOpen = false;
			deleteTarget = null;
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Failed to delete smart list';
		} finally {
			deleteLoading = false;
			deletingIds.delete(id);
		}
	}

	async function toggleEnabled(list: (typeof data.lists)[0]) {
		await fetch(`/api/smartlists/${list.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ enabled: !list.enabled })
		});
		await invalidateAll();
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'Never';
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}

	function getSortLabel(sortBy: string | null | undefined): string {
		switch (sortBy) {
			case 'popularity.desc':
				return 'most popular first';
			case 'popularity.asc':
				return 'least popular first';
			case 'vote_average.desc':
				return 'highest rated first';
			case 'vote_average.asc':
				return 'lowest rated first';
			case 'primary_release_date.desc':
			case 'first_air_date.desc':
				return 'newest first';
			case 'primary_release_date.asc':
			case 'first_air_date.asc':
				return 'oldest first';
			case 'title.asc':
				return 'title A-Z';
			case 'title.desc':
				return 'title Z-A';
			default:
				return 'custom order';
		}
	}

	function getSourceLabel(list: SmartListRow): string {
		if (list.listSourceType === 'external-json') {
			if (list.presetProvider === 'imdb-list') return 'IMDb';
			if (list.presetProvider === 'tmdb-list') return 'TMDB list';
			if (list.presetProvider === 'stevenlu') return 'StevenLu';
			return 'an external source';
		}
		if (list.listSourceType === 'trakt-list') return 'Trakt';
		if (list.listSourceType === 'custom-manual') return 'manual curation';
		return 'TMDB Discover';
	}

	function getDisplayDescription(list: SmartListRow): string {
		const explicit = list.description?.trim();
		if (explicit) return explicit;

		const mediaLabel = list.mediaType === 'movie' ? 'movies' : 'TV shows';
		const autoAddSuffix = list.autoAddBehavior !== 'disabled' ? ' Auto-add is enabled.' : '';

		if (list.listSourceType === 'tmdb-discover') {
			const filters = (list.filters ?? {}) as Record<string, unknown>;
			const hints: string[] = [];
			const withGenres = Array.isArray(filters.withGenres) ? filters.withGenres.length : 0;
			const withKeywords = Array.isArray(filters.withKeywords) ? filters.withKeywords.length : 0;
			const yearMin = typeof filters.yearMin === 'number' ? filters.yearMin : undefined;
			const yearMax = typeof filters.yearMax === 'number' ? filters.yearMax : undefined;
			const voteAverageMin =
				typeof filters.voteAverageMin === 'number' ? filters.voteAverageMin : undefined;

			if (withGenres > 0) hints.push(`${withGenres} genre filter${withGenres === 1 ? '' : 's'}`);
			if (withKeywords > 0)
				hints.push(`${withKeywords} keyword filter${withKeywords === 1 ? '' : 's'}`);
			if (yearMin || yearMax) {
				const min = yearMin ?? 'any';
				const max = yearMax ?? 'any';
				hints.push(`years ${min}-${max}`);
			}
			if (voteAverageMin !== undefined) hints.push(`rated ${voteAverageMin}+`);
			if (list.excludeInLibrary) hints.push('excluding items already in library');

			const hintText = hints.length > 0 ? ` ${hints.slice(0, 2).join(', ')}.` : '.';
			return `TMDB Discover ${mediaLabel}, sorted ${getSortLabel(list.sortBy)}.${hintText}${autoAddSuffix}`;
		}

		if (list.listSourceType === 'external-json') {
			return `Synced from ${getSourceLabel(list)} for ${mediaLabel}.${autoAddSuffix}`;
		}

		if (list.listSourceType === 'trakt-list') {
			return `Synced from Trakt for ${mediaLabel}.${autoAddSuffix}`;
		}

		if (list.listSourceType === 'custom-manual') {
			return `Manually curated ${mediaLabel}.${autoAddSuffix}`;
		}

		return `Dynamic ${mediaLabel} list.${autoAddSuffix}`;
	}
</script>

<svelte:head>
	<title>Smart Lists - Cinephage</title>
</svelte:head>

<div class="w-full p-3 sm:p-4">
	{#if actionError}
		<div class="mb-4 alert py-2 alert-error">
			<AlertCircle class="h-4 w-4" />
			<span>{actionError}</span>
		</div>
	{/if}

	<div class="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold">Smart Lists</h1>
			<p class="text-base-content/70">
				Create dynamic lists that automatically populate from TMDB based on your filters.
			</p>
		</div>
		<button class="btn gap-2 btn-sm btn-primary sm:w-auto" onclick={navigateToCreate}>
			<Plus class="h-4 w-4" />
			Create Smart List
		</button>
	</div>

	{#if data.lists.length === 0}
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body items-center text-center">
				<List class="h-16 w-16 text-base-content/30" />
				<h2 class="card-title">No Smart Lists Yet</h2>
				<p class="text-base-content/70">
					Create your first smart list to automatically discover movies and TV shows based on your
					preferences.
				</p>
				<button class="btn mt-4 btn-primary" onclick={navigateToCreate}>
					<Plus class="h-4 w-4" />
					Create Smart List
				</button>
			</div>
		</div>
	{:else}
		<div class="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each data.lists as list (list.id)}
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body p-4 sm:p-6">
						<div class="flex items-start justify-between gap-3">
							<a
								class="flex min-w-0 items-center gap-2 text-left hover:opacity-80"
								href={`/smartlists/${list.id}`}
								data-sveltekit-preload-data="hover"
							>
								{#if list.mediaType === 'movie'}
									<Film class="h-5 w-5 shrink-0 text-primary" />
								{:else}
									<Tv class="h-5 w-5 shrink-0 text-secondary" />
								{/if}
								<h2 class="card-title min-w-0 truncate text-lg">{list.name}</h2>
							</a>
							<input
								type="checkbox"
								class="toggle shrink-0 toggle-sm toggle-success"
								checked={list.enabled}
								onchange={() => toggleEnabled(list)}
							/>
						</div>

						<div class="h-10">
							<p class="line-clamp-2 text-sm leading-5 text-base-content/70">
								{getDisplayDescription(list)}
							</p>
						</div>

						<div class="mt-2 flex flex-wrap gap-1.5 sm:gap-2">
							<div class="badge badge-ghost badge-sm">
								{list.cachedItemCount ?? 0} items
							</div>
							<div class="badge badge-ghost badge-sm">
								{list.itemsInLibrary ?? 0} in library
							</div>
							{#if list.autoAddBehavior !== 'disabled'}
								<div class="badge badge-outline badge-sm badge-info">Auto-add</div>
							{/if}
							{#if list.listSourceType === 'external-json'}
								{#if list.presetProvider === 'imdb-list'}
									<div class="badge badge-outline badge-sm badge-secondary">IMDb</div>
								{:else if list.presetProvider === 'tmdb-list'}
									<div class="badge badge-outline badge-sm badge-primary">TMDB List</div>
								{:else if list.presetProvider === 'stevenlu'}
									<div class="badge badge-outline badge-sm badge-success">StevenLu</div>
								{:else}
									<div class="badge badge-outline badge-sm badge-secondary">External</div>
								{/if}
							{:else if list.listSourceType === 'trakt-list'}
								<div class="badge badge-outline badge-sm badge-accent">Trakt</div>
							{:else if list.listSourceType === 'custom-manual'}
								<div class="badge badge-outline badge-sm badge-warning">Custom</div>
							{:else if list.listSourceType === 'tmdb-discover'}
								<div class="badge badge-outline badge-sm badge-primary">TMDB Discover</div>
							{/if}
						</div>

						<div class="divider my-2"></div>

						<div class="flex items-center justify-between text-sm text-base-content/60">
							<div class="flex items-center gap-1">
								{#if list.lastRefreshStatus === 'success'}
									<CheckCircle class="h-4 w-4 text-success" />
								{:else if list.lastRefreshStatus === 'failed'}
									<AlertCircle class="h-4 w-4 text-error" />
								{:else}
									<Clock class="h-4 w-4" />
								{/if}
								<span class="truncate">Last refresh: {formatDate(list.lastRefreshTime)}</span>
							</div>
						</div>

						<div class="mt-3 grid grid-cols-4 gap-2 sm:hidden">
							<a
								class="btn gap-1 btn-outline btn-sm"
								href={`/smartlists/${list.id}`}
								data-sveltekit-preload-data="hover"
								title="View list"
							>
								<ExternalLink class="h-4 w-4" />
								View
							</a>
							<button
								class="btn gap-1 btn-outline btn-sm"
								onclick={() => refreshList(list.id)}
								disabled={refreshingIds.has(list.id)}
								title="Refresh"
							>
								<RefreshCw class="h-4 w-4 {refreshingIds.has(list.id) ? 'animate-spin' : ''}" />
							</button>
							<a
								class="btn gap-1 btn-outline btn-sm"
								href={`/smartlists/${list.id}/edit`}
								data-sveltekit-preload-data="hover"
								title="Edit"
							>
								<Edit class="h-4 w-4" />
								Edit
							</a>
							<button
								class="btn gap-1 btn-outline btn-sm btn-error"
								onclick={() => openDeleteModal(list)}
								disabled={deletingIds.has(list.id)}
								title="Delete"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>

						<div class="mt-2 card-actions hidden justify-end sm:flex">
							<a
								class="btn btn-ghost btn-sm"
								href={`/smartlists/${list.id}`}
								data-sveltekit-preload-data="hover"
								title="View list"
							>
								<ExternalLink class="h-4 w-4" />
							</a>
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => refreshList(list.id)}
								disabled={refreshingIds.has(list.id)}
								title="Refresh"
							>
								<RefreshCw class="h-4 w-4 {refreshingIds.has(list.id) ? 'animate-spin' : ''}" />
							</button>
							<a
								class="btn btn-ghost btn-sm"
								href={`/smartlists/${list.id}/edit`}
								data-sveltekit-preload-data="hover"
								title="Edit"
							>
								<Edit class="h-4 w-4" />
							</a>
							<button
								class="btn btn-ghost btn-sm btn-error"
								onclick={() => openDeleteModal(list)}
								disabled={deletingIds.has(list.id)}
								title="Delete"
							>
								<Trash2 class="h-4 w-4" />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<ConfirmationModal
	open={confirmDeleteOpen}
	title="Delete Smart List"
	messagePrefix="Delete "
	messageEmphasis={deleteTarget?.name ?? 'this smart list'}
	messageSuffix="? This action cannot be undone."
	confirmLabel="Delete"
	confirmVariant="error"
	loading={deleteLoading}
	onConfirm={handleConfirmDelete}
	onCancel={() => {
		confirmDeleteOpen = false;
		deleteTarget = null;
	}}
/>
