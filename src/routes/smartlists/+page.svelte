<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
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

	let refreshingIds = $state<Set<string>>(new Set());
	let deletingIds = $state<Set<string>>(new Set());

	function navigateToCreate() {
		goto('/smartlists/new');
	}

	function navigateToEdit(listId: string) {
		goto(`/smartlists/${listId}/edit`);
	}

	function navigateToDetail(listId: string) {
		goto(`/smartlists/${listId}`);
	}

	async function refreshList(id: string) {
		refreshingIds.add(id);
		refreshingIds = refreshingIds;
		try {
			await fetch(`/api/smartlists/${id}/refresh`, { method: 'POST' });
			await invalidateAll();
		} finally {
			refreshingIds.delete(id);
			refreshingIds = refreshingIds;
		}
	}

	async function deleteList(id: string) {
		if (!confirm('Are you sure you want to delete this smart list?')) return;

		deletingIds.add(id);
		deletingIds = deletingIds;
		try {
			await fetch(`/api/smartlists/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} finally {
			deletingIds.delete(id);
			deletingIds = deletingIds;
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
</script>

<svelte:head>
	<title>Smart Lists - Cinephage</title>
</svelte:head>

<div class="w-full p-4">
	<div class="mb-6 flex items-center justify-between">
		<div>
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
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each data.lists as list (list.id)}
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body">
						<div class="flex items-start justify-between">
							<button
								class="flex items-center gap-2 text-left hover:opacity-80"
								onclick={() => navigateToDetail(list.id)}
							>
								{#if list.mediaType === 'movie'}
									<Film class="h-5 w-5 text-primary" />
								{:else}
									<Tv class="h-5 w-5 text-secondary" />
								{/if}
								<h2 class="card-title text-lg">{list.name}</h2>
							</button>
							<input
								type="checkbox"
								class="toggle toggle-sm toggle-success"
								checked={list.enabled}
								onchange={() => toggleEnabled(list)}
							/>
						</div>

						{#if list.description}
							<p class="text-sm text-base-content/70">{list.description}</p>
						{/if}

						<div class="mt-2 flex flex-wrap gap-2">
							<div class="badge badge-ghost">
								{list.cachedItemCount ?? 0} items
							</div>
							<div class="badge badge-ghost">
								{list.itemsInLibrary ?? 0} in library
							</div>
							{#if list.autoAddBehavior !== 'disabled'}
								<div class="badge badge-outline badge-info">Auto-add</div>
							{/if}
							{#if list.listSourceType === 'external-json'}
								{#if list.presetProvider === 'imdb-list'}
									<div class="badge badge-outline badge-secondary">IMDb</div>
								{:else if list.presetProvider === 'tmdb-list'}
									<div class="badge badge-outline badge-primary">TMDB List</div>
								{:else if list.presetProvider === 'stevenlu'}
									<div class="badge badge-outline badge-success">StevenLu</div>
								{:else}
									<div class="badge badge-outline badge-secondary">External</div>
								{/if}
							{:else if list.listSourceType === 'trakt-list'}
								<div class="badge badge-outline badge-accent">Trakt</div>
							{:else if list.listSourceType === 'custom-manual'}
								<div class="badge badge-outline badge-warning">Custom</div>
							{:else if list.listSourceType === 'tmdb-discover'}
								<div class="badge badge-outline badge-primary">TMDB Discover</div>
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
								<span>Last refresh: {formatDate(list.lastRefreshTime)}</span>
							</div>
						</div>

						<div class="mt-2 card-actions justify-end">
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => navigateToDetail(list.id)}
								title="View list"
							>
								<ExternalLink class="h-4 w-4" />
							</button>
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => refreshList(list.id)}
								disabled={refreshingIds.has(list.id)}
								title="Refresh"
							>
								<RefreshCw class="h-4 w-4 {refreshingIds.has(list.id) ? 'animate-spin' : ''}" />
							</button>
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => navigateToEdit(list.id)}
								title="Edit"
							>
								<Edit class="h-4 w-4" />
							</button>
							<button
								class="btn btn-ghost btn-sm btn-error"
								onclick={() => deleteList(list.id)}
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
