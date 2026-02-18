<script lang="ts">
	import {
		ChevronDown,
		ChevronUp,
		Settings,
		Trash2,
		ToggleLeft,
		ToggleRight,
		Server,
		FlaskConical,
		Loader2
	} from 'lucide-svelte';
	import type { UnifiedClientItem } from '$lib/types/downloadClient';
	import DownloadClientStatusBadge from './DownloadClientStatusBadge.svelte';

	interface Props {
		clients: UnifiedClientItem[];
		selectedIds: Set<string>;
		onSelect: (id: string, selected: boolean) => void;
		onSelectAll: (selected: boolean) => void;
		onEdit: (client: UnifiedClientItem) => void;
		onDelete: (client: UnifiedClientItem) => void;
		onToggle: (client: UnifiedClientItem) => void;
		sort: {
			column: 'status' | 'name' | 'protocol';
			direction: 'asc' | 'desc';
		};
		onSort: (column: 'status' | 'name' | 'protocol') => void;
		onTest?: (client: UnifiedClientItem) => Promise<void>;
		testingId?: string | null;
	}

	let {
		clients,
		selectedIds,
		onSelect,
		onSelectAll,
		onEdit,
		onDelete,
		onToggle,
		sort,
		onSort,
		onTest,
		testingId = null
	}: Props = $props();

	function getProtocolLabel(implementation: UnifiedClientItem['implementation']): string {
		switch (implementation) {
			case 'sabnzbd':
			case 'nzbget':
			case 'nzb-mount':
				return 'Usenet';
			default:
				return 'Torrent';
		}
	}

	function getDownloaderTypeLabel(implementation: UnifiedClientItem['implementation']): string {
		switch (implementation) {
			case 'qbittorrent':
				return 'qBittorrent';
			case 'sabnzbd':
				return 'SABnzbd';
			case 'nzbget':
				return 'NZBGet';
			case 'nzb-mount':
				return 'NZB-Mount';
			case 'transmission':
				return 'Transmission';
			case 'deluge':
				return 'Deluge';
			case 'rtorrent':
				return 'rTorrent';
			case 'aria2':
				return 'aria2';
			default:
				return implementation;
		}
	}

	function isSortedBy(column: 'status' | 'name' | 'protocol'): boolean {
		return sort.column === column;
	}

	function isAscending(): boolean {
		return sort.direction === 'asc';
	}

	const allSelected = $derived(clients.length > 0 && clients.every((c) => selectedIds.has(c.id)));
	const someSelected = $derived(clients.some((c) => selectedIds.has(c.id)) && !allSelected);
</script>

{#if clients.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Server class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No download clients configured</p>
		<p class="mt-1 text-sm">Add a download client to start managing downloads</p>
	</div>
{:else}
	<div class="h-11 border-b border-base-300"></div>
	<div class="overflow-x-auto">
		<table class="table table-sm">
			<thead>
				<tr>
					<th class="w-10">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={allSelected}
							indeterminate={someSelected}
							onchange={(e) => onSelectAll(e.currentTarget.checked)}
						/>
					</th>
					<th>
						<button
							class="flex items-center gap-1 hover:text-primary"
							onclick={() => onSort('status')}
						>
							Status
							{#if isSortedBy('status')}
								{#if isAscending()}
									<ChevronUp class="h-3 w-3" />
								{:else}
									<ChevronDown class="h-3 w-3" />
								{/if}
							{/if}
						</button>
					</th>
					<th>
						<button
							class="flex items-center gap-1 hover:text-primary"
							onclick={() => onSort('name')}
						>
							Name
							{#if isSortedBy('name')}
								{#if isAscending()}
									<ChevronUp class="h-3 w-3" />
								{:else}
									<ChevronDown class="h-3 w-3" />
								{/if}
							{/if}
						</button>
					</th>
					<th>Downloader</th>
					<th>
						<button
							class="flex items-center gap-1 hover:text-primary"
							onclick={() => onSort('protocol')}
						>
							Protocol
							{#if isSortedBy('protocol')}
								{#if isAscending()}
									<ChevronUp class="h-3 w-3" />
								{:else}
									<ChevronDown class="h-3 w-3" />
								{/if}
							{/if}
						</button>
					</th>
					<th>Host</th>
					<th>Categories</th>
					<th class="pl-4! text-start">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each clients as client (client.id)}
					<tr class="hover">
						<td class="w-10">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={selectedIds.has(client.id)}
								onchange={(e) => onSelect(client.id, e.currentTarget.checked)}
							/>
						</td>
						<td>
							<DownloadClientStatusBadge
								enabled={client.enabled}
								health={client.status?.health}
								consecutiveFailures={client.status?.consecutiveFailures}
								lastFailure={client.status?.lastFailure}
								lastFailureMessage={client.status?.lastFailureMessage}
							/>
						</td>
						<td>
							<div>
								<div class="font-bold">{client.name}</div>
							</div>
						</td>
						<td>{getDownloaderTypeLabel(client.implementation)}</td>
						<td>
							<span class="badge badge-outline badge-sm"
								>{getProtocolLabel(client.implementation)}</span
							>
						</td>
						<td>
							<div class="font-mono text-sm">
								{client.useSsl ? 'https' : 'http'}://{client.host}:{client.port}{client.urlBase
									? `/${client.urlBase}`
									: ''}
							</div>
						</td>
						<td>
							<div class="flex flex-col gap-1">
								<span class="badge badge-ghost badge-sm">Movies: {client.movieCategory}</span>
								<span class="badge badge-ghost badge-sm">TV: {client.tvCategory}</span>
							</div>
						</td>
						<td class="pl-2!">
							<div class="flex gap-0">
								{#if onTest}
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => onTest(client)}
										title="Test connection"
										disabled={testingId === client.id}
									>
										{#if testingId === client.id}
											<Loader2 class="h-4 w-4 animate-spin" />
										{:else}
											<FlaskConical class="h-4 w-4" />
										{/if}
									</button>
								{/if}
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => onToggle(client)}
									title={client.enabled ? 'Disable' : 'Enable'}
									disabled={testingId === client.id}
								>
									{#if client.enabled}
										<ToggleRight class="h-4 w-4 text-success" />
									{:else}
										<ToggleLeft class="h-4 w-4" />
									{/if}
								</button>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => onEdit(client)}
									title="Edit client"
								>
									<Settings class="h-4 w-4" />
								</button>
								<button
									class="btn text-error btn-ghost btn-xs"
									onclick={() => onDelete(client)}
									title="Delete client"
								>
									<Trash2 class="h-4 w-4" />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
