<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { Calendar, LayoutGrid, Settings } from 'lucide-svelte';
	import {
		EpgStatusPanel,
		EpgCoverageTable,
		EpgGuideGrid,
		EpgSourcePickerModal
	} from '$lib/components/livetv';
	import type {
		ChannelLineupItemWithDetails,
		EpgStatus,
		EpgProgram,
		EpgProgramWithProgress,
		UpdateChannelRequest
	} from '$lib/types/livetv';
	import { onMount, onDestroy } from 'svelte';

	type TabId = 'status' | 'coverage' | 'guide';

	interface NowNextEntry {
		now: EpgProgramWithProgress | null;
		next: EpgProgram | null;
	}

	// Tab state
	let activeTab = $state<TabId>('status');

	// Data state
	let lineup = $state<ChannelLineupItemWithDetails[]>([]);
	let loadingLineup = $state(true);

	// EPG status state
	let epgStatus = $state<EpgStatus | null>(null);
	let epgStatusLoading = $state(true);
	let epgSyncing = $state(false);
	let epgStatusPollInterval: ReturnType<typeof setInterval> | null = null;

	// EPG now/next data for coverage tab
	let epgData = new SvelteMap<string, NowNextEntry>();
	let epgDataInterval: ReturnType<typeof setInterval> | null = null;

	// EPG source picker state
	let epgSourcePickerOpen = $state(false);
	let epgSourcePickerChannel = $state<ChannelLineupItemWithDetails | null>(null);

	const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
		{ id: 'status', label: 'Status', icon: Settings },
		{ id: 'coverage', label: 'Coverage', icon: LayoutGrid },
		{ id: 'guide', label: 'Guide', icon: Calendar }
	];

	onMount(() => {
		loadLineup();
		fetchEpgStatus();
		fetchEpgData();
		epgDataInterval = setInterval(fetchEpgData, 60000);
	});

	onDestroy(() => {
		stopEpgStatusPoll();
		if (epgDataInterval) {
			clearInterval(epgDataInterval);
		}
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

	async function fetchEpgStatus() {
		try {
			const res = await fetch('/api/livetv/epg/status');
			if (res.ok) {
				epgStatus = await res.json();
				epgSyncing = epgStatus?.isSyncing ?? false;

				if (epgSyncing && !epgStatusPollInterval) {
					startEpgStatusPoll();
				} else if (!epgSyncing && epgStatusPollInterval) {
					stopEpgStatusPoll();
					fetchEpgData();
				}
			}
		} catch {
			// Silent failure
		} finally {
			epgStatusLoading = false;
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
		epgSyncing = true;
		try {
			await fetch('/api/livetv/epg/sync', { method: 'POST' });
			startEpgStatusPoll();
		} catch {
			epgSyncing = false;
		}
	}

	async function triggerAccountSync(accountId: string) {
		try {
			await fetch(`/api/livetv/epg/sync?accountId=${accountId}`, { method: 'POST' });
			startEpgStatusPoll();
		} catch {
			// Silent failure
		}
	}

	function startEpgStatusPoll() {
		if (epgStatusPollInterval) return;
		epgStatusPollInterval = setInterval(fetchEpgStatus, 3000);
	}

	function stopEpgStatusPoll() {
		if (epgStatusPollInterval) {
			clearInterval(epgStatusPollInterval);
			epgStatusPollInterval = null;
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
	<title>EPG - Live TV - Cinephage</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">EPG</h1>
			<p class="mt-1 text-base-content/60">Electronic Program Guide</p>
		</div>
	</div>

	<!-- Tabs -->
	<div class="tabs-boxed tabs">
		{#each tabs as tab (tab.id)}
			<button
				class="tab gap-2 {activeTab === tab.id ? 'tab-active' : ''}"
				onclick={() => (activeTab = tab.id)}
			>
				<svelte:component this={tab.icon} class="h-4 w-4" />
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Tab content -->
	{#if activeTab === 'status'}
		<EpgStatusPanel
			status={epgStatus}
			loading={epgStatusLoading}
			syncing={epgSyncing}
			onSync={triggerEpgSync}
			onSyncAccount={triggerAccountSync}
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
