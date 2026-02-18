<script lang="ts">
	import type { IndexerDefinition } from '$lib/types/indexer';
	import IndexerSettingsFields from './IndexerSettingsFields.svelte';
	import { SectionHeader, ToggleSetting } from '$lib/components/ui/modal';

	interface Props {
		definition: IndexerDefinition | null;
		name: string;
		url: string;
		urlError: string;
		priority: number;
		enabled: boolean;
		settings: Record<string, string>;
		enableAutomaticSearch: boolean;
		enableInteractiveSearch: boolean;
		minimumSeeders: number;
		seedRatio: string;
		seedTime: number | '';
		packSeedTime: number | '';
		rejectDeadTorrents: boolean;
		isTorrent: boolean;
		isStreaming: boolean;
		hasAuthSettings: boolean;
		definitionUrls: string[];
		alternateUrls: string[];
		onNameChange: (value: string) => void;
		onUrlChange: (value: string) => void;
		onUrlBlur: () => void;
		onPriorityChange: (value: number) => void;
		onEnabledChange: (value: boolean) => void;
		onSettingsChange: (settings: Record<string, string>) => void;
		onAutomaticSearchChange: (value: boolean) => void;
		onInteractiveSearchChange: (value: boolean) => void;
		onMinimumSeedersChange: (value: number) => void;
		onSeedRatioChange: (value: string) => void;
		onSeedTimeChange: (value: number | '') => void;
		onPackSeedTimeChange: (value: number | '') => void;
		onRejectDeadTorrentsChange: (value: boolean) => void;
	}

	let {
		definition,
		name,
		url,
		urlError,
		priority,
		enabled,
		settings,
		enableAutomaticSearch,
		enableInteractiveSearch,
		minimumSeeders,
		seedRatio,
		seedTime,
		packSeedTime,
		rejectDeadTorrents,
		isTorrent,
		isStreaming,
		hasAuthSettings,
		definitionUrls,
		alternateUrls,
		onNameChange,
		onUrlChange,
		onUrlBlur,
		onPriorityChange,
		onEnabledChange,
		onSettingsChange,
		onAutomaticSearchChange,
		onInteractiveSearchChange,
		onMinimumSeedersChange,
		onSeedRatioChange,
		onSeedTimeChange,
		onPackSeedTimeChange,
		onRejectDeadTorrentsChange
	}: Props = $props();
</script>

<!-- Main Form - Two Column Layout -->
<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
	<!-- Left Column: Connection -->
	<div class="space-y-4">
		<SectionHeader title="Connection" />

		<div class="form-control">
			<label class="label py-1" for="regular-name">
				<span class="label-text">Name</span>
			</label>
			<input
				id="regular-name"
				type="text"
				class="input-bordered input input-sm"
				value={name}
				oninput={(e) => onNameChange(e.currentTarget.value)}
				placeholder={definition?.name ?? 'My Indexer'}
			/>
		</div>

		<!-- URL Selection -->
		<div class="form-control">
			<label class="label py-1" for="regular-url">
				<span class="label-text">URL</span>
				{#if alternateUrls.length > 0}
					<span class="label-text-alt text-xs text-base-content/60">
						+{alternateUrls.length} failover{alternateUrls.length > 1 ? 's' : ''}
					</span>
				{/if}
			</label>
			{#if definitionUrls.length > 1}
				<select
					id="regular-url"
					class="select-bordered select select-sm"
					value={url}
					onchange={(e) => onUrlChange(e.currentTarget.value)}
				>
					{#each definitionUrls as availableUrl (availableUrl)}
						<option value={availableUrl}>
							{availableUrl}
							{#if availableUrl === definition?.siteUrl}(default){/if}
						</option>
					{/each}
				</select>
			{:else}
				<input
					id="regular-url"
					type="url"
					class="input-bordered input input-sm {urlError ? 'input-error' : ''}"
					value={url}
					oninput={(e) => onUrlChange(e.currentTarget.value)}
					onblur={onUrlBlur}
					placeholder="https://..."
				/>
				{#if urlError}
					<p class="label py-0">
						<span class="label-text-alt text-error">{urlError}</span>
					</p>
				{/if}
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div class="form-control">
				<label class="label py-1" for="regular-priority">
					<span class="label-text">Priority</span>
					<span class="label-text-alt text-xs">1-100</span>
				</label>
				<input
					id="regular-priority"
					type="number"
					class="input-bordered input input-sm"
					value={priority}
					oninput={(e) => onPriorityChange(parseInt(e.currentTarget.value) || 25)}
					min="1"
					max="100"
				/>
				<p class="label py-0">
					<span class="label-text-alt text-xs">Lower = higher priority</span>
				</p>
			</div>

			<div>
				<span class="block py-1 text-sm">Status</span>
				<label class="flex cursor-pointer items-center gap-2 py-2">
					<input
						type="checkbox"
						class="checkbox shrink-0 checkbox-sm"
						checked={enabled}
						onchange={(e) => onEnabledChange(e.currentTarget.checked)}
					/>
					<span class="text-sm">Enabled</span>
				</label>
			</div>
		</div>

		<!-- Indexer Settings (API keys, config, etc) -->
		{#if hasAuthSettings && definition}
			<SectionHeader title={isStreaming ? 'Configuration' : 'Authentication'} class="mt-4" />
			<IndexerSettingsFields
				settingsDefinitions={definition.settings}
				{settings}
				onchange={(newSettings) => onSettingsChange(newSettings)}
			/>
		{/if}
	</div>

	<!-- Right Column: Search Settings -->
	<div class="space-y-4">
		<SectionHeader title="Search Settings" />

		<div class="space-y-2">
			<ToggleSetting
				checked={enableAutomaticSearch}
				label="Automatic Search"
				description="Search when items are added or upgraded"
				onchange={() => onAutomaticSearchChange(!enableAutomaticSearch)}
			/>
			<ToggleSetting
				checked={enableInteractiveSearch}
				label="Interactive Search"
				description="Manual searches from the UI"
				onchange={() => onInteractiveSearchChange(!enableInteractiveSearch)}
			/>
		</div>

		{#if isTorrent}
			<SectionHeader title="Torrent Settings" class="mt-4" />

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="form-control">
					<label class="label py-1" for="minimumSeeders">
						<span class="label-text">Min Seeders</span>
						<span class="label-text-alt text-xs">0+</span>
					</label>
					<input
						id="minimumSeeders"
						type="number"
						class="input-bordered input input-sm"
						value={minimumSeeders}
						oninput={(e) => onMinimumSeedersChange(parseInt(e.currentTarget.value) || 0)}
						min="0"
					/>
					<p class="label py-0">
						<span class="label-text-alt text-xs">Skip releases below this</span>
					</p>
				</div>

				<div class="form-control">
					<label class="label py-1" for="seedRatio">
						<span class="label-text">Seed Ratio</span>
					</label>
					<input
						id="seedRatio"
						type="text"
						class="input-bordered input input-sm"
						value={seedRatio}
						oninput={(e) => onSeedRatioChange(e.currentTarget.value)}
						placeholder="e.g., 1.0"
					/>
					<p class="label py-0">
						<span class="label-text-alt text-xs">Empty = use client default</span>
					</p>
				</div>

				<div class="form-control">
					<label class="label py-1" for="seedTime">
						<span class="label-text">Seed Time</span>
						<span class="label-text-alt text-xs">minutes</span>
					</label>
					<input
						id="seedTime"
						type="number"
						class="input-bordered input input-sm"
						value={seedTime}
						oninput={(e) => {
							const val = e.currentTarget.value;
							onSeedTimeChange(val === '' ? '' : parseInt(val) || 0);
						}}
						min="0"
						placeholder="Minutes"
					/>
				</div>

				<div class="form-control">
					<label class="label py-1" for="packSeedTime">
						<span class="label-text">Pack Seed Time</span>
						<span class="label-text-alt text-xs">minutes</span>
					</label>
					<input
						id="packSeedTime"
						type="number"
						class="input-bordered input input-sm"
						value={packSeedTime}
						oninput={(e) => {
							const val = e.currentTarget.value;
							onPackSeedTimeChange(val === '' ? '' : parseInt(val) || 0);
						}}
						min="0"
						placeholder="Minutes"
					/>
				</div>
			</div>

			<ToggleSetting
				checked={rejectDeadTorrents}
				label="Reject Dead Torrents"
				description="Skip releases with 0 seeders"
				onchange={() => onRejectDeadTorrentsChange(!rejectDeadTorrents)}
			/>
		{/if}

		{#if isStreaming}
			<SectionHeader title="Streaming Info" class="mt-4" />
			<div class="rounded-lg bg-info/10 p-4">
				<p class="text-sm text-base-content/70">
					Streaming indexers provide instant playback via .strm files. No torrent client required.
				</p>
				<ul class="mt-2 list-inside list-disc text-sm text-base-content/60">
					<li>Results are automatically scored lower than torrents</li>
					<li>Can be upgraded to higher quality torrent releases</li>
					<li>Perfect for watching content immediately</li>
				</ul>
			</div>
		{/if}
	</div>
</div>
