<script lang="ts">
	import { AlertTriangle, XCircle, File, Folder, Film, Monitor, Tv } from 'lucide-svelte';
	import { ModalWrapper } from '$lib/components/ui/modal';
	import { severityBadgeClass, insightTypeLabel, dismissInsight, formatBytes } from './utils.js';
	import { getInsightItems } from '$lib/api/storage.js';
	import { resolvePath } from '$lib/utils/routing';
	import type { InsightItem as ApiInsightItem } from '$lib/api/storage.js';
	import type { Insight } from './utils.js';

	interface Props {
		open: boolean;
		insight: Insight | null;
		onClose: () => void;
		onDismissed?: (id: string) => void;
	}

	let { open, insight, onClose, onDismissed }: Props = $props();

	let items = $state<ApiInsightItem[]>([]);
	let total = $state(0);
	let totalPages = $state(0);
	let page = $state(1);
	let limit = $state(50);
	let loading = $state(false);
	let error = $state<string | null>(null);

	let dismissing = $state(false);

	async function fetchItems() {
		if (!insight) return;
		loading = true;
		error = null;
		try {
			const res = await getInsightItems(insight.id, { page, limit });
			if (res.success && res.data) {
				items = res.data.items;
				total = res.data.pagination.total;
				totalPages = res.data.pagination.totalPages;
			} else {
				error = res.error ?? 'Failed to load items';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load items';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open && insight) {
			page = 1;
			fetchItems();
		}
	});

	async function handlePageChange(newPage: number) {
		page = newPage;
		await fetchItems();
	}

	async function handleDismiss() {
		if (!insight || !onDismissed) return;
		dismissing = true;
		const success = await dismissInsight(insight.id);
		dismissing = false;
		if (success) {
			onDismissed(insight.id);
			onClose();
		}
	}

	function badgeToneColor(tone: string): string {
		switch (tone) {
			case 'critical':
				return 'border-error/30 bg-error/10 text-error';
			case 'warn':
				return 'border-warning/30 bg-warning/10 text-warning';
			default:
				return 'border-info/30 bg-info/10 text-info';
		}
	}

	let pageButtons = $derived.by(() => {
		const buttons: (number | '...')[] = [];
		if (totalPages <= 7) {
			for (let i = 1; i <= totalPages; i++) buttons.push(i);
		} else {
			buttons.push(1);
			if (page > 3) buttons.push('...');
			const start = Math.max(2, page - 1);
			const end = Math.min(totalPages - 1, page + 1);
			for (let i = start; i <= end; i++) buttons.push(i);
			if (page < totalPages - 2) buttons.push('...');
			buttons.push(totalPages);
		}
		return buttons;
	});
</script>

<ModalWrapper {open} {onClose} maxWidth="4xl" flexContent labelledBy="insight-detail-title">
	<div class="flex min-h-0 flex-1 flex-col">
		<div class="flex items-center justify-between border-b border-base-300 px-6 py-4">
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span
						class={`badge badge-sm border-none ${insight ? severityBadgeClass(insight.severity) : ''}`}
					>
						{insight ? insightTypeLabel(insight.insightType) : ''}
					</span>
					{#if insight?.reclaimableBytes}
						<span class="text-xs text-base-content/50">
							{formatBytes(insight.reclaimableBytes)} reclaimable
						</span>
					{/if}
				</div>
				<h3 id="insight-detail-title" class="mt-1 text-lg font-bold text-base-content">
					{insight?.title ?? ''}
				</h3>
				{#if insight?.summary}
					<p class="mt-0.5 text-sm text-base-content/70">{insight.summary}</p>
				{/if}
			</div>
			<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
				<XCircle class="h-5 w-5" />
			</button>
		</div>

		<div class="flex-1 overflow-y-auto px-6 py-4">
			{#if loading}
				<div class="flex items-center justify-center py-16">
					<span class="loading loading-lg loading-dots text-base-content/50"></span>
				</div>
			{:else if error}
				<div class="flex flex-col items-center gap-3 py-12 text-center">
					<AlertTriangle class="h-8 w-8 text-error" />
					<p class="text-sm text-error">{error}</p>
					<button class="btn btn-ghost btn-sm" onclick={fetchItems}>Retry</button>
				</div>
			{:else if items.length === 0}
				<div class="flex items-center justify-center py-12 text-sm text-base-content/40">
					No items found
				</div>
			{:else}
				<div class="space-y-1">
					{#each items as item (item.id)}
						<div
							class="flex items-center gap-3 rounded-lg border border-base-300 bg-base-200/50 px-3 py-2.5"
						>
							{#if item.kind === 'movie'}
								<Film class="h-4 w-4 shrink-0 text-base-content/40" />
							{:else if item.kind === 'series'}
								<Tv class="h-4 w-4 shrink-0 text-base-content/40" />
							{:else if item.kind === 'episode'}
								<Monitor class="h-4 w-4 shrink-0 text-base-content/40" />
							{:else if item.kind === 'folder'}
								<Folder class="h-4 w-4 shrink-0 text-base-content/40" />
							{:else}
								<File class="h-4 w-4 shrink-0 text-base-content/40" />
							{/if}
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-base-content">{item.title}</div>
								{#if item.subtitle}
									<div class="truncate text-xs text-base-content/50">{item.subtitle}</div>
								{/if}
							</div>
							<div class="flex items-center gap-2">
								{#if item.badges}
									{#each item.badges as badge (badge.label + badge.tone)}
										<span class={`badge badge-sm border ${badgeToneColor(badge.tone)}`}>
											{badge.label}
										</span>
									{/each}
								{/if}
								{#if item.sizeBytes}
									<span class="text-xs text-base-content/50">{formatBytes(item.sizeBytes)}</span>
								{/if}
								{#if item.href}
									<a
										href={resolvePath(item.href)}
										class="btn btn-ghost btn-xs gap-1"
										onclick={onClose}
									>
										Open
									</a>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				{#if totalPages > 1}
					<div class="mt-4 flex items-center justify-between">
						<span class="text-xs text-base-content/40">
							{total} item{total !== 1 ? 's' : ''}
						</span>
						<div class="join">
							<button
								class="join-item btn btn-ghost btn-xs"
								disabled={page <= 1}
								onclick={() => handlePageChange(page - 1)}
							>
								Prev
							</button>
							{#each pageButtons as btn, idx (idx)}
								{@const isActive = btn === page}
								{@const isEllipsis = btn === '...'}
								{#if isEllipsis}
									<button class="join-item btn btn-ghost btn-xs" disabled> ... </button>
								{:else}
									<button
										class="join-item btn btn-ghost btn-xs"
										class:btn-active={isActive}
										onclick={() => handlePageChange(btn)}
									>
										{btn}
									</button>
								{/if}
							{/each}
							<button
								class="join-item btn btn-ghost btn-xs"
								disabled={page >= totalPages}
								onclick={() => handlePageChange(page + 1)}
							>
								Next
							</button>
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<div class="flex items-center justify-between border-t border-base-300 px-6 py-3">
			{#if insight}
				{@const links: Record<string, string> = {
					'orphaned-files': '/library/unmatched',
					'untracked-by-cinephage': '/settings/monitoring/status/media',
					'missing-from-media-server': '/settings/monitoring/status/media',
					'unplayed': '/settings/monitoring/status/media',
				'duplicate-items': '/library/movies',
				'filename-duplicates': '/library/movies',
				'quality-below-cutoff': '/library/movies',
					'broken-paths': '/settings/monitoring/status/folders',
					'health-issues': '/settings/monitoring/status/folders'
				}}
				{@const footerLink = links[insight.insightType] ?? '/settings/monitoring/status/insights'}
				<a href={resolvePath(footerLink)} class="link link-hover text-sm">
					View all in {insightTypeLabel(insight.insightType)}
				</a>
			{/if}
			<div class="flex items-center gap-2">
				{#if onDismissed}
					<button class="btn btn-ghost btn-sm" onclick={handleDismiss} disabled={dismissing}>
						{#if dismissing}
							<span class="loading loading-sm loading-spinner"></span>
						{/if}
						Dismiss
					</button>
				{/if}
				<button class="btn btn-ghost btn-sm" onclick={onClose}> Close </button>
			</div>
		</div>
	</div>
</ModalWrapper>
