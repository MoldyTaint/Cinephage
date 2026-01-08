<script lang="ts">
	import {
		Check,
		X,
		Loader2,
		Calendar,
		Tv,
		RefreshCw,
		CheckCheck,
		XCircle,
		Trash2
	} from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	interface ScanResult {
		id: string;
		portalId: string;
		macAddress: string;
		status: 'pending' | 'approved' | 'ignored' | 'expired';
		channelCount: number | null;
		categoryCount: number | null;
		expiresAt: string | null;
		accountStatus: string | null;
		playbackLimit: number | null;
		serverTimezone: string | null;
		rawProfile: string | null;
		discoveredAt: string;
		processedAt: string | null;
	}

	interface Props {
		portalId: string;
		onClose: () => void;
		onAccountsCreated: () => void;
	}

	let { portalId, onClose, onAccountsCreated }: Props = $props();

	// State
	let results = $state<ScanResult[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedIds = new SvelteSet<string>();
	let approving = $state(false);
	let ignoring = $state(false);
	let clearing = $state(false);

	// Filter
	let statusFilter = $state<'all' | 'pending' | 'approved' | 'ignored'>('pending');

	// Derived
	const filteredResults = $derived(
		statusFilter === 'all' ? results : results.filter((r) => r.status === statusFilter)
	);

	const pendingResults = $derived(results.filter((r) => r.status === 'pending'));
	const allSelected = $derived(
		filteredResults.length > 0 && filteredResults.every((r) => selectedIds.has(r.id))
	);
	const someSelected = $derived(selectedIds.size > 0);

	// Load results on mount
	onMount(() => {
		loadResults();
	});

	async function loadResults() {
		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/livetv/portals/${portalId}/scan/results`);
			if (!response.ok) throw new Error('Failed to load results');
			results = await response.json();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load results';
		} finally {
			loading = false;
		}
	}

	function toggleSelection(id: string) {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
		} else {
			selectedIds.add(id);
		}
	}

	function toggleSelectAll() {
		if (allSelected) {
			selectedIds.clear();
		} else {
			selectedIds.clear();
			filteredResults.forEach((r) => selectedIds.add(r.id));
		}
	}

	async function approveSelected() {
		if (selectedIds.size === 0) return;

		approving = true;
		try {
			const response = await fetch(`/api/livetv/portals/${portalId}/scan/results/approve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ resultIds: Array.from(selectedIds) })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to approve results');
			}

			selectedIds.clear();
			await loadResults();
			onAccountsCreated();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to approve results';
		} finally {
			approving = false;
		}
	}

	async function ignoreSelected() {
		if (selectedIds.size === 0) return;

		ignoring = true;
		try {
			const response = await fetch(`/api/livetv/portals/${portalId}/scan/results/ignore`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ resultIds: Array.from(selectedIds) })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to ignore results');
			}

			selectedIds.clear();
			await loadResults();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to ignore results';
		} finally {
			ignoring = false;
		}
	}

	async function clearIgnored() {
		clearing = true;
		try {
			const response = await fetch(`/api/livetv/portals/${portalId}/scan/results?status=ignored`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to clear results');
			}

			await loadResults();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to clear results';
		} finally {
			clearing = false;
		}
	}

	function formatDate(isoDate: string | null): string {
		if (!isoDate) return '-';
		try {
			return new Date(isoDate).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return '-';
		}
	}

	function getExpiryStatus(expiresAt: string | null): { class: string; text: string } {
		if (!expiresAt) return { class: 'badge-ghost', text: 'Unknown' };

		const expiry = new Date(expiresAt);
		const now = new Date();
		const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

		if (daysUntilExpiry < 0) {
			return { class: 'badge-error', text: 'Expired' };
		}
		if (daysUntilExpiry < 7) {
			return { class: 'badge-warning', text: `${daysUntilExpiry}d left` };
		}
		if (daysUntilExpiry < 30) {
			return { class: 'badge-info', text: `${daysUntilExpiry}d left` };
		}
		return { class: 'badge-success', text: 'Active' };
	}

	function getAccountStatusBadge(status: string | null): { class: string; text: string } {
		switch (status) {
			case 'active':
				return { class: 'badge-success', text: 'Active' };
			case 'expired':
				return { class: 'badge-error', text: 'Expired' };
			case 'blocked':
				return { class: 'badge-error', text: 'Blocked' };
			default:
				return { class: 'badge-ghost', text: 'Unknown' };
		}
	}

	function getResultStatusBadge(status: string): { class: string; text: string } {
		switch (status) {
			case 'pending':
				return { class: 'badge-info', text: 'Pending' };
			case 'approved':
				return { class: 'badge-success', text: 'Approved' };
			case 'ignored':
				return { class: 'badge-ghost', text: 'Ignored' };
			default:
				return { class: 'badge-ghost', text: status };
		}
	}
</script>

<div class="rounded-lg border border-base-300 bg-base-100 p-6">
	<!-- Header -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-3">
			<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
				<Tv class="h-5 w-5 text-primary" />
			</div>
			<div>
				<h3 class="text-lg font-bold">Scan Results</h3>
				<div class="text-sm text-base-content/60">
					{pendingResults.length} pending, {results.length} total
				</div>
			</div>
		</div>
		<div class="flex gap-2">
			<button class="btn btn-ghost btn-sm" onclick={loadResults} disabled={loading}>
				{#if loading}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<RefreshCw class="h-4 w-4" />
				{/if}
			</button>
			<button class="btn btn-ghost btn-sm" onclick={onClose}>
				<X class="h-4 w-4" />
				Close
			</button>
		</div>
	</div>

	<!-- Filter Tabs -->
	<div class="mb-4 flex gap-2">
		<button
			class="btn btn-sm {statusFilter === 'pending' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => (statusFilter = 'pending')}
		>
			Pending ({pendingResults.length})
		</button>
		<button
			class="btn btn-sm {statusFilter === 'approved' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => (statusFilter = 'approved')}
		>
			Approved
		</button>
		<button
			class="btn btn-sm {statusFilter === 'ignored' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => (statusFilter = 'ignored')}
		>
			Ignored
		</button>
		<button
			class="btn btn-sm {statusFilter === 'all' ? 'btn-primary' : 'btn-ghost'}"
			onclick={() => (statusFilter = 'all')}
		>
			All
		</button>
	</div>

	<!-- Bulk Actions -->
	{#if someSelected && statusFilter === 'pending'}
		<div class="mb-4 flex items-center gap-3 rounded-lg bg-primary/10 p-3">
			<span class="text-sm font-medium">{selectedIds.size} selected</span>
			<button
				class="btn btn-sm btn-success"
				onclick={approveSelected}
				disabled={approving || ignoring}
			>
				{#if approving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<CheckCheck class="h-4 w-4" />
				{/if}
				Approve Selected
			</button>
			<button
				class="btn btn-ghost btn-sm"
				onclick={ignoreSelected}
				disabled={approving || ignoring}
			>
				{#if ignoring}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<XCircle class="h-4 w-4" />
				{/if}
				Ignore Selected
			</button>
		</div>
	{/if}

	<!-- Clear Ignored Button -->
	{#if statusFilter === 'ignored' && results.some((r) => r.status === 'ignored')}
		<div class="mb-4">
			<button class="btn btn-outline btn-sm btn-error" onclick={clearIgnored} disabled={clearing}>
				{#if clearing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Trash2 class="h-4 w-4" />
				{/if}
				Clear Ignored Results
			</button>
		</div>
	{/if}

	{#if error}
		<div class="mb-4 alert alert-error">
			<span>{error}</span>
		</div>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center py-8">
			<Loader2 class="h-6 w-6 animate-spin text-primary" />
		</div>
	{:else if filteredResults.length === 0}
		<div class="py-8 text-center text-base-content/60">
			<Tv class="mx-auto mb-4 h-12 w-12 opacity-40" />
			<p class="text-lg font-medium">No results found</p>
			<p class="mt-1 text-sm">
				{#if statusFilter === 'pending'}
					No pending accounts to review
				{:else if statusFilter === 'approved'}
					No approved accounts yet
				{:else if statusFilter === 'ignored'}
					No ignored accounts
				{:else}
					No scan results available
				{/if}
			</p>
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="table">
				<thead>
					<tr>
						{#if statusFilter === 'pending'}
							<th class="w-12">
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									checked={allSelected}
									onchange={toggleSelectAll}
								/>
							</th>
						{/if}
						<th>MAC Address</th>
						<th>Channels</th>
						<th>Expires</th>
						<th>Account</th>
						{#if statusFilter !== 'pending'}
							<th>Status</th>
						{/if}
						<th>Discovered</th>
						{#if statusFilter === 'pending'}
							<th class="text-right">Actions</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each filteredResults as result (result.id)}
						{@const expiryStatus = getExpiryStatus(result.expiresAt)}
						{@const accountStatus = getAccountStatusBadge(result.accountStatus)}
						{@const resultStatus = getResultStatusBadge(result.status)}
						<tr class="hover">
							{#if statusFilter === 'pending'}
								<td>
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={selectedIds.has(result.id)}
										onchange={() => toggleSelection(result.id)}
									/>
								</td>
							{/if}
							<td>
								<span class="font-mono text-sm">{result.macAddress}</span>
							</td>
							<td>
								{#if result.channelCount !== null}
									<div class="flex flex-col gap-1">
										<span class="badge badge-ghost badge-sm">
											{result.channelCount.toLocaleString()} ch
										</span>
										{#if result.categoryCount !== null}
											<span class="badge badge-outline badge-sm">
												{result.categoryCount} cat
											</span>
										{/if}
									</div>
								{:else}
									<span class="text-base-content/50">-</span>
								{/if}
							</td>
							<td>
								{#if result.expiresAt}
									<div class="flex items-center gap-1">
										<span class="badge {expiryStatus.class} badge-sm">
											{expiryStatus.text}
										</span>
									</div>
									<div class="mt-1 flex items-center gap-1 text-xs text-base-content/50">
										<Calendar class="h-3 w-3" />
										{formatDate(result.expiresAt)}
									</div>
								{:else}
									<span class="text-base-content/50">-</span>
								{/if}
							</td>
							<td>
								<span class="badge {accountStatus.class} badge-sm">
									{accountStatus.text}
								</span>
								{#if result.playbackLimit}
									<div class="mt-1 text-xs text-base-content/50">
										{result.playbackLimit} stream{result.playbackLimit !== 1 ? 's' : ''}
									</div>
								{/if}
							</td>
							{#if statusFilter !== 'pending'}
								<td>
									<span class="badge {resultStatus.class} badge-sm">
										{resultStatus.text}
									</span>
								</td>
							{/if}
							<td>
								<span class="text-sm text-base-content/60">
									{formatDate(result.discoveredAt)}
								</span>
							</td>
							{#if statusFilter === 'pending'}
								<td>
									<div class="flex justify-end gap-1">
										<button
											class="btn text-success btn-ghost btn-sm"
											onclick={() => {
												selectedIds = new SvelteSet([result.id]);
												approveSelected();
											}}
											disabled={approving || ignoring}
											title="Approve"
										>
											<Check class="h-4 w-4" />
										</button>
										<button
											class="btn btn-ghost btn-sm"
											onclick={() => {
												selectedIds = new SvelteSet([result.id]);
												ignoreSelected();
											}}
											disabled={approving || ignoring}
											title="Ignore"
										>
											<X class="h-4 w-4" />
										</button>
									</div>
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
