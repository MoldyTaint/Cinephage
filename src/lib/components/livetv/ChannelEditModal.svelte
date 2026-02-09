<script lang="ts">
	import {
		Loader2,
		Tv,
		Plus,
		Trash2,
		ChevronUp,
		ChevronDown,
		AlertCircle,
		X,
		Copy,
		Check,
		Archive,
		Link
	} from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import type {
		ChannelLineupItemWithDetails,
		ChannelCategory,
		UpdateChannelRequest,
		ChannelBackupLink
	} from '$lib/types/livetv';

	interface Props {
		open: boolean;
		channel: ChannelLineupItemWithDetails | null;
		categories: ChannelCategory[];
		saving: boolean;
		error: string | null;
		onClose: () => void;
		onSave: (id: string, data: UpdateChannelRequest) => void;
		onDelete?: () => void;
		onOpenBackupBrowser?: (lineupItemId: string, excludeChannelId: string) => void;
		onOpenEpgSourcePicker?: (channelId: string) => void;
	}

	let {
		open,
		channel,
		categories,
		saving,
		error,
		onClose,
		onSave,
		onDelete,
		onOpenBackupBrowser,
		onOpenEpgSourcePicker
	}: Props = $props();

	// Form state
	let channelNumber = $state<number | null>(null);
	let customName = $state('');
	let customLogo = $state('');
	let categoryId = $state<string | null>(null);
	let epgId = $state('');
	let epgSourceChannelId = $state<string | null>(null);

	// Backup links state
	let backups = $state<ChannelBackupLink[]>([]);
	let loadingBackups = $state(false);
	let backupError = $state<string | null>(null);
	let backupSaving = $state(false);

	// Collapse state
	let technicalDetailsOpen = $state(false);
	let backupsOpen = $state(false);

	// Copy state for stream command
	let copiedCmd = $state(false);

	// Validation
	const channelNumberError = $derived(
		channelNumber !== null && channelNumber < 1 ? 'Must be 1 or greater' : null
	);

	const customLogoError = $derived(
		customLogo.trim() && !customLogo.trim().match(/^https?:\/\//) ? 'Must be a valid URL' : null
	);

	const isValid = $derived(!channelNumberError && !customLogoError);

	// Computed logo preview URL
	const logoPreviewUrl = $derived.by(() => {
		const trimmed = customLogo.trim();
		if (trimmed && !customLogoError) {
			return trimmed;
		}
		return channel?.channel.logo || null;
	});

	// Load backups when modal opens
	async function loadBackups() {
		if (!channel) return;
		loadingBackups = true;
		backupError = null;
		try {
			const res = await fetch(`/api/livetv/lineup/${channel.id}/backups`);
			if (res.ok) {
				const data = await res.json();
				backups = data.backups || [];
			} else {
				backupError = 'Failed to load backups';
			}
		} catch {
			backupError = 'Failed to load backups';
		} finally {
			loadingBackups = false;
		}
	}

	// Remove a backup with proper error handling
	async function removeBackup(backupId: string) {
		if (!channel) return;
		const previousBackups = [...backups];
		backups = backups.filter((b) => b.id !== backupId);
		backupError = null;

		try {
			const res = await fetch(`/api/livetv/lineup/${channel.id}/backups/${backupId}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				backups = previousBackups;
				backupError = 'Failed to remove backup';
			}
		} catch {
			backups = previousBackups;
			backupError = 'Failed to remove backup';
		}
	}

	// Move backup up in priority
	async function moveBackupUp(index: number) {
		if (index === 0 || !channel) return;
		const newOrder = [...backups];
		[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
		backups = newOrder;
		await saveBackupOrder();
	}

	// Move backup down in priority
	async function moveBackupDown(index: number) {
		if (index >= backups.length - 1 || !channel) return;
		const newOrder = [...backups];
		[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
		backups = newOrder;
		await saveBackupOrder();
	}

	// Save backup order with proper error handling
	async function saveBackupOrder() {
		if (!channel) return;
		const previousOrder = [...backups];
		backupSaving = true;
		backupError = null;

		try {
			const res = await fetch(`/api/livetv/lineup/${channel.id}/backups/reorder`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ backupIds: backups.map((b) => b.id) })
			});
			if (!res.ok) {
				backups = previousOrder;
				backupError = 'Failed to reorder backups';
			}
		} catch {
			backups = previousOrder;
			backupError = 'Failed to reorder backups';
		} finally {
			backupSaving = false;
		}
	}

	// Copy stream command to clipboard
	async function copyStreamCommand() {
		if (!channel?.channel.stalker?.cmd) return;
		try {
			await navigator.clipboard.writeText(channel.channel.stalker.cmd);
			copiedCmd = true;
			setTimeout(() => {
				copiedCmd = false;
			}, 2000);
		} catch {
			// Silent failure
		}
	}

	// Initialize form when channel changes
	$effect(() => {
		if (channel && open) {
			channelNumber = channel.channelNumber;
			customName = channel.customName || '';
			customLogo = channel.customLogo || '';
			categoryId = channel.categoryId;
			epgId = channel.epgId || '';
			epgSourceChannelId = channel.epgSourceChannelId;
			backupError = null;
			copiedCmd = false;
			technicalDetailsOpen = false;
			backupsOpen = false;
			loadBackups();
		}
	});

	// Expose refresh function for parent to call after adding a backup
	export function refreshBackups() {
		loadBackups();
	}

	// Expose function for parent to set EPG source after picker selection
	export function setEpgSourceChannelId(channelId: string | null) {
		epgSourceChannelId = channelId;
	}

	function handleSubmit() {
		if (!channel || saving || !isValid) return;

		const data: UpdateChannelRequest = {
			channelNumber: channelNumber || null,
			customName: customName.trim() || null,
			customLogo: customLogo.trim() || null,
			categoryId,
			epgId: epgId.trim() || null,
			epgSourceChannelId
		};

		onSave(channel.id, data);
	}

	function clearEpgSource() {
		epgSourceChannelId = null;
	}

	function formatArchiveDuration(hours: number): string {
		if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
		const days = Math.floor(hours / 24);
		return `${days} day${days !== 1 ? 's' : ''}`;
	}
</script>

{#if channel}
	<ModalWrapper {open} {onClose} maxWidth="xl" labelledBy="channel-edit-modal-title">
		<!-- Header -->
		<div class="mb-4 flex items-center justify-between">
			<h3 id="channel-edit-modal-title" class="text-lg font-bold">Edit Channel</h3>
			<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
				<X class="h-4 w-4" />
			</button>
		</div>

		<!-- Channel Info Banner -->
		<div class="mb-6 flex items-center gap-3 rounded-lg bg-base-200 p-3">
			{#if channel.displayLogo}
				<img
					src={channel.displayLogo}
					alt=""
					class="h-12 w-12 rounded-lg bg-base-300 object-contain"
				/>
			{:else}
				<div class="flex h-12 w-12 items-center justify-center rounded-lg bg-base-300">
					<Tv class="h-6 w-6 text-base-content/30" />
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<span class="truncate font-medium">{channel.channel.name}</span>
					{#if channel.channel.stalker?.tvArchive}
						<span class="badge gap-1 badge-xs badge-info">
							<Archive class="h-3 w-3" />
							Archive
						</span>
					{/if}
				</div>
				<div class="text-sm text-base-content/60">{channel.accountName}</div>
			</div>
		</div>

		<!-- Error -->
		{#if error}
			<div class="mb-4 alert alert-error">
				<AlertCircle class="h-5 w-5" />
				<div>
					<div class="font-medium">Failed to save</div>
					<div class="text-sm opacity-80">{error}</div>
				</div>
			</div>
		{/if}

		<!-- Form -->
		<div class="space-y-3">
			<!-- Channel Number -->
			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="channelNumber">
					Channel Number
				</label>
				<input
					type="number"
					id="channelNumber"
					class="input-bordered input input-sm w-full {channelNumberError ? 'input-error' : ''}"
					bind:value={channelNumber}
					placeholder={String(channel.position)}
					min="1"
				/>
				{#if channelNumberError}
					<p class="mt-1 text-xs text-error">{channelNumberError}</p>
				{/if}
			</div>

			<!-- Custom Name -->
			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="customName">
					Custom Name
				</label>
				<input
					type="text"
					id="customName"
					class="input-bordered input input-sm w-full"
					bind:value={customName}
					placeholder={channel.channel.name}
				/>
			</div>

			<!-- Category -->
			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="category"> Category </label>
				<select
					id="category"
					class="select-bordered select w-full select-sm"
					bind:value={categoryId}
				>
					<option value={null}>Uncategorized</option>
					{#each categories as cat (cat.id)}
						<option value={cat.id}>{cat.name}</option>
					{/each}
				</select>
			</div>

			<!-- Custom Logo URL -->
			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="customLogo">
					Custom Logo URL
				</label>
				<div class="flex items-center gap-2">
					<input
						type="url"
						id="customLogo"
						class="input-bordered input input-sm flex-1 {customLogoError ? 'input-error' : ''}"
						bind:value={customLogo}
						placeholder="https://..."
					/>
					{#if logoPreviewUrl}
						<img
							src={logoPreviewUrl}
							alt="Preview"
							class="h-8 w-8 rounded bg-base-200 object-contain"
						/>
					{:else}
						<div class="flex h-8 w-8 items-center justify-center rounded bg-base-200">
							<Tv class="h-4 w-4 text-base-content/30" />
						</div>
					{/if}
				</div>
				{#if customLogoError}
					<p class="mt-1 text-xs text-error">{customLogoError}</p>
				{/if}
			</div>

			<!-- EPG ID -->
			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="epgId"> EPG ID </label>
				<input
					type="text"
					id="epgId"
					class="input-bordered input input-sm w-full"
					bind:value={epgId}
					placeholder="XMLTV channel ID"
				/>
				<p class="mt-1 text-xs text-base-content/50">Match with external EPG guide data</p>
			</div>

			<!-- EPG Source Override -->
			<div>
				<div class="mb-1 block text-sm text-base-content/70">EPG Source Override</div>
				{#if epgSourceChannelId && channel.epgSourceChannel}
					<div class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2">
						{#if channel.epgSourceChannel.logo}
							<img
								src={channel.epgSourceChannel.logo}
								alt=""
								class="h-8 w-8 rounded bg-base-300 object-contain"
							/>
						{:else}
							<div class="flex h-8 w-8 items-center justify-center rounded bg-base-300">
								<Tv class="h-4 w-4 text-base-content/30" />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium">{channel.epgSourceChannel.name}</div>
							<div class="text-xs text-base-content/50">{channel.epgSourceAccountName}</div>
						</div>
						<button
							type="button"
							class="btn text-error btn-ghost btn-xs"
							onclick={clearEpgSource}
							title="Remove"
						>
							<X class="h-4 w-4" />
						</button>
					</div>
				{:else if epgSourceChannelId}
					<div class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2">
						<div class="flex h-8 w-8 items-center justify-center rounded bg-base-300">
							<Link class="h-4 w-4 text-base-content/30" />
						</div>
						<div class="flex-1 text-sm text-base-content/60">EPG source selected</div>
						<button
							type="button"
							class="btn text-error btn-ghost btn-xs"
							onclick={clearEpgSource}
							title="Remove"
						>
							<X class="h-4 w-4" />
						</button>
					</div>
				{:else}
					<button
						type="button"
						class="btn w-full justify-start gap-2 btn-outline btn-sm"
						onclick={() => onOpenEpgSourcePicker?.(channel.channelId)}
					>
						<Link class="h-4 w-4" />
						Select EPG Source
					</button>
				{/if}
				<p class="mt-1 text-xs text-base-content/50">Use EPG from another channel</p>
			</div>
		</div>

		<!-- Technical Details (collapsible) -->
		<div class="collapse mt-4 rounded-lg bg-base-200" class:collapse-open={technicalDetailsOpen}>
			<button
				type="button"
				class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 text-sm font-medium"
				onclick={() => (technicalDetailsOpen = !technicalDetailsOpen)}
			>
				<span>Technical Details</span>
				<ChevronDown
					class="h-4 w-4 transition-transform {technicalDetailsOpen ? 'rotate-180' : ''}"
				/>
			</button>
			<div class="collapse-content px-3 pb-3">
				<div class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-base-content/50">Original Name</span>
						<span class="font-medium">{channel.channel.name}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-base-content/50">Original Number</span>
						<span class="font-medium">{channel.channel.number || 'None'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-base-content/50">Provider Category</span>
						<span class="font-medium">{channel.channel.categoryTitle || 'None'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-base-content/50">Archive</span>
						<span class="font-medium">
							{#if channel.channel.stalker?.tvArchive}
								Yes ({formatArchiveDuration(channel.channel.stalker?.archiveDuration)})
							{:else}
								No
							{/if}
						</span>
					</div>
					<div>
						<span class="text-base-content/50">Stream Command</span>
						<div class="mt-1 flex items-center gap-2">
							<code
								class="flex-1 truncate rounded bg-base-300 px-2 py-1 font-mono text-xs"
								title={channel.channel.stalker?.cmd}
							>
								{channel.channel.stalker?.cmd}
							</code>
							<button
								type="button"
								class="btn btn-ghost btn-xs"
								onclick={copyStreamCommand}
								title="Copy"
							>
								{#if copiedCmd}
									<Check class="h-3.5 w-3.5 text-success" />
								{:else}
									<Copy class="h-3.5 w-3.5" />
								{/if}
							</button>
						</div>
					</div>
					<div class="flex justify-between">
						<span class="text-base-content/50">Account ID</span>
						<span class="font-mono text-xs">{channel.accountId}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-base-content/50">Channel ID</span>
						<span class="font-mono text-xs">{channel.channelId}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Backup Sources (collapsible) -->
		<div class="collapse mt-2 rounded-lg bg-base-200" class:collapse-open={backupsOpen}>
			<button
				type="button"
				class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 text-sm font-medium"
				onclick={() => (backupsOpen = !backupsOpen)}
			>
				<span class="flex items-center gap-2">
					Backup Sources
					{#if backups.length > 0}
						<span class="badge badge-xs badge-neutral">{backups.length}</span>
					{/if}
				</span>
				<ChevronDown class="h-4 w-4 transition-transform {backupsOpen ? 'rotate-180' : ''}" />
			</button>
			<div class="collapse-content px-3 pb-3">
				{#if backupError}
					<div class="mb-2 alert py-2 alert-error">
						<AlertCircle class="h-4 w-4" />
						<span class="text-sm">{backupError}</span>
					</div>
				{/if}

				{#if loadingBackups}
					<div class="flex justify-center py-3">
						<Loader2 class="h-5 w-5 animate-spin text-base-content/50" />
					</div>
				{:else if backups.length === 0}
					<p class="py-2 text-xs text-base-content/50">
						No backups configured. Backups provide failover if the primary stream is unavailable.
					</p>
				{:else}
					<div class="space-y-2">
						{#each backups as backup, i (backup.id)}
							<div class="flex items-center gap-2 rounded bg-base-300 px-2 py-1.5">
								<span class="badge badge-xs badge-neutral">{i + 1}</span>
								{#if backup.channel.logo}
									<img
										src={backup.channel.logo}
										alt=""
										class="h-6 w-6 rounded bg-base-100 object-contain"
									/>
								{:else}
									<div class="flex h-6 w-6 items-center justify-center rounded bg-base-100">
										<Tv class="h-3 w-3 text-base-content/30" />
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<span class="block truncate text-xs font-medium">{backup.channel.name}</span>
									<span class="text-xs text-base-content/50">{backup.accountName}</span>
								</div>
								<div class="flex gap-0.5">
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => moveBackupUp(i)}
										disabled={i === 0 || backupSaving}
										title="Move up"
									>
										<ChevronUp class="h-3 w-3" />
									</button>
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => moveBackupDown(i)}
										disabled={i >= backups.length - 1 || backupSaving}
										title="Move down"
									>
										<ChevronDown class="h-3 w-3" />
									</button>
									<button
										type="button"
										class="btn text-error btn-ghost btn-xs"
										onclick={() => removeBackup(backup.id)}
										title="Remove"
									>
										<Trash2 class="h-3 w-3" />
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if onOpenBackupBrowser}
					<button
						type="button"
						class="btn mt-2 gap-1 btn-ghost btn-xs"
						onclick={() => onOpenBackupBrowser(channel.id, channel.channelId)}
					>
						<Plus class="h-3 w-3" />
						Add Backup
					</button>
				{/if}
			</div>
		</div>

		<!-- Footer -->
		<div class="modal-action mt-4">
			{#if onDelete}
				<button class="btn mr-auto btn-outline btn-sm btn-error" onclick={onDelete}>
					Delete
				</button>
			{/if}

			<button class="btn btn-ghost btn-sm" onclick={onClose} disabled={saving}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={handleSubmit} disabled={saving || !isValid}>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				Save
			</button>
		</div>
	</ModalWrapper>
{/if}
