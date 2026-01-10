<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { Tv, Check, AlertCircle, ArrowRight, Calendar, Loader2 } from 'lucide-svelte';
	import type {
		ChannelLineupItemWithDetails,
		EpgProgram,
		EpgProgramWithProgress
	} from '$lib/types/livetv';

	interface NowNextEntry {
		now: EpgProgramWithProgress | null;
		next: EpgProgram | null;
	}

	type EpgFilter = 'all' | 'missing' | 'override' | 'has-epg';

	interface Props {
		lineup: ChannelLineupItemWithDetails[];
		epgData: SvelteMap<string, NowNextEntry>;
		loading: boolean;
		onSetEpgSource: (channel: ChannelLineupItemWithDetails) => void;
	}

	let { lineup, epgData, loading, onSetEpgSource }: Props = $props();

	let filter = $state<EpgFilter>('all');
	let searchQuery = $state('');

	function getEpgStatus(
		channel: ChannelLineupItemWithDetails,
		epg: NowNextEntry | undefined
	): 'has-epg' | 'missing' | 'override' {
		if (channel.epgSourceChannelId) {
			return 'override';
		}
		if (epg?.now || epg?.next) {
			return 'has-epg';
		}
		return 'missing';
	}

	const filteredLineup = $derived.by(() => {
		let result = lineup;

		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(ch) =>
					ch.displayName.toLowerCase().includes(query) ||
					ch.accountName.toLowerCase().includes(query)
			);
		}

		// Apply EPG status filter
		if (filter !== 'all') {
			result = result.filter((ch) => {
				const epg = epgData.get(ch.channelId);
				const status = getEpgStatus(ch, epg);
				return status === filter;
			});
		}

		return result;
	});

	const stats = $derived.by(() => {
		let hasEpg = 0;
		let missing = 0;
		let override = 0;

		for (const ch of lineup) {
			const epg = epgData.get(ch.channelId);
			const status = getEpgStatus(ch, epg);
			if (status === 'has-epg') hasEpg++;
			else if (status === 'missing') missing++;
			else if (status === 'override') override++;
		}

		return { hasEpg, missing, override, total: lineup.length };
	});
</script>

<div class="space-y-4">
	<!-- Stats and filters -->
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-2">
			<div class="stats stats-horizontal bg-base-200 shadow">
				<div class="stat px-4 py-2">
					<div class="stat-title text-xs">Total</div>
					<div class="stat-value text-lg">{stats.total}</div>
				</div>
				<div class="stat px-4 py-2">
					<div class="stat-title text-xs">Has EPG</div>
					<div class="stat-value text-lg text-success">{stats.hasEpg}</div>
				</div>
				<div class="stat px-4 py-2">
					<div class="stat-title text-xs">Missing</div>
					<div class="stat-value text-lg text-error">{stats.missing}</div>
				</div>
				<div class="stat px-4 py-2">
					<div class="stat-title text-xs">Override</div>
					<div class="stat-value text-lg text-info">{stats.override}</div>
				</div>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<input
				type="text"
				placeholder="Search channels..."
				class="input-bordered input input-sm w-48"
				bind:value={searchQuery}
			/>
			<select class="select-bordered select select-sm" bind:value={filter}>
				<option value="all">All Channels</option>
				<option value="missing">Missing EPG</option>
				<option value="has-epg">Has EPG</option>
				<option value="override">Using Override</option>
			</select>
		</div>
	</div>

	<!-- Table -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if filteredLineup.length === 0}
		<div class="py-12 text-center text-base-content/50">
			{#if lineup.length === 0}
				No channels in lineup
			{:else}
				No channels match the current filter
			{/if}
		</div>
	{:else}
		<div class="overflow-x-auto">
			<table class="table table-sm">
				<thead>
					<tr>
						<th class="w-12"></th>
						<th>Channel</th>
						<th>Account</th>
						<th>EPG Status</th>
						<th>Current Program</th>
						<th>EPG Source</th>
						<th class="w-24">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredLineup as channel (channel.id)}
						{@const epg = epgData.get(channel.channelId)}
						{@const status = getEpgStatus(channel, epg)}
						<tr class="hover">
							<td>
								{#if channel.displayLogo}
									<img
										src={channel.displayLogo}
										alt=""
										class="h-8 w-8 rounded bg-base-300 object-contain"
									/>
								{:else}
									<div class="flex h-8 w-8 items-center justify-center rounded bg-base-300">
										<Tv class="h-4 w-4 text-base-content/30" />
									</div>
								{/if}
							</td>
							<td>
								<div class="font-medium">{channel.displayName}</div>
								{#if channel.channelNumber}
									<div class="text-xs text-base-content/50">#{channel.channelNumber}</div>
								{/if}
							</td>
							<td>
								<span class="text-sm text-base-content/70">{channel.accountName}</span>
							</td>
							<td>
								{#if status === 'has-epg'}
									<div class="badge gap-1 badge-sm badge-success">
										<Check class="h-3 w-3" />
										Has EPG
									</div>
								{:else if status === 'missing'}
									<div class="badge gap-1 badge-sm badge-error">
										<AlertCircle class="h-3 w-3" />
										Missing
									</div>
								{:else}
									<div class="badge gap-1 badge-sm badge-info">
										<ArrowRight class="h-3 w-3" />
										Override
									</div>
								{/if}
							</td>
							<td>
								{#if epg?.now}
									<div class="max-w-48 truncate text-sm" title={epg.now.title}>
										{epg.now.title}
									</div>
									<div class="flex items-center gap-2">
										<progress
											class="progress h-1 w-16 progress-primary"
											value={epg.now.progress * 100}
											max="100"
										></progress>
										<span class="text-xs text-base-content/50"
											>{epg.now.remainingMinutes}m left</span
										>
									</div>
								{:else}
									<span class="text-sm text-base-content/40">No data</span>
								{/if}
							</td>
							<td
								class="cursor-pointer rounded transition-colors hover:bg-base-200"
								ondblclick={() => onSetEpgSource(channel)}
								role="button"
								tabindex="0"
								onkeydown={(e) => e.key === 'Enter' && onSetEpgSource(channel)}
								title="Double-click to change EPG source"
							>
								{#if channel.epgSourceChannel}
									<div class="flex items-center gap-1 text-sm text-info">
										<Calendar class="h-3 w-3" />
										<span class="max-w-24 truncate">{channel.epgSourceChannel.name}</span>
									</div>
								{:else}
									<span class="text-sm text-base-content/40">Default</span>
								{/if}
							</td>
							<td>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => onSetEpgSource(channel)}
									title="Set EPG Source"
								>
									Set EPG
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
