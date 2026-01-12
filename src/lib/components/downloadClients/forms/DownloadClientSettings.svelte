<script lang="ts">
	import { FolderOpen } from 'lucide-svelte';
	import { SectionHeader } from '$lib/components/ui/modal';
	import type { DownloadClientDefinition } from '$lib/types/downloadClient';

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
		isNzbMount?: boolean;
		onBrowse?: (field: 'downloadPathLocal' | 'tempPathLocal') => void;
		mode?: 'connection' | 'settings';
		urlBaseEnabled?: boolean;
		urlBase?: string;
		urlBaseLabel?: string;
		urlBaseDescription?: string;
		urlBasePlaceholder?: string;
		showMountMode?: boolean;
		mountMode?: 'nzbdav' | 'altmount';
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
		isNzbMount = false,
		onBrowse = () => {},
		mode = 'settings',
		urlBaseEnabled = $bindable(),
		urlBase = $bindable(),
		urlBaseLabel = 'URL Base',
		urlBaseDescription = 'Path prefix added after host and port.',
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
			<span class="label-text text-sm">Use URL Base</span>
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
					<span class="label-text">API Variant</span>
				</label>
				<select id="mountMode" class="select-bordered select select-sm" bind:value={mountMode}>
					<option value="nzbdav">NZBDav</option>
					<option value="altmount">Altmount</option>
				</select>
				<div class="label py-1">
					<span class="label-text-alt text-xs text-base-content/60">
						Select the API variant to tailor the connection test.
					</span>
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- Categories (if supported) -->
	{#if definition?.supportsCategories}
		<SectionHeader title="Categories" />

		<div class="grid grid-cols-2 gap-3">
			<div class="form-control">
				<label class="label py-1" for="movieCategory">
					<span class="label-text">Movies</span>
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
					<span class="label-text">TV Shows</span>
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
		<SectionHeader title="Download Behavior" class={definition?.supportsCategories ? 'mt-4' : ''} />

		<div class="grid grid-cols-3 gap-3">
			<div class="form-control">
				<label class="label py-1" for="recentPriority">
					<span class="label-text text-xs">Recent</span>
				</label>
				<select
					id="recentPriority"
					class="select-bordered select select-sm"
					bind:value={recentPriority}
				>
					<option value="normal">Normal</option>
					<option value="high">High</option>
					<option value="force">Force</option>
				</select>
			</div>

			<div class="form-control">
				<label class="label py-1" for="olderPriority">
					<span class="label-text text-xs">Older</span>
				</label>
				<select
					id="olderPriority"
					class="select-bordered select select-sm"
					bind:value={olderPriority}
				>
					<option value="normal">Normal</option>
					<option value="high">High</option>
					<option value="force">Force</option>
				</select>
			</div>

			<div class="form-control">
				<label class="label py-1" for="initialState">
					<span class="label-text text-xs">Start As</span>
				</label>
				<select
					id="initialState"
					class="select-bordered select select-sm"
					bind:value={initialState}
				>
					<option value="start">Start</option>
					<option value="pause">Paused</option>
					<option value="force">Force</option>
				</select>
			</div>
		</div>
	{/if}

	<!-- Path Mapping -->
	<SectionHeader title="Path Mapping" class="mt-4" />

	<p class="mb-2 text-xs text-base-content/60">
		Map paths between the download client's view and your local filesystem.
	</p>

	<!-- Completed Downloads Path Mapping -->
	<div class="mb-3 rounded-lg bg-base-200/50 p-3">
		<div class="mb-2 text-xs font-medium text-base-content/80">
			{isSabnzbd ? 'Completed Download Folder' : 'Download Folder'}
		</div>

		<div class="grid grid-cols-2 gap-2">
			<div class="form-control">
				<label class="label py-0.5" for="downloadPathRemote">
					<span class="label-text text-xs">Client Path</span>
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
					<span class="label-text text-xs">Local Path</span>
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
						title="Browse folders"
					>
						<FolderOpen class="h-3 w-3" />
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- Temp Downloads Path Mapping (SABnzbd only) -->
	{#if isSabnzbd && !isNzbMount}
		<div class="rounded-lg bg-base-200/50 p-3">
			<div class="mb-2 text-xs font-medium text-base-content/80">Temporary Download Folder</div>

			<div class="grid grid-cols-2 gap-2">
				<div class="form-control">
					<label class="label py-0.5" for="tempPathRemote">
						<span class="label-text text-xs">Client Path</span>
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
						<span class="label-text text-xs">Local Path</span>
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
							title="Browse folders"
						>
							<FolderOpen class="h-3 w-3" />
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}
