<script lang="ts">
	import { Settings, Zap } from 'lucide-svelte';

	interface RootFolder {
		id: string;
		path: string;
	}

	interface ScoringProfile {
		id: string;
		name: string;
	}

	interface Props {
		sortBy: string;
		itemLimit: number;
		excludeInLibrary: boolean;
		refreshIntervalHours: number;
		autoAddBehavior: 'disabled' | 'add_only' | 'add_and_search';
		rootFolderId: string;
		scoringProfileId: string;
		autoAddMonitored: boolean;
		rootFolders: RootFolder[];
		scoringProfiles: ScoringProfile[];
		listSourceType?: 'tmdb-discover' | 'external-json';
	}

	let {
		sortBy = $bindable(),
		itemLimit = $bindable(),
		excludeInLibrary = $bindable(),
		refreshIntervalHours = $bindable(),
		autoAddBehavior = $bindable(),
		rootFolderId = $bindable(),
		scoringProfileId = $bindable(),
		autoAddMonitored = $bindable(),
		rootFolders,
		scoringProfiles,
		listSourceType = 'tmdb-discover'
	}: Props = $props();

	let showSettings = $state(true);

	const sortOptions = [
		{ value: 'popularity.desc', label: 'Most Popular' },
		{ value: 'popularity.asc', label: 'Least Popular' },
		{ value: 'vote_average.desc', label: 'Highest Rated' },
		{ value: 'vote_average.asc', label: 'Lowest Rated' },
		{ value: 'primary_release_date.desc', label: 'Newest First' },
		{ value: 'primary_release_date.asc', label: 'Oldest First' },
		{ value: 'title.asc', label: 'Title A-Z' },
		{ value: 'title.desc', label: 'Title Z-A' }
	];

	const intervalOptions = [
		{ value: 1, label: 'Every hour' },
		{ value: 6, label: 'Every 6 hours' },
		{ value: 12, label: 'Every 12 hours' },
		{ value: 24, label: 'Daily' },
		{ value: 48, label: 'Every 2 days' },
		{ value: 168, label: 'Weekly' }
	];
</script>

<div class="collapse-arrow collapse rounded-lg border border-base-300 bg-base-100">
	<input type="checkbox" bind:checked={showSettings} />
	<div class="collapse-title font-medium">
		<div class="flex items-center gap-2">
			<Settings class="h-4 w-4 text-base-content/70" />
			List Settings
		</div>
	</div>
	<div class="collapse-content">
		<div class="space-y-4 pt-2">
			<!-- Sort & Limit (only for TMDB Discover) -->
			{#if listSourceType === 'tmdb-discover'}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="form-control">
						<label class="label py-1" for="sortBy">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>Sort By</span
							>
						</label>
						<select id="sortBy" bind:value={sortBy} class="select-bordered select w-full select-sm">
							{#each sortOptions as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</div>
					<div class="form-control">
						<label class="label py-1" for="itemLimit">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>Max Items</span
							>
						</label>
						<input
							type="number"
							id="itemLimit"
							bind:value={itemLimit}
							min="1"
							max="1000"
							class="input-bordered input input-sm w-full"
						/>
					</div>
				</div>
			{/if}

			<!-- Refresh Interval -->
			<div class="form-control">
				<label class="label py-1" for="refreshInterval">
					<span class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
						>Refresh Interval</span
					>
				</label>
				<select
					id="refreshInterval"
					bind:value={refreshIntervalHours}
					class="select-bordered select w-full select-sm"
				>
					{#each intervalOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<!-- Exclude in Library -->
			<label class="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3">
				<input
					type="checkbox"
					bind:checked={excludeInLibrary}
					class="checkbox checkbox-sm checkbox-primary"
				/>
				<span class="label-text">Exclude items already in library</span>
			</label>

			<!-- Auto Search Section -->
			<div class="divider my-1 text-xs text-base-content/50">
				<div class="flex items-center gap-1">
					<Zap class="h-3 w-3" />
					Auto Search
				</div>
			</div>

			<div class="form-control">
				<label class="label py-1" for="autoAdd">
					<span class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
						>Auto Search</span
					>
				</label>
				<select
					id="autoAdd"
					bind:value={autoAddBehavior}
					class="select-bordered select w-full select-sm"
				>
					<option value="disabled">Disabled</option>
					<option value="add_only">Add to library only</option>
					<option value="add_and_search">Add and search for downloads</option>
				</select>
			</div>

			{#if autoAddBehavior !== 'disabled'}
				<div class="space-y-3 rounded-lg border border-base-300 bg-base-200/30 p-3">
					<div class="form-control">
						<label class="label py-1" for="rootFolder">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>Root Folder</span
							>
						</label>
						<select
							id="rootFolder"
							bind:value={rootFolderId}
							class="select-bordered select w-full select-sm"
						>
							<option value="">Select a folder...</option>
							{#each rootFolders as folder (folder.id)}
								<option value={folder.id}>{folder.path}</option>
							{/each}
						</select>
					</div>

					<div class="form-control">
						<label class="label py-1" for="scoringProfile">
							<span
								class="label-text text-xs font-medium tracking-wide text-base-content/60 uppercase"
								>Scoring Profile</span
							>
						</label>
						<select
							id="scoringProfile"
							bind:value={scoringProfileId}
							class="select-bordered select w-full select-sm"
						>
							<option value="">Default</option>
							{#each scoringProfiles as profile (profile.id)}
								<option value={profile.id}>{profile.name}</option>
							{/each}
						</select>
					</div>

					<label class="flex cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							bind:checked={autoAddMonitored}
							class="checkbox checkbox-sm checkbox-primary"
						/>
						<span class="label-text">Monitor added items</span>
					</label>
				</div>
			{/if}
		</div>
	</div>
</div>
