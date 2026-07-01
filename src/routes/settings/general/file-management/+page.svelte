<script lang="ts">
	import { FolderSync } from 'lucide-svelte';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import * as m from '$lib/paraglide/messages.js';
	import { toasts } from '$lib/stores/toast.svelte';
	import { updateFileManagementSettings } from '$lib/api/settings.js';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { ImportMethod } from '$lib/validation/schemas.js';

	let { data }: { data: PageData } = $props();

	let importMode = $state<ImportMethod>(data.settings.importMode);
	let minimumFreeSpaceGb = $state<number>(data.settings.minimumFreeSpaceGb);
	let deleteEmptyFolders = $state<boolean>(data.settings.deleteEmptyFolders);
	let recycleEnabled = $state<boolean>(data.settings.recycleEnabled);
	let saving = $state(false);

	async function save() {
		saving = true;
		try {
			await updateFileManagementSettings({ importMode, minimumFreeSpaceGb, deleteEmptyFolders, recycleEnabled });
			await invalidateAll();
			toasts.success(m.settings_fileManagement_saved());
		} catch {
			toasts.error(m.settings_fileManagement_failedToSave());
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{m.settings_fileManagement_pageTitle()}</title>
</svelte:head>

<SettingsPage
	title={m.settings_fileManagement_pageTitle()}
	subtitle={m.settings_fileManagement_pageDescription()}
>
	<SettingsSection
		title={m.settings_fileManagement_sectionTitle()}
		description={m.settings_fileManagement_sectionDescription()}
	>
		<div class="flex flex-col gap-3">

			<!-- Move option -->
			<label
				class="flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors
					{importMode === 'move'
					? 'border-primary bg-primary/5'
					: 'border-base-300 hover:border-base-content/30'}"
			>
				<input
					type="radio"
					name="importMode"
					value="move"
					class="radio radio-primary mt-0.5 shrink-0"
					bind:group={importMode}
				/>
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						<span class="font-medium">{m.settings_fileManagement_moveLabel()}</span>
						<span class="badge badge-primary badge-sm">Recommended</span>
					</div>
					<p class="mt-1 text-sm text-base-content/60">
						{m.settings_fileManagement_moveDesc()}
					</p>
				</div>
			</label>

			<!-- Copy option -->
			<label
				class="flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors
					{importMode === 'copy'
					? 'border-primary bg-primary/5'
					: 'border-base-300 hover:border-base-content/30'}"
			>
				<input
					type="radio"
					name="importMode"
					value="copy"
					class="radio radio-primary mt-0.5 shrink-0"
					bind:group={importMode}
				/>
				<div class="min-w-0 flex-1">
					<span class="font-medium">{m.settings_fileManagement_copyLabel()}</span>
					<p class="mt-1 text-sm text-base-content/60">
						{m.settings_fileManagement_copyDesc()}
					</p>
				</div>
			</label>
		</div>
	</SettingsSection>

	<SettingsSection
		title={m.settings_fileManagement_diskSpaceSectionTitle()}
		description={m.settings_fileManagement_diskSpaceSectionDescription()}
	>
		<div class="flex flex-col gap-1">
			<label class="label-text text-sm font-medium" for="minFreeSpace">
				{m.settings_fileManagement_minimumFreeSpaceLabel()}
			</label>
			<p class="text-sm text-base-content/70 mb-2">
				{m.settings_fileManagement_minimumFreeSpaceDesc()}
			</p>
			<div class="flex items-center gap-2">
				<input
					id="minFreeSpace"
					type="number"
					min="0"
					step="1"
					class="input input-bordered w-32"
					bind:value={minimumFreeSpaceGb}
				/>
				<span class="text-sm text-base-content/70">
					{m.settings_fileManagement_minimumFreeSpaceUnit()}
				</span>
			</div>
		</div>
	</SettingsSection>

	<SettingsSection
		title={m.settings_fileManagement_folderCleanupSectionTitle()}
		description={m.settings_fileManagement_folderCleanupSectionDescription()}
	>
		<label class="flex cursor-pointer items-start gap-4 rounded-lg border border-base-300 p-4 transition-colors hover:border-base-content/30 {deleteEmptyFolders ? 'border-primary bg-primary/5' : ''}">
			<input
				type="checkbox"
				class="checkbox checkbox-primary mt-0.5 shrink-0"
				bind:checked={deleteEmptyFolders}
			/>
			<div class="min-w-0 flex-1">
				<span class="font-medium">{m.settings_fileManagement_deleteEmptyFoldersLabel()}</span>
				<p class="mt-1 text-sm text-base-content/60">
					{m.settings_fileManagement_deleteEmptyFoldersDesc()}
				</p>
			</div>
		</label>
	</SettingsSection>

	<SettingsSection
		title={m.settings_fileManagement_recycleBinSectionTitle()}
		description={m.settings_fileManagement_recycleBinSectionDescription()}
	>
		<label class="flex cursor-pointer items-start gap-4 rounded-lg border border-base-300 p-4 transition-colors hover:border-base-content/30 {recycleEnabled ? 'border-primary bg-primary/5' : ''}">
			<input
				type="checkbox"
				class="checkbox checkbox-primary mt-0.5 shrink-0"
				bind:checked={recycleEnabled}
			/>
			<div class="min-w-0 flex-1">
				<span class="font-medium">{m.settings_fileManagement_recycleEnabledLabel()}</span>
				<p class="mt-1 text-sm text-base-content/60">
					{m.settings_fileManagement_recycleEnabledDesc()}
				</p>
			</div>
		</label>
	</SettingsSection>

	<div class="flex justify-end">
		<button class="btn btn-primary" onclick={save} disabled={saving}>
			{#if saving}
				<span class="loading loading-spinner loading-sm"></span>
			{:else}
				<FolderSync class="h-4 w-4" />
			{/if}
			Save
		</button>
	</div>
</SettingsPage>
