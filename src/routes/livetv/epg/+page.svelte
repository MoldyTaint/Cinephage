<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { Calendar, LayoutGrid, Settings, Wifi, WifiOff, Loader2 } from 'lucide-svelte';
	import {
		EpgStatusPanel,
		EpgCoverageTable,
		EpgGuideGrid,
		EpgSourcePickerModal
	} from '$lib/components/livetv';
	import type {
		ChannelLineupItemWithDetails,
		EpgStatus,
		UpdateChannelRequest
	} from '$lib/types/livetv';
	import { createSSE } from '$lib/sse';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';
	import { resolvePath } from '$lib/utils/routing';
	import type { EpgStreamEvents } from '$lib/types/sse/events/livetv-epg-events.js';
	import type { NowNextEntry } from '$lib/types/sse/events/livetv-channel-events.js';
	import * as m from '$lib/paraglide/messages.js';

	type TabId = 'status' | 'coverage' | 'guide';

	// Tab state
	let activeTab = $state<TabId>('status');

	// Data state
	let lineup = $state<ChannelLineupItemWithDetails[]>([]);
	let loadingLineup = $state(true);

	// EPG status state
	let epgStatus = $state<EpgStatus | null>(null);
	let epgStatusLoading = $state(true);
	let epgSyncingAll = $state(false);
	let epgSyncingAccountIds = new SvelteSet<string>();
	let epgCancelRequestedAll = $state(false);
	let epgCancelRequestedAccountIds = new SvelteSet<string>();
	const epgSyncingAny = $derived(epgSyncingAll || epgSyncingAccountIds.size > 0);
	const epgSyncingAccountList = $derived([...epgSyncingAccountIds]);
	const epgCancelRequestedAccountList = $derived([...epgCancelRequestedAccountIds]);

	// EPG now/next data for coverage tab
	let epgData = new SvelteMap<string, NowNextEntry>();

	// EPG source picker state
	let epgSourcePickerOpen = $state(false);
	let epgSourcePickerChannel = $state<ChannelLineupItemWithDetails | null>(null);

	const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
		{ id: 'status', label: m.livetv_epg_tabStatus(), icon: Settings },
		{ id: 'coverage', label: m.livetv_epg_tabCoverage(), icon: LayoutGrid },
		{ id: 'guide', label: m.livetv_epg_tabGuide(), icon: Calendar }
	];

	function applySyncStateFromStatus(status: EpgStatus | null | undefined) {
		if (!status) return;
		const syncingIds = status.syncingAccountIds ?? [];
		const cancelRequestedIds = status.cancelRequestedAccountIds ?? [];
		epgSyncingAll = status.isSyncing && syncingIds.length === 0;
		epgCancelRequestedAll = status.cancelRequestedAll ?? false;
		if (status.syncingAccountIds !== undefined) {
			epgSyncingAccountIds.clear();
			for (const id of syncingIds) {
				epgSyncingAccountIds.add(id);
			}
		}
		epgCancelRequestedAccountIds.clear();
		for (const id of cancelRequestedIds) {
			epgCancelRequestedAccountIds.add(id);
		}
	}

	// SSE Connection - internally handles browser/SSR
	const sse = createSSE<EpgStreamEvents>(resolvePath('/api/livetv/epg/stream'), {
		'epg:initial': (payload) => {
			epgStatus = payload.status;
			applySyncStateFromStatus(payload.status);
			lineup = payload.lineup || [];
			loadingLineup = false;
			epgStatusLoading = false;
		},
		'epg:syncStarted': (payload) => {
			if (payload.status) {
				epgStatus = payload.status;
				applySyncStateFromStatus(payload.status);
			} else if (payload.accountId) {
				epgSyncingAccountIds.add(payload.accountId);
			} else {
				epgSyncingAll = true;
			}
		},
		'epg:syncCompleted': (payload) => {
			if (payload.status) {
				epgStatus = payload.status;
				applySyncStateFromStatus(payload.status);
			} else if (payload.accountId) {
				epgSyncingAccountIds.delete(payload.accountId);
			} else {
				epgSyncingAll = false;
				epgSyncingAccountIds.clear();
			}
			if (payload.lineup) {
				lineup = payload.lineup;
			}
			fetchEpgData();
		},
		'epg:syncFailed': (payload) => {
			if (payload.status) {
				epgStatus = payload.status;
				applySyncStateFromStatus(payload.status);
			} else if (payload.accountId) {
				epgSyncingAccountIds.delete(payload.accountId);
			} else {
				epgSyncingAll = false;
				epgSyncingAccountIds.clear();
			}
		},
		'lineup:updated': (payload) => {
			if (payload.lineup) {
				lineup = payload.lineup;
			}
		}
	});

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	$effect(() => {
		loadLineup();
		fetchEpgData();

		// Set loading to false after a timeout in case SSE never connects
		setTimeout(() => {
			epgStatusLoading = false;
		}, 5000);
	});

	async function loadLineup() {
		loadingLineup = true;
		try {
			const res = await fetch('/api/livetv/lineup');
			if (res.ok) {
				const data = await res.json();
				lineup = data.lineup || [];
			}
		} catch {
			// Silent failure
		} finally {
			loadingLineup = false;
		}
	}

	async function fetchEpgData() {
		try {
			const res = await fetch('/api/livetv/epg/now');
			if (!res.ok) return;
			const data = await res.json();
			if (data.channels) {
				epgData.clear();
				for (const [channelId, entry] of Object.entries(data.channels)) {
					epgData.set(channelId, entry as NowNextEntry);
				}
			}
		} catch {
			// Silent failure
		}
	}

	async function triggerEpgSync() {
		if (epgSyncingAny) return;
		epgCancelRequestedAll = false;
		epgCancelRequestedAccountIds.clear();
		epgSyncingAll = true;
		try {
			const response = await fetch('/api/livetv/epg/sync', { method: 'POST' });
			if (!response.ok) {
				throw new Error('Failed to trigger EPG sync');
			}
			const payload = (await response.json()) as { started?: boolean; alreadyRunning?: boolean };
			if (payload?.started === false && payload?.alreadyRunning) {
				epgSyncingAll = true;
			}
		} catch {
			epgSyncingAll = false;
		}
	}

	async function triggerAccountSync(accountId: string) {
		if (epgSyncingAny) return;
		epgCancelRequestedAccountIds.delete(accountId);
		epgSyncingAccountIds.add(accountId);
		try {
			const response = await fetch(`/api/livetv/epg/sync?accountId=${accountId}`, {
				method: 'POST'
			});
			if (!response.ok) {
				throw new Error('Failed to trigger EPG sync');
			}
			await response.json();
		} catch {
			epgSyncingAccountIds.delete(accountId);
		}
	}

	async function cancelEpgSync() {
		if (!epgSyncingAny) return;
		epgCancelRequestedAll = true;

		try {
			const response = await fetch('/api/livetv/epg/sync', { method: 'DELETE' });
			if (!response.ok) {
				throw new Error('Failed to cancel EPG sync');
			}
			const payload = (await response.json()) as { cancelRequested?: boolean };
			if (payload?.cancelRequested === false) {
				epgCancelRequestedAll = false;
			}
		} catch {
			epgCancelRequestedAll = false;
		}
	}

	async function cancelAccountSync(accountId: string) {
		if (!epgSyncingAll && !epgSyncingAccountIds.has(accountId)) return;
		epgCancelRequestedAccountIds.add(accountId);

		try {
			const response = await fetch(`/api/livetv/epg/sync?accountId=${accountId}`, {
				method: 'DELETE'
			});
			if (!response.ok) {
				throw new Error('Failed to cancel EPG sync');
			}
			const payload = (await response.json()) as { cancelRequested?: boolean };
			if (payload?.cancelRequested === false) {
				epgCancelRequestedAccountIds.delete(accountId);
			}
		} catch {
			epgCancelRequestedAccountIds.delete(accountId);
		}
	}

	function openEpgSourcePicker(channel: ChannelLineupItemWithDetails) {
		epgSourcePickerChannel = channel;
		epgSourcePickerOpen = true;
	}

	function closeEpgSourcePicker() {
		epgSourcePickerOpen = false;
		epgSourcePickerChannel = null;
	}

	async function handleEpgSourceSelected(channelId: string, _channel: unknown) {
		if (!epgSourcePickerChannel) return;

		try {
			const update: UpdateChannelRequest = { epgSourceChannelId: channelId };
			const res = await fetch(`/api/livetv/lineup/${epgSourcePickerChannel.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(update)
			});

			if (res.ok) {
				await loadLineup();
				await fetchEpgData();
			}
		} catch {
			// Silent failure
		}

		closeEpgSourcePicker();
	}
</script>

<svelte:head>
	<title>{m.livetv_epg_pageTitle()}</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">{m.livetv_epg_heading()}</h1>
			<p class="mt-1 text-base-content/60">{m.livetv_epg_subtitle()}</p>
		</div>
		<!-- Connection Status -->
		<div class="hidden lg:block">
			{#if sse.isConnected}
				<span class="badge gap-1 badge-success">
					<Wifi class="h-3 w-3" />
					{m.common_live()}
				</span>
			{:else if sse.status === 'connecting' || sse.status === 'error'}
				<span class="badge gap-1 {sse.status === 'error' ? 'badge-error' : 'badge-warning'}">
					<Loader2 class="h-3 w-3 animate-spin" />
					{sse.status === 'error' ? m.common_reconnecting() : m.common_connecting()}
				</span>
			{:else}
				<span class="badge gap-1 badge-ghost">
					<WifiOff class="h-3 w-3" />
					{m.common_disconnected()}
				</span>
			{/if}
		</div>
	</div>

	<!-- Tabs -->
	<div class="tabs-boxed tabs w-full overflow-x-auto sm:w-fit">
		{#each tabs as tab (tab.id)}
			<button
				class="tab-sm tab flex-1 gap-1 whitespace-nowrap sm:flex-none sm:gap-2 {activeTab === tab.id
					? 'tab-active'
					: ''}"
				onclick={() => (activeTab = tab.id)}
			>
				<tab.icon class="h-4 w-4" />
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Tab content -->
	{#if activeTab === 'status'}
		<EpgStatusPanel
			status={epgStatus}
			loading={epgStatusLoading}
			syncingAll={epgSyncingAll}
			syncingAccountIds={epgSyncingAccountList}
			cancelRequestedAll={epgCancelRequestedAll}
			cancelRequestedAccountIds={epgCancelRequestedAccountList}
			onSync={triggerEpgSync}
			onSyncAccount={triggerAccountSync}
			onCancel={cancelEpgSync}
			onCancelAccount={cancelAccountSync}
		/>
	{:else if activeTab === 'coverage'}
		<EpgCoverageTable
			{lineup}
			{epgData}
			loading={loadingLineup}
			onSetEpgSource={openEpgSourcePicker}
		/>
	{:else if activeTab === 'guide'}
		<EpgGuideGrid {lineup} loading={loadingLineup} />
	{/if}
</div>

<!-- EPG Source Picker Modal -->
<EpgSourcePickerModal
	open={epgSourcePickerOpen}
	excludeChannelId={epgSourcePickerChannel?.channelId}
	onClose={closeEpgSourcePicker}
	onSelect={handleEpgSourceSelected}
/>
