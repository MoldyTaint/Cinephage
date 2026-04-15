<script lang="ts">
	import { FolderOpen } from 'lucide-svelte';
	import { SectionHeader } from '$lib/components/ui/modal';
	import type { DownloadClientDefinition } from '$lib/types/downloadClient';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		definition?: DownloadClientDefinition | null;
		movieCategory?: string;
		tvCategory?: string;
		recentPriority?: 'normal' | 'high' | 'force';
		olderPriority?: 'normal' | 'high' | 'force';
		initialState?: 'start' | 'pause' | 'force';
		downloadPathLocal?: string;
		downloadPathRemote?: string;
		tempPathLocal?: string;
		tempPathRemote?: string;
		isSabnzbd?: boolean;
		isMountMode?: boolean;
		onBrowse?: (field: 'downloadPathLocal' | 'tempPathLocal') => void;
		mode?: 'connection' | 'settings';
		urlBaseEnabled?: boolean;
		urlBase?: string;
		urlBaseLabel?: string;
		urlBaseDescription?: string;
		urlBasePlaceholder?: string;
		showMountMode?: boolean;
		mountMode?: 'nzbdav' | 'altmount' | '';
	}

	let {
		definition = undefined,
		movieCategory = $bindable(),
		tvCategory = $bindable(),
		recentPriority = $bindable(),
		olderPriority = $bindable(),
		initialState = $bindable(),
		downloadPathLocal = $bindable(),
		downloadPathRemote = $bindable(),
		tempPathLocal = $bindable(),
		tempPathRemote = $bindable(),
		isSabnzbd = false,
		isMountMode = false,
		onBrowse = () => {},
		mode = 'settings',
		urlBaseEnabled = $bindable(),
		urlBase = $bindable(),
		urlBaseLabel = m.settings_integrations_downloadClients_urlBaseLabel(),
		urlBaseDescription = m.settings_integrations_downloadClients_urlBaseDescription(),
		urlBasePlaceholder = 'sabnzbd',
		showMountMode = false,
		mountMode = $bindable()
	}: Props = $props();

	const urlBaseToggleId = 'url-base-toggle';
	const urlBaseInputId = 'url-base-input';

	function handleUrlBaseToggle() {
		if (!urlBaseEnabled) {
			urlBase = '';
		}
	}
</script>

{#if mode === 'connection'}
	<div class="form-control">
		<label class="label cursor-pointer gap-2 py-1" for={urlBaseToggleId}>
			<input
				id={urlBaseToggleId}
				type="checkbox"
				class="checkbox checkbox-sm"
				bind:checked={urlBaseEnabled}
				onchange={handleUrlBaseToggle}
			/>
			<span class="label-text text-sm">{m.settings_integrations_downloadClients_useUrlBase()}</span>
		</label>

		{#if urlBaseEnabled}
			<div class="mt-1">
				<label class="label py-1" for={urlBaseInputId}>
					<span class="label-text">{urlBaseLabel}</span>
				</label>
				<input
					id={urlBaseInputId}
					type="text"
					class="input-bordered input input-sm"
					bind:value={urlBase}
					placeholder={urlBasePlaceholder}
				/>
				<div class="label py-1">
					<span class="label-text-alt text-xs text-base-content/60">{urlBaseDescription}</span>
				</div>
			</div>
		{/if}

		{#if showMountMode}
			<div class="mt-3">
				<label class="label py-1" for="mountMode">
					<span class="label-text">{m.settings_integrations_downloadClients_clientBehavior()}</span>
				</label>
				<select id="mountMode" class="select-bordered select select-sm" bind:value={mountMode}>
					<option value="">{m.settings_integrations_downloadClients_standardSabnzbd()}</option>
					<option value="nzbdav">{m.settings_integrations_downloadClients_altmountMode()}</option>
				</select>
				<p
					class="mt-1 text-xs leading-relaxed wrap-break-word whitespace-normal text-base-content/60"
				>
					{m.settings_integrations_downloadClients_mountModeHelp()}
				</p>
			</div>
		{/if}
	</div>
{:else}
	<!-- Categories (if supported) -->
	{#if definition?.supportsCategories}
		<SectionHeader title={m.settings_integrations_downloadClients_categories()} />

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div class="form-control">
				<label class="label py-1" for="movieCategory">
					<span class="label-text">{m.common_movies()}</span>
				</label>
				<input
					id="movieCategory"
					type="text"
					class="input-bordered input input-sm"
					bind:value={movieCategory}
					placeholder="movies"
				/>
			</div>

			<div class="form-control">
				<label class="label py-1" for="tvCategory">
					<span class="label-text">{m.common_tvShows()}</span>
				</label>
				<input
					id="tvCategory"
					type="text"
					class="input-bordered input input-sm"
					bind:value={tvCategory}
					placeholder="tv"
				/>
			</div>
		</div>
	{/if}

	<!-- Priority & Initial State (if supported) -->
	{#if definition?.supportsPriority}
		<SectionHeader
			title={m.settings_integrations_downloadClients_downloadBehavior()}
			class={definition?.supportsCategories ? 'mt-4' : ''}
		/>

		<div class="grid grid-cols-3 gap-3">
			<div class="form-control">
				<label class="label py-1" for="recentPriority">
					<span class="label-text text-xs">{m.settings_integrations_downloadClients_recent()}</span>
				</label>
				<select
					id="recentPriority"
					class="select-bordered select select-sm"
					bind:value={recentPriority}
				>
					<option value="normal">{m.common_default()}</option>
					<option value="high">{m.settings_integrations_downloadClients_highPriority()}</option>
					<option value="force">{m.settings_integrations_downloadClients_forcePriority()}</option>
				</select>
			</div>

			<div class="form-control">
				<label class="label py-1" for="olderPriority">
					<span class="label-text text-xs">{m.settings_integrations_downloadClients_older()}</span>
				</label>
				<select
					id="olderPriority"
					class="select-bordered select select-sm"
					bind:value={olderPriority}
				>
					<option value="normal">{m.common_default()}</option>
					<option value="high">{m.settings_integrations_downloadClients_highPriority()}</option>
					<option value="force">{m.settings_integrations_downloadClients_forcePriority()}</option>
				</select>
			</div>

			<div class="form-control">
				<label class="label py-1" for="initialState">
					<span class="label-text text-xs">{m.settings_integrations_downloadClients_startAs()}</span
					>
				</label>
				<select
					id="initialState"
					class="select-bordered select select-sm"
					bind:value={initialState}
				>
					<option value="start">{m.settings_integrations_downloadClients_start()}</option>
					<option value="pause">{m.action_pause()}</option>
					<option value="force">{m.settings_integrations_downloadClients_forcePriority()}</option>
				</select>
			</div>
		</div>
	{/if}

	<!-- Path Mapping -->
	<SectionHeader title={m.settings_integrations_downloadClients_pathMapping()} class="mt-4" />

	<p class="mb-2 text-xs text-base-content/60">
		{m.settings_integrations_downloadClients_pathMappingDescription()}
	</p>

	<!-- Completed Downloads Path Mapping -->
	<div class="mb-3 rounded-lg bg-base-200/50 p-3">
		<div class="mb-2 text-xs font-medium text-base-content/80">
			{isSabnzbd
				? m.settings_integrations_downloadClients_completedDownloadFolder()
				: m.settings_integrations_downloadClients_downloadFolder()}
		</div>

		<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
			<div class="form-control">
				<label class="label py-0.5" for="downloadPathRemote">
					<span class="label-text text-xs"
						>{m.settings_integrations_downloadClients_clientPath()}</span
					>
				</label>
				<input
					id="downloadPathRemote"
					type="text"
					class="input-bordered input input-xs"
					bind:value={downloadPathRemote}
					placeholder={isSabnzbd ? '/complete' : '/downloads'}
				/>
			</div>

			<div class="form-control">
				<label class="label py-0.5" for="downloadPathLocal">
					<span class="label-text text-xs"
						>{m.settings_integrations_downloadClients_localPath()}</span
					>
				</label>
				<div class="join w-full">
					<input
						id="downloadPathLocal"
						type="text"
						class="input-bordered input input-xs join-item flex-1"
						bind:value={downloadPathLocal}
						placeholder="/mnt/downloads"
					/>
					<button
						type="button"
						class="btn join-item border border-base-300 btn-ghost btn-xs"
						onclick={() => onBrowse('downloadPathLocal')}
						title={m.action_browse()}
					>
						<FolderOpen class="h-3 w-3" />
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Temp Downloads Path Mapping (SABnzbd only) -->
	{#if isSabnzbd && !isMountMode}
		<div class="rounded-lg bg-base-200/50 p-3">
			<div class="mb-2 text-xs font-medium text-base-content/80">
				{m.settings_integrations_downloadClients_tempDownloadFolder()}
			</div>

			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<div class="form-control">
					<label class="label py-0.5" for="tempPathRemote">
						<span class="label-text text-xs"
							>{m.settings_integrations_downloadClients_clientPath()}</span
						>
					</label>
					<input
						id="tempPathRemote"
						type="text"
						class="input-bordered input input-xs"
						bind:value={tempPathRemote}
						placeholder="/incomplete"
					/>
				</div>

				<div class="form-control">
					<label class="label py-0.5" for="tempPathLocal">
						<span class="label-text text-xs"
							>{m.settings_integrations_downloadClients_localPath()}</span
						>
					</label>
					<div class="join w-full">
						<input
							id="tempPathLocal"
							type="text"
							class="input-bordered input input-xs join-item flex-1"
							bind:value={tempPathLocal}
							placeholder="/mnt/incomplete"
						/>
						<button
							type="button"
							class="btn join-item border border-base-300 btn-ghost btn-xs"
							onclick={() => onBrowse('tempPathLocal')}
							title={m.action_browse()}
						>
							<FolderOpen class="h-3 w-3" />
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}
