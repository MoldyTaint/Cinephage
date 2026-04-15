<script lang="ts">
	import {
		AlertCircle,
		Archive,
		Check,
		ChevronDown,
		ChevronUp,
		Copy,
		Link,
		Loader2,
		Plus,
		Search,
		Trash2,
		Tv,
		X
	} from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import { normalizeLiveTvChannelName } from '$lib/livetv/channel-name-normalizer';
	import { copyToClipboard as copyTextToClipboard } from '$lib/utils/clipboard';
	import { toasts } from '$lib/stores/toast.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type {
		ChannelBackupLink,
		ChannelCategory,
		ChannelLineupItemWithDetails,
		UpdateChannelRequest
	} from '$lib/types/livetv';
	import * as m from '$lib/paraglide/messages.js';

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

	interface LogoLibraryItem {
		path: string;
		country: string;
		name: string;
		filename: string;
		url: string;
	}

	interface LogoCountryOption {
		code: string;
		name: string;
		logoCount: number;
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

	let channelNumber = $state<number | null>(null);
	let customName = $state('');
	let customLogo = $state('');
	let categoryId = $state<string | null>(null);
	let epgId = $state('');
	let epgSourceChannelId = $state<string | null>(null);

	let backups = $state<ChannelBackupLink[]>([]);
	let loadingBackups = $state(false);
	let backupError = $state<string | null>(null);
	let backupSaving = $state(false);

	let technicalDetailsOpen = $state(false);
	let backupsOpen = $state(false);
	let copiedCmd = $state(false);
	let logoPickerOpen = $state(false);
	let logoPickerSearch = $state('');
	let logoPickerCountry = $state('');
	let logoPickerLoading = $state(false);
	let logoPickerLoadingMore = $state(false);
	let logoPickerError = $state<string | null>(null);
	let logoPickerItems = $state<LogoLibraryItem[]>([]);
	let logoPickerCountries = $state<LogoCountryOption[]>([]);
	let logoLibraryReady = $state<boolean | null>(null);
	let logoPickerOffset = $state(0);
	let logoPickerHasMore = $state(false);
	let logoPickerRequestId = 0;

	const channelNumberError = $derived(
		channelNumber !== null && channelNumber < 1
			? m.livetv_channelEditModal_channelNumberError()
			: null
	);

	const customLogoError = $derived(
		customLogo.trim() &&
			!customLogo.trim().match(/^https?:\/\//) &&
			!customLogo.trim().startsWith('/')
			? m.livetv_channelEditModal_customLogoError()
			: null
	);

	const isValid = $derived(!channelNumberError && !customLogoError);

	const normalizedSuggestedName = $derived(
		channel ? normalizeLiveTvChannelName(channel.channel.name, channel.providerType) : ''
	);

	const canApplySuggestedName = $derived(
		normalizedSuggestedName.length > 0 && customName.trim() !== normalizedSuggestedName
	);

	const logoPreviewUrl = $derived.by(() => {
		const trimmed = customLogo.trim();
		if (trimmed && !customLogoError) {
			return trimmed;
		}
		return channel?.displayLogo ?? channel?.channel.logo ?? null;
	});

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
			closeLogoPicker();
			loadBackups();
		}
	});

	$effect(() => {
		if (!open || !logoPickerOpen) return;

		const currentSearch = logoPickerSearch;
		const currentCountry = logoPickerCountry;
		const timer = setTimeout(() => {
			loadLogoLibrary(currentSearch, currentCountry);
		}, 250);

		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!open || !logoPickerOpen || logoPickerCountries.length > 0 || logoLibraryReady === false)
			return;
		loadLogoCountries();
	});

	export function refreshBackups() {
		loadBackups();
	}

	export function setEpgSourceChannelId(channelId: string | null) {
		epgSourceChannelId = channelId;
	}

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
				backupError = m.livetv_channelEditModal_failedToLoadBackups();
			}
		} catch {
			backupError = m.livetv_channelEditModal_failedToLoadBackups();
		} finally {
			loadingBackups = false;
		}
	}

	async function removeBackup(backupId: string) {
		if (!channel) return;
		const previousBackups = [...backups];
		backups = backups.filter((backup) => backup.id !== backupId);
		backupError = null;

		try {
			const res = await fetch(`/api/livetv/lineup/${channel.id}/backups/${backupId}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				backups = previousBackups;
				backupError = m.livetv_channelEditModal_failedToRemoveBackup();
			}
		} catch {
			backups = previousBackups;
			backupError = m.livetv_channelEditModal_failedToRemoveBackup();
		}
	}

	async function moveBackupUp(index: number) {
		if (index === 0 || !channel) return;
		const newOrder = [...backups];
		[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
		backups = newOrder;
		await saveBackupOrder();
	}

	async function moveBackupDown(index: number) {
		if (index >= backups.length - 1 || !channel) return;
		const newOrder = [...backups];
		[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
		backups = newOrder;
		await saveBackupOrder();
	}

	async function saveBackupOrder() {
		if (!channel) return;
		const previousOrder = [...backups];
		backupSaving = true;
		backupError = null;

		try {
			const res = await fetch(`/api/livetv/lineup/${channel.id}/backups/reorder`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ backupIds: backups.map((backup) => backup.id) })
			});
			if (!res.ok) {
				backups = previousOrder;
				backupError = m.livetv_channelEditModal_failedToReorderBackups();
			}
		} catch {
			backups = previousOrder;
			backupError = m.livetv_channelEditModal_failedToReorderBackups();
		} finally {
			backupSaving = false;
		}
	}

	async function copyStreamCommand() {
		if (!channel?.channel.stalker?.cmd) return;
		const copied = await copyTextToClipboard(channel.channel.stalker.cmd);
		if (copied) {
			copiedCmd = true;
			setTimeout(() => {
				copiedCmd = false;
			}, 2000);
		} else {
			toasts.error(m.livetv_channelEditModal_failedToCopy());
		}
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

	function applySuggestedName() {
		if (!normalizedSuggestedName) return;
		customName = normalizedSuggestedName;
	}

	function clearCustomName() {
		customName = '';
	}

	function clearEpgSource() {
		epgSourceChannelId = null;
	}

	function toggleLogoPicker() {
		logoPickerOpen = !logoPickerOpen;
	}

	function closeLogoPicker() {
		logoPickerOpen = false;
		logoPickerSearch = '';
		logoPickerCountry = '';
		logoPickerLoading = false;
		logoPickerLoadingMore = false;
		logoPickerError = null;
		logoPickerItems = [];
		logoPickerCountries = [];
		logoLibraryReady = null;
		logoPickerOffset = 0;
		logoPickerHasMore = false;
	}

	function applyLogoSelection(url: string) {
		customLogo = url;
		logoPickerOpen = false;
	}

	function clearCustomLogo() {
		customLogo = '';
		logoPickerOpen = false;
	}

	async function loadLogoCountries() {
		try {
			const res = await fetch('/api/logos/countries');
			const body = await res.json().catch(() => null);

			if (!res.ok || !body?.success) {
				if (body?.code === 'NOT_DOWNLOADED') {
					logoLibraryReady = false;
				}
				return;
			}

			logoPickerCountries = body.data ?? [];
		} catch {
			// Ignore country filter failures. The picker can still work without them.
		}
	}

	function handleLogoPickerScroll(event: Event) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLDivElement)) return;

		const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 48;
		if (!nearBottom || logoPickerLoading || logoPickerLoadingMore || !logoPickerHasMore) return;

		loadLogoLibrary(logoPickerSearch, logoPickerCountry, true);
	}

	async function loadLogoLibrary(search = '', country = '', append = false) {
		if (append && (logoPickerLoading || logoPickerLoadingMore || !logoPickerHasMore)) {
			return;
		}

		const requestId = ++logoPickerRequestId;
		const offset = append ? logoPickerOffset : 0;

		if (append) {
			logoPickerLoadingMore = true;
		} else {
			logoPickerLoading = true;
			logoPickerItems = [];
			logoPickerOffset = 0;
			logoPickerHasMore = false;
		}

		logoPickerError = null;

		try {
			const params = new SvelteURLSearchParams({ limit: '18', offset: String(offset) });
			if (search.trim()) params.set('search', search.trim());
			if (country) params.set('country', country);

			const res = await fetch(`/api/logos?${params.toString()}`);
			const body = await res.json().catch(() => null);

			if (requestId !== logoPickerRequestId) {
				return;
			}

			if (!res.ok || !body?.success) {
				logoPickerItems = [];
				logoPickerOffset = 0;
				logoPickerHasMore = false;
				if (body?.code === 'NOT_DOWNLOADED') {
					logoLibraryReady = false;
					logoPickerError =
						'Download logos from the Live TV channels page to browse the logo library.';
				} else {
					logoLibraryReady = null;
					logoPickerError = body?.error || 'Failed to load logos';
				}
				return;
			}

			logoLibraryReady = true;
			const nextItems = body.data ?? [];
			logoPickerItems = append ? [...logoPickerItems, ...nextItems] : nextItems;
			logoPickerOffset = offset + nextItems.length;
			logoPickerHasMore = body.pagination?.hasMore ?? false;
		} catch {
			if (requestId !== logoPickerRequestId) {
				return;
			}

			logoLibraryReady = null;
			logoPickerItems = [];
			logoPickerError = 'Failed to load logos';
		} finally {
			if (requestId === logoPickerRequestId) {
				logoPickerLoading = false;
				logoPickerLoadingMore = false;
			}
		}
	}

	function formatArchiveDuration(hours: number): string {
		if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
		const days = Math.floor(hours / 24);
		return `${days} day${days !== 1 ? 's' : ''}`;
	}
</script>

{#if channel}
	<ModalWrapper {open} {onClose} maxWidth="xl" labelledBy="channel-edit-modal-title">
		<div class="mb-4 flex items-center justify-between">
			<h3 id="channel-edit-modal-title" class="text-lg font-bold">
				{m.livetv_channelEditModal_title()}
			</h3>
			<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
				<X class="h-4 w-4" />
			</button>
		</div>

		<div class="mb-6 flex items-center gap-3 rounded-lg bg-base-200 p-3">
			{#if logoPreviewUrl}
				<img src={logoPreviewUrl} alt="" class="h-12 w-12 rounded-lg bg-base-300 object-contain" />
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
							{m.livetv_channelEditModal_archive()}
						</span>
					{/if}
				</div>
				<div class="text-sm text-base-content/60">{channel.accountName}</div>
			</div>
		</div>

		{#if error}
			<div class="mb-4 alert alert-error">
				<AlertCircle class="h-5 w-5" />
				<div>
					<div class="font-medium">Failed to save</div>
					<div class="text-sm opacity-80">{error}</div>
				</div>
			</div>
		{/if}

		<div class="space-y-3">
			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="channelNumber">
					{m.livetv_channelEditModal_channelNumber()}
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

			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="customName">
					{m.livetv_channelEditModal_customName()}
				</label>
				<input
					type="text"
					id="customName"
					class="input-bordered input input-sm w-full"
					bind:value={customName}
					placeholder={channel.channel.name}
				/>
				<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-base-content/60">
					<span
						>{m.livetv_channelEditModal_cleanedName({
							name: normalizedSuggestedName || channel.channel.name
						})}</span
					>
					{#if canApplySuggestedName}
						<button type="button" class="btn btn-ghost btn-xs" onclick={applySuggestedName}>
							{m.livetv_channelEditModal_useCleanedName()}
						</button>
					{/if}
					{#if customName.trim()}
						<button type="button" class="btn btn-ghost btn-xs" onclick={clearCustomName}>
							{m.livetv_channelEditModal_useProviderName()}
						</button>
					{/if}
				</div>
			</div>

			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="category"
					>{m.livetv_channelEditModal_category()}</label
				>
				<select
					id="category"
					class="select-bordered select w-full select-sm"
					bind:value={categoryId}
				>
					<option value={null}>{m.livetv_channelEditModal_uncategorized()}</option>
					{#each categories as cat (cat.id)}
						<option value={cat.id}>{cat.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="customLogo">
					{m.livetv_channelEditModal_customLogoUrl()}
				</label>
				<div class="relative">
					<div class="flex items-center gap-2">
						<input
							type="url"
							id="customLogo"
							class="input-bordered input input-sm flex-1 {customLogoError ? 'input-error' : ''}"
							bind:value={customLogo}
							placeholder={m.livetv_channelEditModal_customLogoPlaceholder()}
						/>
						<button
							type="button"
							class="btn btn-square shrink-0 btn-outline btn-sm"
							onclick={toggleLogoPicker}
							aria-expanded={logoPickerOpen}
							aria-haspopup="dialog"
							title={m.livetv_channelEditModal_browseLogos()}
						>
							<Search class="h-4 w-4" />
						</button>
					</div>

					{#if logoPickerOpen}
						<div
							class="fixed inset-0 z-40"
							onclick={closeLogoPicker}
							onkeydown={(e) => e.key === 'Escape' && closeLogoPicker()}
							role="button"
							tabindex="-1"
						></div>

						<div
							class="absolute inset-x-0 z-50 mt-2 rounded-xl border border-base-content/10 bg-base-100 p-3 shadow-xl"
						>
							<div class="mb-3 flex items-center gap-2">
								<div class="relative flex-1">
									<Search
										class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/40"
									/>
									<input
										type="text"
										class="input-bordered input input-sm w-full pl-9"
										placeholder={m.livetv_channelEditModal_searchLogosPlaceholder()}
										bind:value={logoPickerSearch}
									/>
								</div>
								<select
									class="select-bordered select w-36 select-sm"
									bind:value={logoPickerCountry}
									disabled={logoPickerCountries.length === 0 || logoLibraryReady === false}
								>
									<option value="">{m.livetv_channelEditModal_allCountries()}</option>
									{#each logoPickerCountries as countryOption (countryOption.code)}
										<option value={countryOption.code}>
											{countryOption.name} ({countryOption.logoCount})
										</option>
									{/each}
								</select>
							</div>

							<div
								class="max-h-64 overflow-y-auto rounded-lg bg-base-200/60 p-1"
								onscroll={handleLogoPickerScroll}
							>
								{#if logoPickerLoading}
									<div class="flex items-center justify-center py-8 text-base-content/60">
										<Loader2 class="h-5 w-5 animate-spin" />
									</div>
								{:else if logoPickerError}
									<div class="px-3 py-6 text-center text-sm text-base-content/60">
										{logoPickerError}
									</div>
								{:else if logoPickerItems.length === 0}
									<div class="px-3 py-6 text-center text-sm text-base-content/60">
										{m.livetv_channelEditModal_noLogosMatch()}
									</div>
								{:else}
									<div class="space-y-1">
										{#each logoPickerItems as logoItem (logoItem.path)}
											<button
												type="button"
												class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-base-100"
												onclick={() => applyLogoSelection(logoItem.url)}
											>
												<img
													src={logoItem.url}
													alt=""
													class="h-9 w-9 rounded bg-base-100 object-contain"
												/>
												<div class="min-w-0 flex-1">
													<div class="truncate text-sm font-medium">{logoItem.name}</div>
													<div class="truncate text-xs text-base-content/50">
														{logoItem.country}
													</div>
												</div>
											</button>
										{/each}
										{#if logoPickerLoadingMore}
											<div class="flex items-center justify-center py-2 text-base-content/60">
												<Loader2 class="h-4 w-4 animate-spin" />
											</div>
										{/if}
									</div>
								{/if}
							</div>

							<div class="mt-3 flex items-center justify-between gap-2">
								<p class="text-xs text-base-content/50">
									{m.livetv_channelEditModal_pasteOrPickLogo()}
								</p>
								<div class="flex items-center gap-2">
									{#if customLogo.trim()}
										<button type="button" class="btn btn-ghost btn-xs" onclick={clearCustomLogo}>
											Clear
										</button>
									{/if}
									<button type="button" class="btn btn-ghost btn-xs" onclick={closeLogoPicker}>
										Done
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
				{#if customLogoError}
					<p class="mt-1 text-xs text-error">{customLogoError}</p>
				{:else}
					<p class="mt-1 text-xs text-base-content/50">
						{m.livetv_channelEditModal_customLogoHint()}
					</p>
				{/if}
			</div>

			<div>
				<label class="mb-1 block text-sm text-base-content/70" for="epgId"
					>{m.livetv_channelEditModal_epgId()}</label
				>
				<input
					type="text"
					id="epgId"
					class="input-bordered input input-sm w-full"
					bind:value={epgId}
					placeholder={m.livetv_channelEditModal_epgIdPlaceholder()}
				/>
				<p class="mt-1 text-xs text-base-content/50">Match with external EPG guide data</p>
			</div>

			<div>
				<div class="mb-1 block text-sm text-base-content/70">
					{m.livetv_channelEditModal_epgSourceOverride()}
				</div>
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
						<div class="flex-1 text-sm text-base-content/60">
							{m.livetv_channelEditModal_epgSourceSelected()}
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
				{:else}
					<button
						type="button"
						class="btn w-full justify-start gap-2 btn-outline btn-sm"
						onclick={() => onOpenEpgSourcePicker?.(channel.channelId)}
					>
						<Link class="h-4 w-4" />
						{m.livetv_channelEditModal_selectEpgSource()}
					</button>
				{/if}
				<p class="mt-1 text-xs text-base-content/50">Use EPG from another channel</p>
			</div>
		</div>

		<div class="collapse mt-4 rounded-lg bg-base-200" class:collapse-open={technicalDetailsOpen}>
			<button
				type="button"
				class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 text-sm font-medium"
				onclick={() => (technicalDetailsOpen = !technicalDetailsOpen)}
			>
				<span>{m.livetv_channelEditModal_technicalDetails()}</span>
				<ChevronDown
					class="h-4 w-4 transition-transform {technicalDetailsOpen ? 'rotate-180' : ''}"
				/>
			</button>
			<div class="collapse-content px-3 pb-3">
				<div class="space-y-2 text-sm">
					<div class="flex justify-between gap-4">
						<span class="text-base-content/50">{m.livetv_channelEditModal_originalName()}</span>
						<span class="truncate font-medium">{channel.channel.name}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-base-content/50"
							>{m.livetv_channelEditModal_originalNumber({
								number: channel.channel.number ?? 'None'
							})}</span
						>
						<span class="font-medium">{channel.channel.number || 'None'}</span>
					</div>
					<div class="flex justify-between gap-4">
						<span class="text-base-content/50">{m.livetv_channelEditModal_providerCategory()}</span>
						<span class="truncate font-medium">{channel.channel.categoryTitle || 'None'}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-base-content/50">{m.livetv_channelEditModal_archive()}</span>
						<span class="font-medium">
							{#if channel.channel.stalker?.tvArchive}
								{m.livetv_channelEditModal_archiveYes({
									duration: formatArchiveDuration(channel.channel.stalker.archiveDuration || 0)
								})}
							{:else}
								{m.livetv_channelEditModal_archiveNo()}
							{/if}
						</span>
					</div>
					<div>
						<span class="text-base-content/50">{m.livetv_channelEditModal_streamCommand()}</span>
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
								title={m.livetv_channelEditModal_copy()}
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
						<span class="text-base-content/50">{m.livetv_channelEditModal_accountId()}</span>
						<span class="font-mono text-xs">{channel.accountId}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-base-content/50">{m.livetv_channelEditModal_channelId()}</span>
						<span class="font-mono text-xs">{channel.channelId}</span>
					</div>
				</div>
			</div>
		</div>

		<div class="collapse mt-2 rounded-lg bg-base-200" class:collapse-open={backupsOpen}>
			<button
				type="button"
				class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 text-sm font-medium"
				onclick={() => (backupsOpen = !backupsOpen)}
			>
				<span class="flex items-center gap-2">
					{m.livetv_channelEditModal_backupSources()}
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
						{m.livetv_channelEditModal_noBackups()}
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
										title={m.livetv_channelEditModal_moveUp()}
									>
										<ChevronUp class="h-3 w-3" />
									</button>
									<button
										type="button"
										class="btn btn-ghost btn-xs"
										onclick={() => moveBackupDown(i)}
										disabled={i >= backups.length - 1 || backupSaving}
										title={m.livetv_channelEditModal_moveDown()}
									>
										<ChevronDown class="h-3 w-3" />
									</button>
									<button
										type="button"
										class="btn text-error btn-ghost btn-xs"
										onclick={() => removeBackup(backup.id)}
										title={m.livetv_channelEditModal_remove()}
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
						{m.livetv_channelEditModal_addBackup()}
					</button>
				{/if}
			</div>
		</div>

		<div class="modal-action mt-4">
			{#if onDelete}
				<button class="btn mr-auto btn-outline btn-sm btn-error" onclick={onDelete}>
					Delete
				</button>
			{/if}

			<button class="btn btn-ghost btn-sm" onclick={onClose} disabled={saving}
				>{m.action_cancel()}</button
			>
			<button class="btn btn-sm btn-primary" onclick={handleSubmit} disabled={saving || !isValid}>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				{m.action_save()}
			</button>
		</div>
	</ModalWrapper>
{/if}
