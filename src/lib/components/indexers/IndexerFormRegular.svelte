<script lang="ts">
	import { ChevronDown, Lock, Unlock, Globe, Shield } from 'lucide-svelte';
	import type { IndexerDefinition } from '$lib/types/indexer';
	import * as m from '$lib/paraglide/messages.js';
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

	const MAX_NAME_LENGTH = 20;
	const nameTooLong = $derived(name.length > MAX_NAME_LENGTH);

	// Collapsible section states
	let authSettingsOpen = $state(true);
	let torrentSettingsOpen = $state(false);

	// Build auth settings summary
	const authSummary = $derived.by(() => {
		if (!definition?.settings) return 'No configuration required';

		const editableSettings = definition.settings.filter((s) => !s.type.startsWith('info'));

		if (editableSettings.length === 0) return 'No configuration required';

		const configuredCount = editableSettings.filter((s) => {
			const val = settings[s.name];
			return val && val.trim() !== '';
		}).length;

		if (configuredCount === 0) return 'Not configured';
		if (configuredCount === editableSettings.length) return 'Fully configured';
		return `${configuredCount}/${editableSettings.length} fields configured`;
	});

	const authIcon = $derived.by(() => {
		if (!definition?.settings) return Unlock;
		const editableSettings = definition.settings.filter((s) => !s.type.startsWith('info'));
		if (editableSettings.length === 0) return Globe;

		const configuredCount = editableSettings.filter((s) => {
			const val = settings[s.name];
			return val && val.trim() !== '';
		}).length;

		if (configuredCount === editableSettings.length) return Shield;
		if (configuredCount > 0) return Lock;
		return Unlock;
	});

	// Build a concise summary of current torrent settings for the collapsed header
	const torrentSummary = $derived.by(() => {
		const parts: string[] = [];
		parts.push(`Min Seeders: ${minimumSeeders}`);
		if (seedRatio) {
			parts.push(`Ratio: ${seedRatio}`);
		}
		if (seedTime !== '' && seedTime > 0) {
			parts.push(`Seed: ${seedTime}m`);
		}
		if (packSeedTime !== '' && packSeedTime > 0) {
			parts.push(`Pack: ${packSeedTime}m`);
		}
		parts.push(rejectDeadTorrents ? 'Reject Dead' : 'Allow Dead');
		return parts.join(' · ');
	});
</script>

<div class="space-y-4">
	<!-- Connection Section -->
	<SectionHeader title="Connection" />

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
		<!-- Name -->
		<div class="form-control">
			<label class="label py-1" for="regular-name">
				<span class="label-text">Name</span>
				<span class="label-text-alt text-xs {nameTooLong ? 'text-error' : 'text-base-content/60'}">
					{name.length}/{MAX_NAME_LENGTH}
				</span>
			</label>
			<input
				id="regular-name"
				type="text"
				class="input-bordered input input-sm"
				value={name}
				oninput={(e) => onNameChange(e.currentTarget.value)}
				maxlength={MAX_NAME_LENGTH}
				placeholder={definition?.name ?? 'My Indexer'}
			/>
			{#if nameTooLong}
				<p class="label py-0">
					<span class="label-text-alt text-xs text-error">Max {MAX_NAME_LENGTH} characters.</span>
				</p>
			{/if}
		</div>

		<!-- URL -->
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

		<!-- Priority -->
		<div class="form-control">
			<label class="label py-1" for="regular-priority">
				<span class="label-text">Priority</span>
				<span class="label-text-alt text-xs">1-100, lower = higher</span>
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
		</div>
	</div>

	<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
		<!-- Enabled -->
		<div class="form-control">
			<label class="label py-1" for="regular-enabled">
				<span class="label-text">Status</span>
			</label>
			<label class="flex cursor-pointer items-center gap-2 py-2">
				<input
					id="regular-enabled"
					type="checkbox"
					class="checkbox shrink-0 checkbox-sm checkbox-primary"
					checked={enabled}
					onchange={(e) => onEnabledChange(e.currentTarget.checked)}
				/>
				<span class="text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
			</label>
		</div>

		<!-- Search Settings -->
		<ToggleSetting
			checked={enableAutomaticSearch}
			label={m.indexer_label_automaticSearch()}
			description={m.indexer_desc_automaticSearch()}
			onchange={() => onAutomaticSearchChange(!enableAutomaticSearch)}
		/>
		<ToggleSetting
			checked={enableInteractiveSearch}
			label={m.indexer_label_interactiveSearch()}
			description={m.indexer_desc_interactiveSearch()}
			onchange={() => onInteractiveSearchChange(!enableInteractiveSearch)}
		/>
	</div>

	<!-- Authentication Section (collapsible, only when has settings) -->
	{#if hasAuthSettings && definition}
		{@const AuthIcon = authIcon}
		<div class="collapse rounded-lg bg-base-200" class:collapse-open={authSettingsOpen}>
			<button
				type="button"
				class="collapse-title flex min-h-0 items-center justify-between px-4 py-3 text-sm font-medium"
				onclick={() => (authSettingsOpen = !authSettingsOpen)}
			>
				<div class="flex min-w-0 items-center gap-2">
					<AuthIcon class="h-4 w-4 shrink-0 text-base-content/70" />
					<span>{isStreaming ? 'Configuration' : 'Authentication'}</span>
					{#if !authSettingsOpen}
						<span class="ml-2 text-xs font-normal text-base-content/50">
							{authSummary}
						</span>
					{/if}
				</div>
				<ChevronDown
					class="ml-2 h-4 w-4 shrink-0 transition-transform {authSettingsOpen ? 'rotate-180' : ''}"
				/>
			</button>
			<div class="collapse-content px-4 pb-4">
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<IndexerSettingsFields
						settingsDefinitions={definition.settings}
						{settings}
						onchange={(newSettings) => onSettingsChange(newSettings)}
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- Torrent Settings (collapsible, torrent protocol only) -->
	{#if isTorrent}
		<div class="collapse rounded-lg bg-base-200" class:collapse-open={torrentSettingsOpen}>
			<button
				type="button"
				class="collapse-title flex min-h-0 items-center justify-between px-4 py-3 text-sm font-medium"
				onclick={() => (torrentSettingsOpen = !torrentSettingsOpen)}
			>
				<div class="min-w-0">
					<span>Torrent Settings</span>
					{#if !torrentSettingsOpen}
						<span class="ml-3 text-xs font-normal text-base-content/50">
							{torrentSummary}
						</span>
					{/if}
				</div>
				<ChevronDown
					class="ml-2 h-4 w-4 shrink-0 transition-transform {torrentSettingsOpen
						? 'rotate-180'
						: ''}"
				/>
			</button>
			<div class="collapse-content px-4 pb-4">
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
							<span class="label-text-alt text-xs">Empty = client default</span>
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

				<div class="mt-3">
					<ToggleSetting
						checked={rejectDeadTorrents}
						label={m.indexer_label_rejectDeadTorrents()}
						description={m.indexer_desc_rejectDeadTorrents()}
						onchange={() => onRejectDeadTorrentsChange(!rejectDeadTorrents)}
					/>
				</div>
			</div>
		</div>
	{/if}

	<!-- Streaming Info (streaming protocol only) -->
	{#if isStreaming}
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
