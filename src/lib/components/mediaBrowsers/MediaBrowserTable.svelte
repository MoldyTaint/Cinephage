<script lang="ts">
	import {
		ChevronDown,
		ChevronUp,
		Settings,
		Trash2,
		ToggleLeft,
		ToggleRight,
		Monitor,
		FlaskConical,
		Loader2,
		CheckCircle,
		AlertTriangle,
		XCircle
	} from 'lucide-svelte';
	import type { MediaBrowserServerPublic } from '$lib/server/notifications/mediabrowser/types';

	interface Props {
		servers: MediaBrowserServerPublic[];
		selectedIds: Set<string>;
		onSelect: (id: string, selected: boolean) => void;
		onSelectAll: (selected: boolean) => void;
		sort: {
			column: 'status' | 'name' | 'type';
			direction: 'asc' | 'desc';
		};
		onSort: (column: 'status' | 'name' | 'type') => void;
		onEdit: (server: MediaBrowserServerPublic) => void;
		onDelete: (server: MediaBrowserServerPublic) => void;
		onToggle: (server: MediaBrowserServerPublic) => void;
		onTest?: (server: MediaBrowserServerPublic) => Promise<void>;
		testingId?: string | null;
	}

	let {
		servers,
		selectedIds,
		onSelect,
		onSelectAll,
		sort,
		onSort,
		onEdit,
		onDelete,
		onToggle,
		onTest,
		testingId = null
	}: Props = $props();

	function getServerTypeLabel(type: string): string {
		return type === 'jellyfin' ? 'Jellyfin' : 'Emby';
	}

	function getServerTypeBadgeClass(type: string): string {
		return type === 'jellyfin' ? 'badge-primary' : 'badge-secondary';
	}

	function isSortedBy(column: 'status' | 'name' | 'type'): boolean {
		return sort.column === column;
	}

	function isAscending(): boolean {
		return sort.direction === 'asc';
	}

	function formatLastTested(lastTestedAt: string | null): string {
		if (!lastTestedAt) return 'never';
		return new Date(lastTestedAt).toLocaleString();
	}

	function getCompactServerInfoLabel(value: string): string {
		const normalized = value.trim();
		return normalized.length > 18 ? `${normalized.slice(0, 17)}...` : normalized;
	}

	function getStatusTooltip(server: MediaBrowserServerPublic): string {
		if (!server.enabled) {
			return 'Media server is disabled by user';
		}
		if (server.testResult === 'failed') {
			const testedAt = formatLastTested(server.lastTestedAt);
			return server.testError
				? `Connection failed: ${server.testError}. Last tested: ${testedAt}`
				: `Connection test failed. Last tested: ${testedAt}`;
		}
		if (server.testResult === 'success') {
			return `Connection test succeeded. Last tested: ${formatLastTested(server.lastTestedAt)}`;
		}
		return 'Connection has not been tested yet';
	}

	const allSelected = $derived(servers.length > 0 && servers.every((s) => selectedIds.has(s.id)));
	const someSelected = $derived(servers.some((s) => selectedIds.has(s.id)) && !allSelected);
</script>

{#if servers.length === 0}
	<div class="py-12 text-center text-base-content/60">
		<Monitor class="mx-auto mb-4 h-12 w-12 opacity-40" />
		<p class="text-lg font-medium">No media servers configured</p>
		<p class="mt-1 text-sm">Add a Jellyfin or Emby server to enable library notifications</p>
	</div>
{:else}
	<div class="space-y-3 sm:hidden">
		<div class="rounded-lg border border-base-300/80 bg-base-100 px-3 py-2 shadow-sm">
			<div class="flex items-center justify-between gap-2">
				<label class="flex items-center gap-2 text-xs font-medium">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						checked={allSelected}
						indeterminate={someSelected}
						onchange={(e) => onSelectAll(e.currentTarget.checked)}
					/>
					Select all
				</label>
				<span class="text-xs text-base-content/60">{selectedIds.size} selected</span>
			</div>
		</div>

		{#each servers as server (server.id)}
			<div
				class="rounded-xl border bg-base-100 p-3 transition-all duration-150 {selectedIds.has(
					server.id
				)
					? 'border-primary/50 ring-1 ring-primary/30'
					: 'border-base-300/80'}"
			>
				<div class="mb-2 flex items-start justify-between gap-2">
					<div class="flex min-w-0 items-start gap-2.5">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={selectedIds.has(server.id)}
							onchange={(e) => onSelect(server.id, e.currentTarget.checked)}
						/>
						<div class="min-w-0">
							<div class="flex flex-wrap items-center gap-2">
								<button class="link text-sm font-bold link-hover" onclick={() => onEdit(server)}>
									{server.name}
								</button>
								<div class="tooltip tooltip-right" data-tip={getStatusTooltip(server)}>
									{#if !server.enabled}
										<span class="badge gap-1 badge-ghost">
											<XCircle class="h-3 w-3" />
											<span class="text-xs">Disabled</span>
										</span>
									{:else if server.testResult === 'failed'}
										<span class="badge gap-1 badge-error">
											<AlertTriangle class="h-3 w-3" />
											<span class="text-xs">Unhealthy</span>
										</span>
									{:else}
										<span class="badge gap-1 badge-success">
											<CheckCircle class="h-3 w-3" />
											<span class="text-xs">Healthy</span>
										</span>
									{/if}
								</div>
							</div>
						</div>
					</div>
					<span
						class="badge shrink-0 badge-outline badge-sm {getServerTypeBadgeClass(
							server.serverType
						)}"
					>
						{getServerTypeLabel(server.serverType)}
					</span>
				</div>

				{#if server.serverName || server.serverVersion}
					<div class="mb-2 flex flex-wrap items-center gap-1">
						{#if server.serverName}
							<span
								class="badge max-w-[11rem] truncate badge-ghost badge-sm"
								title={server.serverName}
							>
								{getCompactServerInfoLabel(server.serverName)}
							</span>
						{/if}
						{#if server.serverVersion}
							<span class="badge badge-outline badge-sm" title={`v${server.serverVersion}`}>
								v{getCompactServerInfoLabel(server.serverVersion)}
							</span>
						{/if}
					</div>
				{/if}

				<div
					class="mb-3 min-w-0 truncate font-mono text-xs text-base-content/60"
					title={server.host}
				>
					{server.host}
				</div>

				<div class="grid gap-1.5 {onTest ? 'grid-cols-4' : 'grid-cols-3'}">
					{#if onTest}
						<button
							class="btn btn-ghost btn-xs"
							onclick={() => onTest(server)}
							title="Test connection"
							aria-label="Test connection"
							disabled={testingId === server.id}
						>
							{#if testingId === server.id}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<FlaskConical class="h-4 w-4" />
							{/if}
						</button>
					{/if}
					<button
						class="btn btn-ghost btn-xs"
						onclick={() => onToggle(server)}
						title={server.enabled ? 'Disable' : 'Enable'}
						aria-label={server.enabled ? 'Disable server' : 'Enable server'}
						disabled={testingId === server.id}
					>
						{#if server.enabled}
							<ToggleRight class="h-4 w-4 text-success" />
						{:else}
							<ToggleLeft class="h-4 w-4" />
						{/if}
					</button>
					<button
						class="btn btn-ghost btn-xs"
						onclick={() => onEdit(server)}
						title="Edit"
						aria-label="Edit server"
					>
						<Settings class="h-4 w-4" />
					</button>
					<button
						class="btn text-error btn-ghost btn-xs"
						onclick={() => onDelete(server)}
						title="Delete"
						aria-label="Delete server"
					>
						<Trash2 class="h-4 w-4" />
					</button>
				</div>
			</div>
		{/each}
	</div>

	<div class="hidden overflow-x-auto sm:block">
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
					<th>
						<button
							class="flex items-center gap-1 hover:text-primary"
							onclick={() => onSort('type')}
						>
							Type
							{#if isSortedBy('type')}
								{#if isAscending()}
									<ChevronUp class="h-3 w-3" />
								{:else}
									<ChevronDown class="h-3 w-3" />
								{/if}
							{/if}
						</button>
					</th>
					<th>Host</th>
					<th>Server Info</th>
					<th class="pl-4! text-start">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each servers as server (server.id)}
					<tr class="hover">
						<td class="w-10">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								checked={selectedIds.has(server.id)}
								onchange={(e) => onSelect(server.id, e.currentTarget.checked)}
							/>
						</td>
						<td>
							<div class="tooltip tooltip-right" data-tip={getStatusTooltip(server)}>
								{#if !server.enabled}
									<span class="badge gap-1 badge-ghost">
										<XCircle class="h-3 w-3" />
										<span class="text-xs">Disabled</span>
									</span>
								{:else if server.testResult === 'failed'}
									<span class="badge gap-1 badge-error">
										<AlertTriangle class="h-3 w-3" />
										<span class="text-xs">Unhealthy</span>
									</span>
								{:else}
									<span class="badge gap-1 badge-success">
										<CheckCircle class="h-3 w-3" />
										<span class="text-xs">Healthy</span>
									</span>
								{/if}
							</div>
						</td>
						<td>
							<div class="font-bold">{server.name}</div>
						</td>
						<td>
							<div
								class="badge badge-outline badge-sm {getServerTypeBadgeClass(server.serverType)}"
							>
								{getServerTypeLabel(server.serverType)}
							</div>
						</td>
						<td>
							<div class="max-w-48 truncate font-mono text-sm" title={server.host}>
								{server.host}
							</div>
						</td>
						<td>
							{#if server.serverName}
								<div class="flex flex-wrap items-center gap-1">
									<span
										class="badge max-w-[11rem] truncate badge-ghost badge-sm"
										title={server.serverName}
									>
										{getCompactServerInfoLabel(server.serverName)}
									</span>
									{#if server.serverVersion}
										<span class="badge badge-outline badge-sm" title={`v${server.serverVersion}`}>
											v{getCompactServerInfoLabel(server.serverVersion)}
										</span>
									{/if}
								</div>
							{:else}
								<span class="text-base-content/50">-</span>
							{/if}
						</td>
						<td class="pl-2!">
							<div class="flex gap-0">
								{#if onTest}
									<button
										class="btn btn-ghost btn-xs"
										onclick={() => onTest(server)}
										title="Test connection"
										disabled={testingId === server.id}
									>
										{#if testingId === server.id}
											<Loader2 class="h-4 w-4 animate-spin" />
										{:else}
											<FlaskConical class="h-4 w-4" />
										{/if}
									</button>
								{/if}
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => onToggle(server)}
									title={server.enabled ? 'Disable' : 'Enable'}
									disabled={testingId === server.id}
								>
									{#if server.enabled}
										<ToggleRight class="h-4 w-4 text-success" />
									{:else}
										<ToggleLeft class="h-4 w-4" />
									{/if}
								</button>
								<button class="btn btn-ghost btn-xs" onclick={() => onEdit(server)} title="Edit">
									<Settings class="h-4 w-4" />
								</button>
								<button
									class="btn text-error btn-ghost btn-xs"
									onclick={() => onDelete(server)}
									title="Delete"
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
