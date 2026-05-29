<script lang="ts">
	import { Clock, Check } from 'lucide-svelte';
	import type { DownloadClientDefinition } from '$lib/types/downloadClient';
	import NntpServerSettings from './forms/NntpServerSettings.svelte';
	import DownloadClientSettings from './forms/DownloadClientSettings.svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		maxConnections: number;
		priority: number;
		movieCategory: string;
		tvCategory: string;
		recentPriority: 'normal' | 'high' | 'force';
		olderPriority: 'normal' | 'high' | 'force';
		initialState: 'start' | 'pause' | 'force';
		downloadPathLocal: string;
		downloadPathRemote: string;
		tempPathLocal: string;
		tempPathRemote: string;
		stalledTimeout: number;
		stalledThreshold: number;
		saveStalledBehaviorSuccess: boolean;
		isNntpServer: boolean;
		selectedDefinition: DownloadClientDefinition | null;
		usesApiKey: boolean;
		isMountModeClient: boolean;
		onBrowse: (field: 'downloadPathLocal' | 'tempPathLocal') => void;
	}

	let {
		maxConnections = $bindable(),
		priority = $bindable(),
		movieCategory = $bindable(),
		tvCategory = $bindable(),
		recentPriority = $bindable(),
		olderPriority = $bindable(),
		initialState = $bindable(),
		downloadPathLocal = $bindable(),
		downloadPathRemote = $bindable(),
		tempPathLocal = $bindable(),
		tempPathRemote = $bindable(),
		stalledTimeout = $bindable(),
		stalledThreshold = $bindable(),
		saveStalledBehaviorSuccess = $bindable(),
		isNntpServer,
		selectedDefinition = null,
		usesApiKey,
		isMountModeClient,
		onBrowse
	}: Props = $props();
</script>

{#if isNntpServer}
	<NntpServerSettings bind:maxConnections bind:priority />
{:else}
	<DownloadClientSettings
		section="categories"
		definition={selectedDefinition}
		bind:movieCategory
		bind:tvCategory
		bind:recentPriority
		bind:olderPriority
		bind:initialState
		bind:downloadPathLocal
		bind:downloadPathRemote
		bind:tempPathLocal
		bind:tempPathRemote
		isSabnzbd={usesApiKey}
		isMountMode={isMountModeClient}
		{onBrowse}
	/>
{/if}

<div class="rounded-lg bg-base-200/50 p-3">
	<div class="mb-2 flex items-center gap-1.5">
		<Clock class="h-3.5 w-3.5 text-base-content/50" />
		<span class="text-xs font-semibold text-base-content/70"
			>{m.downloadClientModal_stalledDownloads()}</span
		>
		<span class="badge badge-ghost badge-xs text-[10px]"
			>{m.downloadClientModal_stalledGlobal()}</span
		>
	</div>
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div class="form-control">
			<label class="label py-1" for="stalled-timeout-modal">
				<span class="label-text">{m.downloadClientModal_stalledTimeout()}</span>
			</label>
			<input
				id="stalled-timeout-modal"
				type="number"
				class="input-bordered input input-sm w-full"
				min="0"
				step="5"
				bind:value={stalledTimeout}
			/>
		</div>
		<div class="form-control">
			<label class="label py-1" for="stalled-threshold-modal">
				<span class="label-text">{m.downloadClientModal_stalledProgress()}</span>
			</label>
			<input
				id="stalled-threshold-modal"
				type="number"
				class="input-bordered input input-sm w-full"
				min="0"
				max="100"
				step="5"
				bind:value={stalledThreshold}
			/>
		</div>
	</div>
	{#if saveStalledBehaviorSuccess}
		<p class="mt-1 flex items-center gap-1 text-xs text-success">
			<Check class="h-3 w-3" />
			{m.downloadClientModal_stalledSaved()}
		</p>
	{/if}
	<p class="mt-1 text-xs text-base-content/50">
		{#if stalledTimeout === 0}
			{m.downloadClientModal_stalledDisabled()}
		{:else}
			{m.downloadClientModal_stalledDescription({
				timeout: stalledTimeout,
				threshold: stalledThreshold
			})}
		{/if}
	</p>
</div>
