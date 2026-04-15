<script lang="ts">
	import { SvelteMap, SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import { Download, Loader2, Wifi, WifiOff } from 'lucide-svelte';

	import * as m from '$lib/paraglide/messages.js';
	import { SettingsPage, SettingsSection } from '$lib/components/ui/settings';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';
	import type {
		CapturedLogDomain,
		CapturedLogEntry,
		CapturedLogLevel
	} from '$lib/logging/log-capture';
	import { createDynamicSSE } from '$lib/sse';
	import { toasts } from '$lib/stores/toast.svelte';

	interface LogSeedEvent {
		entries: CapturedLogEntry[];
	}

	interface PageData {
		initialEntries: CapturedLogEntry[];
		initialTotal: number;
		initialHasMore: boolean;
		initialPage: number;
		initialPageSize: number;
		availableLevels: CapturedLogLevel[];
		availableDomains: CapturedLogDomain[];
		retentionDays: number;
		defaultRetentionDays: number;
		maxRetentionDays: number;
	}

	interface LogHistoryResponse {
		success: boolean;
		entries?: CapturedLogEntry[];
		total?: number;
		page?: number;
		pageSize?: number;
		hasMore?: boolean;
		error?: string;
	}

	const LIVE_BUFFER_LIMIT = 300;
	const DEFAULT_LEVELS: CapturedLogLevel[] = ['debug', 'info', 'warn', 'error'];

	let { data }: { data: PageData } = $props();
	const availableLevels = $derived(data.availableLevels);
	const availableDomains = $derived(data.availableDomains);
	const defaultRetentionDays = $derived(data.defaultRetentionDays);
	const maxRetentionDays = $derived(data.maxRetentionDays);

	let entries = $state<CapturedLogEntry[]>([]);
	let historyLoading = $state(false);
	let historyError = $state('');
	let historyPage = $state(1);
	let historyPageSize = 100;
	let historyTotal = $state(0);
	let historyHasMore = $state(false);
	let historyPagesLoaded = new SvelteSet<number>();

	let search = $state('');
	let supportId = $state('');
	let requestId = $state('');
	let correlationId = $state('');
	let selectedDomain = $state<CapturedLogDomain | 'all'>('all');
	let levels = new SvelteSet<CapturedLogLevel>(DEFAULT_LEVELS);
	let from = $state('');
	let to = $state('');

	let retentionDays = $state(7);
	let retentionSaving = $state(false);

	let livePaused = $state(false);
	let autoFollowEnabled = $state(true);
	let listViewport = $state<HTMLDivElement | null>(null);
	let isNearTop = $state(true);
	let pendingLiveEntries = $state<CapturedLogEntry[]>([]);

	let selectedEntryId = $state<string | null>(null);

	let historyAbortController: AbortController | null = null;
	let historyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastLoadedFilterKey = '';
	let initialized = false;

	$effect(() => {
		if (initialized) return;
		initialized = true;
		entries = structuredClone(data.initialEntries);
		historyPage = data.initialPage;
		historyPageSize = data.initialPageSize;
		historyTotal = data.initialTotal;
		historyHasMore = data.initialHasMore;
		historyPagesLoaded.clear();
		if (data.initialEntries.length > 0) {
			historyPagesLoaded.add(data.initialPage);
		}
		retentionDays = data.retentionDays;
		selectedEntryId = data.initialEntries[0]?.id ?? null;
		lastLoadedFilterKey = buildFilterKey();
	});

	$effect(() => {
		if (!initialized) return;
		if (retentionSaving) return;
		retentionDays = data.retentionDays;
	});

	const selectedEntry = $derived.by(
		() => entries.find((entry) => entry.id === selectedEntryId) ?? entries[0] ?? null
	);

	const pendingLiveCount = $derived(pendingLiveEntries.length);
	const showJumpToLatest = $derived.by(
		() => pendingLiveCount > 0 || !isNearTop || !autoFollowEnabled || livePaused
	);
	const liveStatusLabel = $derived.by(() => {
		if (livePaused) return 'Live paused';
		if (autoFollowEnabled && isNearTop) return 'Following newest entries';
		if (pendingLiveCount > 0) return 'Browsing while new entries queue';
		return 'Browsing current results';
	});

	const hasActiveFilters = $derived.by(
		() =>
			search.trim().length > 0 ||
			supportId.trim().length > 0 ||
			requestId.trim().length > 0 ||
			correlationId.trim().length > 0 ||
			selectedDomain !== 'all' ||
			levels.size !== availableLevels.length ||
			from.length > 0 ||
			to.length > 0
	);

	function toDateTimeLocalValue(date: Date): string {
		const pad = (value: number) => String(value).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	function buildQueryParams(page?: number): SvelteURLSearchParams {
		const params = new SvelteURLSearchParams();
		params.set('pageSize', String(historyPageSize));
		params.set('levels', [...levels].join(','));

		if (page) {
			params.set('page', String(page));
		}

		if (selectedDomain !== 'all') {
			params.set('logDomain', selectedDomain);
		}

		if (search.trim()) {
			params.set('search', search.trim());
		}

		if (supportId.trim()) {
			params.set('supportId', supportId.trim());
		}

		if (requestId.trim()) {
			params.set('requestId', requestId.trim());
		}

		if (correlationId.trim()) {
			params.set('correlationId', correlationId.trim());
		}

		if (from) {
			params.set('from', new Date(from).toISOString());
		}

		if (to) {
			params.set('to', new Date(to).toISOString());
		}

		return params;
	}

	function buildFilterKey(): string {
		return [
			[...levels].sort().join(','),
			selectedDomain,
			search.trim(),
			supportId.trim(),
			requestId.trim(),
			correlationId.trim(),
			from || 'none',
			to || 'none'
		].join('||');
	}

	function buildDownloadUrl(): string {
		const params = buildQueryParams();
		params.set('limit', '5000');
		params.set('format', 'jsonl');
		return `/api/settings/logs/download?${params.toString()}`;
	}

	function buildLiveUrl(): string {
		const params = buildQueryParams();
		params.set('limit', String(LIVE_BUFFER_LIMIT));
		return `/api/settings/logs/stream?${params.toString()}`;
	}

	function dedupeAndSort(items: CapturedLogEntry[], limit?: number): CapturedLogEntry[] {
		const byId = new SvelteMap<string, CapturedLogEntry>();

		for (const item of items) {
			if (!byId.has(item.id)) {
				byId.set(item.id, item);
			}
		}

		const sorted = [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
		return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
	}

	function selectEntry(entry: CapturedLogEntry): void {
		selectedEntryId = entry.id;
	}

	function handleListScroll(): void {
		if (!listViewport) return;
		isNearTop = listViewport.scrollTop < 24;
	}

	async function scrollToLatest(): Promise<void> {
		await Promise.resolve();
		listViewport?.scrollTo({ top: 0, behavior: 'smooth' });
		isNearTop = true;
	}

	function toggleLevel(level: CapturedLogLevel): void {
		if (levels.has(level)) {
			if (levels.size <= 1) return;
			levels.delete(level);
			return;
		}

		levels.add(level);
	}

	function resetFilters(): void {
		search = '';
		supportId = '';
		requestId = '';
		correlationId = '';
		selectedDomain = 'all';
		levels.clear();
		for (const level of DEFAULT_LEVELS) {
			levels.add(level);
		}
		from = '';
		to = '';
	}

	function setQuickRange(hours: number): void {
		const nextTo = new Date();
		to = toDateTimeLocalValue(nextTo);
		from = toDateTimeLocalValue(new Date(nextTo.getTime() - hours * 60 * 60 * 1000));
	}

	function replaceEntries(nextEntries: CapturedLogEntry[]): void {
		entries = dedupeAndSort(nextEntries);
		if (!selectedEntryId && entries[0]) {
			selectedEntryId = entries[0].id;
		}
	}

	function queueLiveEntry(entry: CapturedLogEntry): void {
		pendingLiveEntries = dedupeAndSort([entry, ...pendingLiveEntries], LIVE_BUFFER_LIMIT);
	}

	function flushPendingLiveEntries(options: { scroll?: boolean } = {}): void {
		if (pendingLiveEntries.length === 0) {
			if (options.scroll) {
				void scrollToLatest();
			}
			return;
		}

		replaceEntries([...pendingLiveEntries, ...entries]);
		pendingLiveEntries = [];

		if (options.scroll) {
			void scrollToLatest();
		}
	}

	function mergeLiveSeed(seedEntries: CapturedLogEntry[]): void {
		replaceEntries([...seedEntries, ...entries]);
	}

	function mergeLiveEntry(entry: CapturedLogEntry): void {
		if (livePaused || !autoFollowEnabled || !isNearTop) {
			queueLiveEntry(entry);
			return;
		}

		replaceEntries([entry, ...entries]);
		void scrollToLatest();
	}

	const sse = createDynamicSSE<{
		'logs:seed': LogSeedEvent;
		'log:entry': CapturedLogEntry;
	}>(
		() => buildLiveUrl(),
		{
			'logs:seed': ({ entries: seedEntries }) => {
				mergeLiveSeed(seedEntries);
			},
			'log:entry': (entry) => {
				mergeLiveEntry(entry);
			}
		},
		{
			heartbeatInterval: 30000
		}
	);

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	$effect(() => {
		if (livePaused) return;
		if (!autoFollowEnabled) return;
		if (!isNearTop) return;
		if (pendingLiveEntries.length === 0) return;

		flushPendingLiveEntries({ scroll: true });
	});

	async function loadHistoryPage(
		page: number,
		mode: 'replace' | 'append' = 'replace'
	): Promise<void> {
		historyAbortController?.abort();
		const controller = new AbortController();
		historyAbortController = controller;

		historyLoading = true;
		historyError = '';

		try {
			const response = await fetch(
				`/api/settings/logs/history?${buildQueryParams(page).toString()}`,
				{
					signal: controller.signal
				}
			);

			const payload = (await response.json().catch(() => null)) as LogHistoryResponse | null;
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error ?? 'Failed to load log history');
			}

			const nextEntries = payload.entries ?? [];
			entries =
				mode === 'append'
					? dedupeAndSort([...entries, ...nextEntries])
					: dedupeAndSort(nextEntries);

			historyTotal = payload.total ?? 0;
			historyPage = payload.page ?? page;
			historyHasMore = payload.hasMore ?? false;
			if (mode === 'append') {
				historyPagesLoaded.add(historyPage);
			} else {
				historyPagesLoaded.clear();
				historyPagesLoaded.add(historyPage);
			}
			lastLoadedFilterKey = buildFilterKey();
			pendingLiveEntries = [];

			if (entries[0]) {
				selectedEntryId = entries.some((entry) => entry.id === selectedEntryId)
					? selectedEntryId
					: entries[0].id;
			} else {
				selectedEntryId = null;
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}

			historyError = error instanceof Error ? error.message : 'Failed to load log history';
		} finally {
			if (historyAbortController === controller) {
				historyAbortController = null;
			}
			historyLoading = false;
		}
	}

	function refreshCurrentView(): void {
		void loadHistoryPage(1, 'replace');
	}

	function jumpToLatest(): void {
		livePaused = false;
		autoFollowEnabled = true;
		flushPendingLiveEntries({ scroll: true });
	}

	function loadOlderHistory(): void {
		if (!historyHasMore || historyLoading) return;
		void loadHistoryPage(historyPage + 1, 'append');
	}

	$effect(() => {
		if (!initialized) return;
		const filterKey = buildFilterKey();
		if (filterKey === lastLoadedFilterKey) {
			return;
		}

		if (historyDebounceTimer) {
			clearTimeout(historyDebounceTimer);
		}

		historyDebounceTimer = setTimeout(() => {
			void loadHistoryPage(1, 'replace');
		}, 250);

		return () => {
			if (historyDebounceTimer) {
				clearTimeout(historyDebounceTimer);
				historyDebounceTimer = null;
			}
		};
	});

	async function downloadHistoryLogs(): Promise<void> {
		try {
			const response = await fetch(buildDownloadUrl());
			if (!response.ok) {
				throw new Error('Failed to download log history');
			}

			const blob = await response.blob();
			const href = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = href;
			link.download = 'cinephage-logs-history.jsonl';
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(href);
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to download log history');
		}
	}

	async function saveRetentionDays(): Promise<void> {
		retentionSaving = true;
		try {
			const response = await fetch('/api/settings/logs/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ retentionDays })
			});

			const payload = await response.json().catch(() => null);
			if (!response.ok || !payload?.success) {
				throw new Error(payload?.error ?? 'Failed to save log retention');
			}

			retentionDays = payload.retentionDays ?? retentionDays;
			toasts.success(`Log retention updated to ${retentionDays} days`);
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : 'Failed to save log retention');
		} finally {
			retentionSaving = false;
		}
	}

	function formatTimestamp(value: string): string {
		return new Intl.DateTimeFormat(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3,
			hour12: false
		}).format(new Date(value));
	}

	function formatFullTimestamp(value: string): string {
		return new Intl.DateTimeFormat(undefined, {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3,
			hour12: false
		}).format(new Date(value));
	}

	function levelColor(level: CapturedLogLevel): string {
		switch (level) {
			case 'debug':
				return 'text-base-content/50';
			case 'info':
				return 'text-info';
			case 'warn':
				return 'text-warning';
			case 'error':
				return 'text-error';
		}
	}

	function levelBadgeClass(level: CapturedLogLevel, active: boolean): string {
		if (!active) return 'border-base-300 bg-base-200 text-base-content/45';

		switch (level) {
			case 'debug':
				return 'border-base-content/20 bg-base-content/10 text-base-content/70';
			case 'info':
				return 'border-info/30 bg-info/10 text-info';
			case 'warn':
				return 'border-warning/30 bg-warning/10 text-warning';
			case 'error':
				return 'border-error/30 bg-error/10 text-error';
		}
	}

	function getSource(entry: CapturedLogEntry): string {
		const parts = [entry.logDomain, entry.component, entry.service, entry.module].filter(
			(value): value is string => typeof value === 'string' && value.length > 0
		);
		const deduped = parts.filter((value, index) => index === 0 || value !== parts[index - 1]);
		return deduped.length > 0 ? deduped.join('/') : 'unscoped';
	}

	function formatDetails(entry: CapturedLogEntry): string {
		const obj: Record<string, unknown> = {};

		if (entry.method || entry.path || entry.requestId || entry.supportId || entry.correlationId) {
			const req: Record<string, unknown> = {};
			if (entry.method) req.method = entry.method;
			if (entry.path) req.path = entry.path;
			if (entry.requestId) req.requestId = entry.requestId;
			if (entry.supportId) req.supportId = entry.supportId;
			if (entry.correlationId) req.correlationId = entry.correlationId;
			obj.request = req;
		}

		if (entry.data) obj.data = entry.data;
		if (entry.err) obj.err = entry.err;

		return JSON.stringify(obj, null, 2);
	}

	async function copyText(value: string, label: string): Promise<void> {
		if (!value || !navigator.clipboard) return;

		try {
			await navigator.clipboard.writeText(value);
			toasts.success(`${label} copied`);
		} catch {
			toasts.error(`Failed to copy ${label.toLowerCase()}`);
		}
	}
</script>

<svelte:head>
	<title>{m.settings_logs_pageTitle()}</title>
</svelte:head>

<SettingsPage title={m.settings_logs_heading()} subtitle={m.settings_logs_subtitle()}>
	{#snippet actions()}
		<span
			class:badge-success={sse.isConnected}
			class:badge-warning={!sse.isConnected}
			class="badge gap-1.5 text-xs"
		>
			{#if sse.isConnected}
				<Wifi class="h-3 w-3" />
				Live connected
			{:else}
				<WifiOff class="h-3 w-3" />
				Live reconnecting
			{/if}
		</span>
		<span class="badge badge-ghost text-xs">{historyTotal} matches</span>
		{#if pendingLiveCount > 0}
			<button
				class="badge cursor-pointer badge-outline text-xs badge-warning"
				onclick={() => flushPendingLiveEntries({ scroll: true })}
			>
				{pendingLiveCount} new entries
			</button>
		{/if}
	{/snippet}

	<SettingsSection
		title="Unified Live Logs"
		description="One live log surface that stays current while still letting you search and load older persisted history into the same stream."
	>
		<div class="border border-base-300 bg-base-100">
			<div
				class="sticky top-0 z-10 border-b border-base-300 bg-base-100/95 px-4 py-4 backdrop-blur"
			>
				<div class="grid gap-3 xl:grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,1fr))]">
					<input
						type="text"
						class="input-bordered input input-sm w-full"
						bind:value={search}
						placeholder="Search message, source, path, payload, or error text"
					/>
					<select class="select-bordered select w-full select-sm" bind:value={selectedDomain}>
						<option value="all">All domains</option>
						{#each availableDomains as domain (domain)}
							<option value={domain}>{domain}</option>
						{/each}
					</select>
					<input
						type="text"
						class="input-bordered input input-sm w-full font-mono"
						bind:value={supportId}
						placeholder="Issue ID"
					/>
					<input
						type="text"
						class="input-bordered input input-sm w-full font-mono"
						bind:value={requestId}
						placeholder="Request ID"
					/>
					<input
						type="text"
						class="input-bordered input input-sm w-full font-mono"
						bind:value={correlationId}
						placeholder="Correlation ID"
					/>
				</div>

				<div class="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
					<div class="flex flex-wrap items-center gap-2">
						{#each availableLevels as level (level)}
							<button
								class={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.18em] uppercase transition ${levelBadgeClass(level, levels.has(level))}`}
								onclick={() => toggleLevel(level)}
							>
								{level}
							</button>
						{/each}
						<label class="label cursor-pointer gap-2 px-1 py-0">
							<input type="checkbox" class="toggle toggle-xs" bind:checked={livePaused} />
							<span class="label-text text-xs">Pause</span>
						</label>
						<label class="label cursor-pointer gap-2 px-1 py-0">
							<input type="checkbox" class="toggle toggle-xs" bind:checked={autoFollowEnabled} />
							<span class="label-text text-xs">Auto-follow</span>
						</label>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<button class="btn btn-ghost btn-xs" onclick={() => setQuickRange(1)}>1h</button>
						<button class="btn btn-ghost btn-xs" onclick={() => setQuickRange(6)}>6h</button>
						<button class="btn btn-ghost btn-xs" onclick={() => setQuickRange(24)}>24h</button>
						<button class="btn btn-ghost btn-xs" onclick={() => setQuickRange(168)}>7d</button>
						<input
							type="datetime-local"
							class="input-bordered input input-sm w-full sm:w-44"
							bind:value={from}
						/>
						<input
							type="datetime-local"
							class="input-bordered input input-sm w-full sm:w-44"
							bind:value={to}
						/>
						<button class="btn text-xs btn-ghost btn-sm" onclick={refreshCurrentView}>
							{#if historyLoading}
								<Loader2 class="h-3.5 w-3.5 animate-spin" />
							{/if}
							Refresh
						</button>
						<button class="btn text-xs btn-ghost btn-sm" onclick={downloadHistoryLogs}>
							<Download class="h-3.5 w-3.5" />
							Export
						</button>
						{#if hasActiveFilters}
							<button class="btn text-xs btn-ghost btn-sm" onclick={resetFilters}>Clear</button>
						{/if}
					</div>
				</div>

				<div
					class="mt-3 flex flex-col gap-2 border-t border-base-300 pt-3 text-xs text-base-content/60 xl:flex-row xl:items-center xl:justify-between"
				>
					<div class="flex flex-wrap items-center gap-3">
						<span>{entries.length} visible rows</span>
						<span>{historyTotal} persisted matches</span>
						<span
							>{historyPagesLoaded.size} page{historyPagesLoaded.size === 1 ? '' : 's'} loaded</span
						>
						<span>{liveStatusLabel}</span>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<input
							id="retention-days"
							type="number"
							min="1"
							max={maxRetentionDays}
							class="input-bordered input input-xs w-24"
							bind:value={retentionDays}
						/>
						<span>Retention days</span>
						<button
							class="btn btn-ghost btn-xs"
							onclick={() => (retentionDays = defaultRetentionDays)}
							disabled={retentionSaving}
						>
							Default
						</button>
						<button
							class="btn btn-xs btn-primary"
							onclick={saveRetentionDays}
							disabled={retentionSaving}
						>
							{#if retentionSaving}
								<Loader2 class="h-3 w-3 animate-spin" />
							{/if}
							Save
						</button>
					</div>
				</div>
			</div>

			{#if historyError}
				<div class="border-b border-base-300 px-4 py-4 text-sm text-error">{historyError}</div>
			{/if}

			<div class="max-h-[42rem] overflow-auto" bind:this={listViewport} onscroll={handleListScroll}>
				{#if historyLoading && entries.length === 0}
					<div class="flex items-center gap-2 px-4 py-4 text-sm text-base-content/60">
						<Loader2 class="h-4 w-4 animate-spin" />
						Loading logs
					</div>
				{:else if entries.length === 0}
					<div class="px-4 py-4 text-sm text-base-content/60">
						No logs matched the current filters. Clear filters or wait for new matching entries.
					</div>
				{:else}
					<table class="table-pin-rows table table-sm">
						<thead>
							<tr
								class="bg-base-200/90 text-[11px] tracking-[0.18em] text-base-content/55 uppercase"
							>
								<th class="w-28">Time</th>
								<th class="w-18">Level</th>
								<th class="w-52">Source</th>
								<th class="w-32">Issue ID</th>
								<th>Message</th>
							</tr>
						</thead>
						<tbody>
							{#each entries as entry (entry.id)}
								<tr
									class={[
										'cursor-pointer border-b border-base-200/70 align-top transition-colors',
										selectedEntry?.id === entry.id ? 'bg-primary/8' : 'hover:bg-base-200/60'
									]}
									onclick={() => selectEntry(entry)}
								>
									<td class="font-mono text-xs text-base-content/70"
										>{formatTimestamp(entry.timestamp)}</td
									>
									<td class={`font-mono text-xs uppercase ${levelColor(entry.level)}`}
										>{entry.level}</td
									>
									<td class="max-w-52 truncate font-mono text-xs text-base-content/60"
										>{getSource(entry)}</td
									>
									<td class="font-mono text-xs text-base-content/55">{entry.supportId ?? '-'}</td>
									<td class="max-w-[48rem] text-sm break-words whitespace-normal">{entry.msg}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<div class="border-t border-base-300 px-4 py-3">
				<div class="flex flex-wrap items-center justify-between gap-3 text-xs text-base-content/60">
					<div class="flex flex-wrap items-center gap-3">
						{#if pendingLiveCount > 0}
							<span>{pendingLiveCount} live entries queued</span>
						{/if}
						{#if historyHasMore}
							<span>Older persisted results are available</span>
						{/if}
					</div>
					<div class="flex flex-wrap items-center gap-2">
						{#if showJumpToLatest}
							<button class="btn btn-xs btn-primary" onclick={jumpToLatest}>
								Jump to latest
							</button>
						{/if}
						<button
							class="btn btn-ghost btn-xs"
							onclick={loadOlderHistory}
							disabled={historyLoading || !historyHasMore}
						>
							{#if historyLoading && historyHasMore}
								<Loader2 class="h-3 w-3 animate-spin" />
							{/if}
							Load older
						</button>
					</div>
				</div>
			</div>

			<div class="border-t border-base-300 bg-base-200/20 px-4 py-4">
				<div class="mb-3 flex items-center justify-between gap-3">
					<div>
						<p class="text-xs tracking-[0.18em] text-base-content/55 uppercase">Inspector</p>
						<p class="mt-1 text-xs text-base-content/60">
							Selected row details stay below the unified stream.
						</p>
					</div>
				</div>

				{#if selectedEntry}
					<div class="space-y-4">
						<div class="space-y-2">
							<div class="flex flex-wrap items-center gap-2">
								<span class={`font-mono text-xs uppercase ${levelColor(selectedEntry.level)}`}>
									{selectedEntry.level}
								</span>
								<span class="font-mono text-xs text-base-content/55">
									{formatFullTimestamp(selectedEntry.timestamp)}
								</span>
							</div>
							<p class="text-sm leading-6 break-words">{selectedEntry.msg}</p>
							<p class="font-mono text-xs text-base-content/60">{getSource(selectedEntry)}</p>
						</div>

						<div class="flex flex-wrap gap-2">
							{#if selectedEntry.method && selectedEntry.path}
								<button
									class="rounded-md bg-base-300 px-2 py-1 font-mono text-xs text-base-content/70"
									onclick={() =>
										copyText(`${selectedEntry.method} ${selectedEntry.path}`, 'Request path')}
								>
									{selectedEntry.method}
									{selectedEntry.path}
								</button>
							{/if}
							{#if selectedEntry.requestId}
								<button
									class="rounded-md bg-base-300 px-2 py-1 font-mono text-xs text-base-content/70"
									onclick={() => copyText(selectedEntry.requestId ?? '', 'Request ID')}
								>
									req:{selectedEntry.requestId}
								</button>
							{/if}
							{#if selectedEntry.correlationId}
								<button
									class="rounded-md bg-base-300 px-2 py-1 font-mono text-xs text-base-content/70"
									onclick={() => copyText(selectedEntry.correlationId ?? '', 'Correlation ID')}
								>
									corr:{selectedEntry.correlationId}
								</button>
							{/if}
							{#if selectedEntry.supportId}
								<button
									class="rounded-md bg-base-300 px-2 py-1 font-mono text-xs text-base-content/70"
									onclick={() => copyText(selectedEntry.supportId ?? '', 'Issue ID')}
								>
									issue:{selectedEntry.supportId}
								</button>
							{/if}
						</div>

						<div>
							<div class="mb-2 flex items-center justify-between">
								<p class="text-xs tracking-[0.18em] text-base-content/55 uppercase">Payload</p>
								<button
									class="btn btn-ghost btn-xs"
									onclick={() => copyText(formatDetails(selectedEntry), 'Payload')}
								>
									Copy
								</button>
							</div>
							<pre
								class="max-h-[22rem] overflow-auto bg-base-300/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-base-content/80">{formatDetails(
									selectedEntry
								)}</pre>
						</div>
					</div>
				{:else}
					<div class="text-sm text-base-content/60">
						Select a row to inspect request IDs, payload data, and structured errors.
					</div>
				{/if}
			</div>
		</div>
	</SettingsSection>
</SettingsPage>
