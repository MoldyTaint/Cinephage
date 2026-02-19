<script lang="ts">
	import { RefreshCw, AlertTriangle, Check, Info, Loader2, Clock, Database } from 'lucide-svelte';
	import type { EpgStatus } from '$lib/types/livetv';

	interface Props {
		status: EpgStatus | null;
		loading: boolean;
		syncingAll: boolean;
		syncingAccountIds: string[];
		onSync: () => void;
		onSyncAccount: (accountId: string) => void;
	}

	let { status, loading, syncingAll, syncingAccountIds, onSync, onSyncAccount }: Props = $props();

	function formatRelativeTime(isoDate: string | null): string {
		if (!isoDate) return 'Never';

		const date = new Date(isoDate);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		return `${diffDays}d ago`;
	}

	function formatFutureTime(isoDate: string | null): string {
		if (!isoDate) return 'Unknown';

		const date = new Date(isoDate);
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);

		if (diffMins < 1) return 'Soon';
		if (diffMins < 60) return `in ${diffMins}m`;
		if (diffHours < 24) return `in ${diffHours}h`;
		return `in ${Math.floor(diffHours / 24)}d`;
	}

	function compactMessage(message: string | undefined, maxLength = 140): string {
		if (!message) return 'Unknown error';
		const compact = message.replace(/\s+/g, ' ').trim();
		if (compact.length <= maxLength) return compact;
		return `${compact.slice(0, maxLength - 1)}...`;
	}

	async function handleSyncAccount(accountId: string) {
		await onSyncAccount(accountId);
	}

	const syncingAccountIdSet = $derived(new Set(syncingAccountIds));
	const hasAccountSyncRunning = $derived(syncingAccountIds.length > 0);
	const anySyncing = $derived(syncingAll || hasAccountSyncRunning);

	const accountsWithError = $derived(status?.accounts.filter((a) => a.error).length ?? 0);
	const accountsWithoutEpg = $derived(
		status?.accounts.filter((a) => a.hasEpg === false).length ?? 0
	);
	const syncErrors = $derived(
		status?.accounts
			.filter((a) => Boolean(a.error))
			.map((a) => ({
				id: a.id,
				name: a.name,
				message: compactMessage(a.error)
			})) ?? []
	);
	const syncWarnings = $derived(
		status?.accounts
			.filter((a) => !a.error && a.hasEpg === false)
			.map((a) => ({
				id: a.id,
				name: a.name,
				message: 'No EPG data was returned during the last sync'
			})) ?? []
	);
</script>

<div class="space-y-6">
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if status}
		<!-- Summary cards -->
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-primary/10 p-2">
							<Database class="h-5 w-5 text-primary" />
						</div>
						<div>
							<div class="text-2xl font-bold">{status.totalPrograms.toLocaleString()}</div>
							<div class="text-sm text-base-content/60">Total Programs</div>
						</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body p-4">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-success/10 p-2">
							<Check class="h-5 w-5 text-success" />
						</div>
						<div>
							<div class="text-lg font-bold">{formatRelativeTime(status.lastSyncAt)}</div>
							<div class="text-sm text-base-content/60">Last Sync</div>
						</div>
					</div>
				</div>
			</div>

			<div class="card bg-base-200">
				<div class="card-body p-4">
					<div class="flex items-center gap-3">
						<div class="rounded-lg bg-info/10 p-2">
							<Clock class="h-5 w-5 text-info" />
						</div>
						<div>
							<div class="text-lg font-bold">{formatFutureTime(status.nextSyncAt)}</div>
							<div class="text-sm text-base-content/60">Next Sync</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		{#if syncErrors.length > 0 || syncWarnings.length > 0}
			<div class="space-y-2">
				{#if syncErrors.length > 0}
					<div class="alert alert-error">
						<AlertTriangle class="h-5 w-5 shrink-0" />
						<div class="min-w-0 space-y-1">
							<div class="font-medium">
								Last sync completed with {syncErrors.length} error{syncErrors.length === 1
									? ''
									: 's'}
							</div>
							<div class="space-y-1 text-sm">
								{#each syncErrors.slice(0, 3) as issue (issue.id)}
									<div class="truncate">
										<span class="font-medium">{issue.name}:</span>
										{issue.message}
									</div>
								{/each}
								{#if syncErrors.length > 3}
									<div class="text-xs opacity-80">+{syncErrors.length - 3} more account issues</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}

				{#if syncWarnings.length > 0}
					<div class="alert alert-warning">
						<Info class="h-5 w-5 shrink-0" />
						<div class="min-w-0 space-y-1">
							<div class="font-medium">
								Last sync warning{syncWarnings.length === 1 ? '' : 's'} ({syncWarnings.length})
							</div>
							<div class="space-y-1 text-sm">
								{#each syncWarnings.slice(0, 3) as issue (issue.id)}
									<div class="truncate">
										<span class="font-medium">{issue.name}:</span>
										{issue.message}
									</div>
								{/each}
								{#if syncWarnings.length > 3}
									<div class="text-xs opacity-80">
										+{syncWarnings.length - 3} more account warnings
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Sync all button -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<h3 class="font-semibold">Accounts</h3>
				{#if accountsWithError > 0}
					<div class="badge badge-sm badge-error">{accountsWithError} error</div>
				{/if}
				{#if accountsWithoutEpg > 0}
					<div class="badge badge-sm badge-warning">{accountsWithoutEpg} no EPG</div>
				{/if}
			</div>
			<button class="btn btn-sm btn-primary" onclick={onSync} disabled={anySyncing}>
				{#if syncingAll}
					<Loader2 class="h-4 w-4 animate-spin" />
					Syncing All...
				{:else if hasAccountSyncRunning}
					<Loader2 class="h-4 w-4 animate-spin" />
					Sync In Progress...
				{:else}
					<RefreshCw class="h-4 w-4" />
					Sync All Accounts
				{/if}
			</button>
		</div>

		<!-- Account list -->
		{#if status.accounts && status.accounts.length > 0}
			<div class="space-y-2">
				{#each status.accounts as account (account.id)}
					{@const isAccountSyncing = syncingAccountIdSet.has(account.id)}
					<div class="card bg-base-200">
						<div class="card-body flex-row items-center justify-between p-4">
							<div class="flex items-center gap-4">
								<div class="flex items-center gap-2">
									{#if account.error}
										<div class="tooltip" data-tip={account.error}>
											<AlertTriangle class="h-5 w-5 text-error" />
										</div>
									{:else if account.hasEpg === false}
										<div class="tooltip" data-tip="This portal does not provide EPG data">
											<Info class="h-5 w-5 text-warning" />
										</div>
									{:else if account.programCount > 0}
										<Check class="h-5 w-5 text-success" />
									{:else}
										<div class="h-5 w-5"></div>
									{/if}
									<span class="font-medium">{account.name}</span>
								</div>
								<div class="text-sm text-base-content/60">
									{account.programCount.toLocaleString()} programs
								</div>
								{#if account.lastEpgSyncAt}
									<div class="text-sm text-base-content/50">
										Synced {formatRelativeTime(account.lastEpgSyncAt)}
									</div>
								{/if}
							</div>
							<button
								class="btn btn-ghost btn-sm"
								onclick={() => handleSyncAccount(account.id)}
								disabled={syncingAll || isAccountSyncing}
								title={syncingAll ? 'Sync all is currently running' : 'Sync this account'}
							>
								{#if isAccountSyncing}
									<Loader2 class="h-4 w-4 animate-spin" />
								{:else}
									<RefreshCw class="h-4 w-4" />
								{/if}
							</button>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="py-8 text-center text-base-content/50">
				No accounts configured. Add Stalker accounts to sync EPG data.
			</div>
		{/if}
	{:else}
		<div class="py-8 text-center text-base-content/50">Unable to load EPG status</div>
	{/if}
</div>
