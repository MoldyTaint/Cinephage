<script lang="ts">
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { unmatchedFilesStore } from '$lib/stores/unmatched-files.svelte.js';

	let pagination = $derived(unmatchedFilesStore.pagination);

	function setPage(page: number) {
		if (page >= 1 && page <= pagination.totalPages) {
			unmatchedFilesStore.setPage(page);
		}
	}

	function setLimit(limit: number) {
		unmatchedFilesStore.setLimit(limit);
	}

	// Generate page numbers to show
	function getPageNumbers(): number[] {
		const pages: number[] = [];
		const start = Math.max(1, pagination.page - 2);
		const end = Math.min(pagination.totalPages, pagination.page + 2);

		for (let i = start; i <= end; i++) {
			pages.push(i);
		}

		return pages;
	}
</script>

{#if pagination.totalPages > 1}
	<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
		<div class="text-sm text-base-content/70">
			Showing {(pagination.page - 1) * pagination.limit + 1} -
			{Math.min(pagination.page * pagination.limit, pagination.total)} of
			{pagination.total} files
		</div>

		<div class="flex items-center gap-2">
			<!-- Previous -->
			<button
				class="btn btn-sm"
				onclick={() => setPage(pagination.page - 1)}
				disabled={pagination.page === 1}
			>
				<ChevronLeft class="h-4 w-4" />
			</button>

			<!-- Page Numbers -->
			{#each getPageNumbers() as pageNum (pageNum)}
				<button
					class="btn btn-sm {pageNum === pagination.page ? 'btn-primary' : ''}"
					onclick={() => setPage(pageNum)}
				>
					{pageNum}
				</button>
			{/each}

			<!-- Next -->
			<button
				class="btn btn-sm"
				onclick={() => setPage(pagination.page + 1)}
				disabled={pagination.page === pagination.totalPages}
			>
				<ChevronRight class="h-4 w-4" />
			</button>
		</div>

		<!-- Limit Selector -->
		<select
			class="select-bordered select select-sm"
			value={pagination.limit}
			onchange={(e) => setLimit(parseInt(e.currentTarget.value))}
		>
			<option value={25}>25 per page</option>
			<option value={50}>50 per page</option>
			<option value={100}>100 per page</option>
		</select>
	</div>
{/if}
