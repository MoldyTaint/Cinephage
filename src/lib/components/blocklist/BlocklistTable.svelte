<script lang="ts">
	import { ChevronDown, ChevronUp, Trash2 } from 'lucide-svelte';

	interface BlocklistEntry {
		id: string;
		title: string;
		infoHash: string | null;
		indexerId: string | null;
		movieId: string | null;
		seriesId: string | null;
		episodeIds: string[] | null;
		reason: string;
		message: string | null;
		sourceTitle: string | null;
		quality: { resolution?: string; source?: string; codec?: string; hdr?: string } | null;
		size: number | null;
		protocol: string | null;
		createdAt: string | null;
		expiresAt: string | null;
	}

	interface Props {
		entries: BlocklistEntry[];
		selectedIds: Set<string>;
		onSelect: (id: string, selected: boolean) => void;
		onSelectAll: (selected: boolean) => void;
		sort: {
			column: 'title' | 'reason' | 'createdAt' | 'expiresAt';
			direction: 'asc' | 'desc';
		};
		onSort: (column: 'title' | 'reason' | 'createdAt' | 'expiresAt') => void;
		onDelete: (entry: BlocklistEntry) => void;
	}

	let { entries, selectedIds, onSelect, onSelectAll, sort, onSort, onDelete }: Props = $props();

	const allSelected = $derived(entries.length > 0 && entries.every((e) => selectedIds.has(e.id)));
	const someSelected = $derived(entries.some((e) => selectedIds.has(e.id)) && !allSelected);

	function formatReason(reason: string): string {
		const map: Record<string, string> = {
			download_failed: 'Download Failed',
			import_failed: 'Import Failed',
			quality_mismatch: 'Quality Mismatch',
			manual: 'Manual',
			duplicate: 'Duplicate',
			bad_release: 'Bad Release'
		};
		return map[reason] ?? reason;
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getExpiryLabel(expiresAt: string | null): { label: string; variant: string } {
		if (!expiresAt) return { label: 'Permanent', variant: 'badge-ghost' };
		const now = Date.now();
		const expires = new Date(expiresAt).getTime();
		if (expires < now) return { label: 'Expired', variant: 'badge-warning' };
		const hoursLeft = Math.round((expires - now) / (1000 * 60 * 60));
		if (hoursLeft < 24) return { label: `${hoursLeft}h left`, variant: 'badge-info' };
		const daysLeft = Math.round(hoursLeft / 24);
		return { label: `${daysLeft}d left`, variant: 'badge-ghost' };
	}

	function protocolBadge(protocol: string | null): string {
		if (!protocol) return '';
		const map: Record<string, string> = {
			torrent: 'badge-info',
			usenet: 'badge-success',
			streaming: 'badge-accent'
		};
		return map[protocol] ?? 'badge-ghost';
	}

	function sortIcon(column: typeof sort.column): typeof ChevronDown | typeof ChevronUp {
		if (sort.column !== column) return ChevronDown;
		return sort.direction === 'asc' ? ChevronUp : ChevronDown;
	}
</script>

<div class="overflow-x-auto">
	<table class="table table-sm">
		<thead>
			<tr>
				<th class="w-10">
					<input
						type="checkbox"
						class="checkbox checkbox-xs"
						checked={allSelected}
						indeterminate={someSelected}
						onchange={(e) => onSelectAll((e.currentTarget as HTMLInputElement).checked)}
						aria-label="Select all"
					/>
				</th>
				<th>
					<button
						class="btn flex items-center gap-1 btn-ghost btn-xs"
						onclick={() => onSort('title')}
					>
						Title
						<svelte:component this={sortIcon('title')} class="h-3 w-3" />
					</button>
				</th>
				<th>
					<button
						class="btn flex items-center gap-1 btn-ghost btn-xs"
						onclick={() => onSort('reason')}
					>
						Reason
						<svelte:component this={sortIcon('reason')} class="h-3 w-3" />
					</button>
				</th>
				<th>Message</th>
				<th>Protocol</th>
				<th>
					<button
						class="btn flex items-center gap-1 btn-ghost btn-xs"
						onclick={() => onSort('createdAt')}
					>
						Added
						<svelte:component this={sortIcon('createdAt')} class="h-3 w-3" />
					</button>
				</th>
				<th>
					<button
						class="btn flex items-center gap-1 btn-ghost btn-xs"
						onclick={() => onSort('expiresAt')}
					>
						Expires
						<svelte:component this={sortIcon('expiresAt')} class="h-3 w-3" />
					</button>
				</th>
				<th class="w-16">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each entries as entry (entry.id)}
				<tr>
					<td>
						<input
							type="checkbox"
							class="checkbox checkbox-xs"
							checked={selectedIds.has(entry.id)}
							onchange={(e) => onSelect(entry.id, (e.currentTarget as HTMLInputElement).checked)}
							aria-label="Select {entry.title}"
						/>
					</td>
					<td>
						<span class="block max-w-48 truncate text-sm" title={entry.title}>
							{entry.title}
						</span>
					</td>
					<td>
						<span class="badge badge-ghost badge-sm">{formatReason(entry.reason)}</span>
					</td>
					<td>
						<span
							class="block max-w-40 truncate text-xs text-base-content/60"
							title={entry.message ?? ''}
						>
							{entry.message ?? '-'}
						</span>
					</td>
					<td>
						{#if entry.protocol}
							<span class="badge badge-xs {protocolBadge(entry.protocol)}">
								{entry.protocol}
							</span>
						{:else}
							-
						{/if}
					</td>
					<td class="text-xs text-base-content/60">{formatDate(entry.createdAt)}</td>
					<td>
						<span class="badge badge-xs {getExpiryLabel(entry.expiresAt).variant}">
							{getExpiryLabel(entry.expiresAt).label}
						</span>
					</td>
					<td>
						<button
							class="btn text-error btn-ghost btn-xs"
							onclick={() => onDelete(entry)}
							aria-label="Remove {entry.title}"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
