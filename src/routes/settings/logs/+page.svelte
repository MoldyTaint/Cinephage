<script lang="ts">
	import { SvelteMap, SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		Download,
		Loader2,
		Search,
		CalendarSync,
		CalendarClock,

		X
	} from 'lucide-svelte';

	import * as m from '$lib/paraglide/messages.js';
	import { SettingsPage } from '$lib/components/ui/settings';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';
	import type {
		CapturedLogDomain,
		CapturedLogEntry,
		CapturedLogLevel
	} from '$lib/logging/log-capture';
	import { createDynamicSSE } from '$lib/sse';
	import { toasts } from '$lib/stores/toast.svelte';
	import { updateLogSettings, getLogHistory } from '$lib/api/settings.js';
	import { apiGetStream } from '$lib/api';

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
	let historyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastLoadedFilterKey = '';
	let initialized = false;

	let search = $state('');
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
	let activeQuickRange = $state<number | null>(null);
	let mobileInspectorOpen = $state(false);
	let mobileDateOpen = $state(false);
	let mobileDateManual = $state(false);

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
		selectedEntryId = null;
		lastLoadedFilterKey = buildFilterKey();
	});

	$effect(() => {
		if (!initialized) return;
		if (retentionSaving) return;
		retentionDays = data.retentionDays;
	});

	const selectedEntry = $derived.by(
		() => entries.find((entry) => entry.id === selectedEntryId) ?? null
	);

	const pendingLiveCount = $derived(pendingLiveEntries.length);
	const showJumpToLatest = $derived.by(
		() => pendingLiveCount > 0 || !isNearTop || !autoFollowEnabled || livePaused
	);
	const activeFilterLabel = $derived.by(() => {
		const parts: string[] = [];
		if (levels.size === 1) {
			const [level] = [...levels];
			parts.push(`${level} only`);
		} else if (levels.size < availableLevels.length) {
			parts.push(`${levels.size} levels`);
		}
		if (selectedDomain !== 'all') parts.push(selectedDomain);
		if (search.trim()) parts.push(`"${search.trim()}"`);
		return parts.length > 0 ? `Filtered: ${parts.join(', ')}` : '';
	});

	const liveStatusLabel = $derived.by(() => {
		if (livePaused) return 'Live paused';
		if (autoFollowEnabled && isNearTop) return 'Following newest entries';
		if (pendingLiveCount > 0) return 'New entries queuing';
		return activeFilterLabel;
	});

	const hasActiveFilters = $derived.by(
		() =>
			search.trim().length > 0 ||
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

		if (page) params.set('page', String(page));
		if (selectedDomain !== 'all') params.set('logDomain', selectedDomain);
		if (search.trim()) params.set('search', search.trim());
		if (from) params.set('from', new Date(from).toISOString());
		if (to) params.set('to', new Date(to).toISOString());

		return params;
	}

	function buildFilterKey(): string {
		return [
			[...levels].sort().join(','),
			selectedDomain,
			search.trim(),
			from || 'none',
			to || 'none'
		].join('||');
	}

	function buildLiveUrl(): string {
		const params = buildQueryParams();
		params.set('limit', String(LIVE_BUFFER_LIMIT));
		return `/api/settings/logs/stream?${params.toString()}`;
	}

	function dedupeAndSort(items: CapturedLogEntry[], limit?: number): CapturedLogEntry[] {
		const byId = new SvelteMap<string, CapturedLogEntry>();
		for (const item of items) {
			if (!byId.has(item.id)) byId.set(item.id, item);
		}
		const sorted = [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
		return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
	}

	function handleRowClick(entry: CapturedLogEntry): void {
		if (selectedEntryId === entry.id) {
			selectedEntryId = null;
			mobileInspectorOpen = false;
		} else {
			selectedEntryId = entry.id;
			mobileInspectorOpen = true;
		}
	}

	function closeInspector(): void {
		selectedEntryId = null;
		mobileInspectorOpen = false;
	}

	function handleListScroll(): void {
		if (!listViewport) return;
		isNearTop = listViewport.scrollTop < 24;
		const nearBottom =
			listViewport.scrollHeight - listViewport.scrollTop - listViewport.clientHeight < 120;
		if (nearBottom && historyHasMore && !historyLoading) {
			loadOlderHistory();
		}
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
		selectedDomain = 'all';
		levels.clear();
		for (const level of DEFAULT_LEVELS) levels.add(level);
		from = '';
		to = '';
		activeQuickRange = null;
		if (!mobileDateManual) mobileDateOpen = false;
	}

	function setQuickRange(hours: number): void {
		const nextTo = new Date();
		to = toDateTimeLocalValue(nextTo);
		from = toDateTimeLocalValue(new Date(nextTo.getTime() - hours * 60 * 60 * 1000));
		activeQuickRange = hours;
		mobileDateOpen = true;
		mobileDateManual = false;
	}

	function replaceEntries(nextEntries: CapturedLogEntry[]): void {
		entries = dedupeAndSort(nextEntries);
	}

	function queueLiveEntry(entry: CapturedLogEntry): void {
		pendingLiveEntries = dedupeAndSort([entry, ...pendingLiveEntries], LIVE_BUFFER_LIMIT);
	}

	function flushPendingLiveEntries(options: { scroll?: boolean } = {}): void {
		if (pendingLiveEntries.length === 0) {
			if (options.scroll) void scrollToLatest();
			return;
		}
		replaceEntries([...pendingLiveEntries, ...entries]);
		pendingLiveEntries = [];
		if (options.scroll) void scrollToLatest();
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
			'logs:seed': ({ entries: seedEntries }) => mergeLiveSeed(seedEntries),
			'log:entry': (entry) => mergeLiveEntry(entry)
		},
		{ heartbeatInterval: 30000 }
	);

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => layoutState.clearMobileSseStatus();
	});

	$effect(() => {
		if (livePaused || !autoFollowEnabled || !isNearTop || pendingLiveEntries.length === 0) return;
		flushPendingLiveEntries({ scroll: true });
	});

	async function loadHistoryPage(
		page: number,
		mode: 'replace' | 'append' = 'replace'
	): Promise<void> {
		historyLoading = true;
		historyError = '';

		try {
			const sp = buildQueryParams(page);
			const queryParams: Record<string, string> = {};
			for (const [key, value] of sp) queryParams[key] = value;

			const payload = (await getLogHistory(queryParams)) as LogHistoryResponse;
			if (!payload.success) throw new Error(payload.error ?? 'Failed to load log history');

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

			if (!entries.some((e) => e.id === selectedEntryId)) {
				selectedEntryId = null;
			}
		} catch (error) {
			historyError = error instanceof Error ? error.message : 'Failed to load log history';
		} finally {
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
		if (filterKey === lastLoadedFilterKey) return;

		if (historyDebounceTimer) clearTimeout(historyDebounceTimer);

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
			const params: Record<string, string> = {};
			const queryParams = buildQueryParams();
			queryParams.set('limit', '5000');
			queryParams.set('format', 'jsonl');
			queryParams.forEach((value, key) => (params[key] = value));
			const response = await apiGetStream('/api/settings/logs/download', params);

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
			const payload = await updateLogSettings(retentionDays);
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

	function rowAccentClass(level: CapturedLogLevel): string {
		switch (level) {
			case 'error':
				return 'border-l-[3px] border-l-error';
			case 'warn':
				return 'border-l-[3px] border-l-warning';
			default:
				return 'border-l-[3px] border-l-transparent';
		}
	}

	function getSource(entry: CapturedLogEntry): string {
		const parts = [entry.logDomain, entry.component, entry.service, entry.module].filter(
			(v): v is string => typeof v === 'string' && v.length > 0
		);
		const deduped = parts.filter((v, i) => i === 0 || v !== parts[i - 1]);
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

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && selectedEntryId) closeInspector();
	}}
/>

{#snippet inspectorBody(entry: CapturedLogEntry)}
	<div class="space-y-4 p-4">
		<div class="space-y-2">
			<div class="flex flex-wrap items-center gap-2">
				<span
					class={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest uppercase ${levelBadgeClass(entry.level, true)}`}
				>
					{entry.level}
				</span>
				<span class="font-mono text-xs text-base-content/55">
					{formatFullTimestamp(entry.timestamp)}
				</span>
			</div>
			<p class="text-sm leading-6 wrap-break-word">{entry.msg}</p>
			<p class="font-mono text-xs text-base-content/60">{getSource(entry)}</p>
		</div>

		{#if entry.method || entry.path || entry.requestId || entry.correlationId || entry.supportId}
			<div>
				<p class="mb-2 text-[10px] font-medium tracking-widest text-base-content/50 uppercase">
					Identifiers
				</p>
				<div class="flex flex-wrap gap-2">
					{#if entry.method && entry.path}
						<button
							class="rounded bg-base-300 px-2 py-1 font-mono text-xs text-base-content/70 transition hover:bg-base-300/80"
							onclick={() => copyText(`${entry.method} ${entry.path}`, 'Request path')}
						>
							{entry.method}
							{entry.path}
						</button>
					{/if}
					{#if entry.requestId}
						<button
							class="rounded bg-base-300 px-2 py-1 font-mono text-xs text-base-content/70 transition hover:bg-base-300/80"
							onclick={() => copyText(entry.requestId ?? '', 'Request ID')}
						>
							req:{entry.requestId}
						</button>
					{/if}
					{#if entry.correlationId}
						<button
							class="rounded bg-base-300 px-2 py-1 font-mono text-xs text-base-content/70 transition hover:bg-base-300/80"
							onclick={() => copyText(entry.correlationId ?? '', 'Correlation ID')}
						>
							corr:{entry.correlationId}
						</button>
					{/if}
					{#if entry.supportId}
						<button
							class="rounded bg-base-300 px-2 py-1 font-mono text-xs text-base-content/70 transition hover:bg-base-300/80"
							onclick={() => copyText(entry.supportId ?? '', 'Issue ID')}
						>
							issue:{entry.supportId}
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-[10px] font-medium tracking-widest text-base-content/50 uppercase">
					Payload
				</p>
				<button
					class="btn btn-ghost btn-xs"
					onclick={() => copyText(formatDetails(entry), 'Payload')}
				>
					Copy
				</button>
			</div>
			<pre
				class="max-h-88 overflow-auto bg-base-300/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-base-content/80">{formatDetails(
					entry
				)}</pre>
		</div>
	</div>
{/snippet}

<SettingsPage title={m.settings_logs_heading()} subtitle={m.settings_logs_subtitle()}>
	{#snippet actions()}

	{/snippet}

	<!-- Log viewer card -->
	<div class="flex flex-col rounded-xl border border-base-300 bg-base-200">
		<!-- Toolbar (sticky) -->
		<div class="sticky top-0 z-10 border-b border-base-300 bg-base-200/95 backdrop-blur">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-3">
				<!-- Search -->
				<div class="relative min-w-0 flex-1" style="min-width: 180px;">
					<Search
						class="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-base-content/40"
					/>
					<input
						type="text"
						class="input input-sm w-full rounded-full border-base-content/20 bg-base-200/60 pr-4 pl-9 transition-all duration-200 placeholder:text-base-content/40 hover:bg-base-200 focus:border-primary/50 focus:bg-base-200 focus:ring-1 focus:ring-primary/20 focus:outline-none"
						bind:value={search}
						placeholder="Search message, source, path, payload…"
					/>
				</div>

				<!-- Domain -->
				<div class="w-full sm:w-48">
					<select
						class="select w-full border-base-content/20 select-sm transition-all duration-200 hover:bg-base-200 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none"
						bind:value={selectedDomain}
					>
						<option value="all">All domains</option>
						{#each availableDomains as domain (domain)}
							<option value={domain}>{domain}</option>
						{/each}
					</select>
				</div>

				<span class="h-5 w-px shrink-0 bg-base-300"></span>

				<!-- Level pills -->
				<div class="flex items-center gap-1">
					{#each availableLevels as level (level)}
						<button
							class={`rounded border px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.15em] uppercase transition ${levelBadgeClass(level, levels.has(level))}`}
							onclick={() => toggleLevel(level)}
						>
							{level}
						</button>
					{/each}
				</div>

				<span class="h-5 w-px shrink-0 bg-base-300"></span>

				<!-- Quick date range + mobile custom toggle -->
				<div class="flex items-center gap-1">
					{#each [{ label: '1h', hours: 1 }, { label: '6h', hours: 6 }, { label: '24h', hours: 24 }, { label: '7d', hours: 168 }] as range (range.label)}
						<button
							class="btn font-mono btn-xs {activeQuickRange === range.hours
								? 'btn-primary'
								: 'btn-ghost'}"
							onclick={() => setQuickRange(range.hours)}
						>
							{range.label}
						</button>
					{/each}
					<!-- Mobile: toggle custom date inputs -->
					<button
						class="btn btn-xs sm:hidden {mobileDateOpen || from || to
							? 'btn-primary'
							: 'btn-ghost'}"
						onclick={() => {
							mobileDateOpen = !mobileDateOpen;
							mobileDateManual = mobileDateOpen;
						}}
						aria-label="Custom date range"
					>
						<CalendarClock class="h-3 w-3" />
					</button>
				</div>

				<!-- Custom from/to inputs: desktop only (inline) -->
				<div class="hidden items-center gap-2 sm:flex">
					<span class="h-5 w-px shrink-0 bg-base-300"></span>
					<input
						type="datetime-local"
						class="input input-sm w-44 rounded-full border-base-content/20 bg-base-200/60 px-3 text-xs transition-all hover:bg-base-200 focus:border-primary/50 focus:outline-none"
						bind:value={from}
						title="From"
						oninput={() => (activeQuickRange = null)}
					/>
					<input
						type="datetime-local"
						class="input input-sm w-44 rounded-full border-base-content/20 bg-base-200/60 px-3 text-xs transition-all hover:bg-base-200 focus:border-primary/50 focus:outline-none"
						bind:value={to}
						title="To"
						oninput={() => (activeQuickRange = null)}
					/>
				</div>

				<span class="hidden flex-1 xl:block"></span>

				<!-- Auto-follow + Pause (right side with actions) -->
				<label class="label cursor-pointer gap-2 px-1 py-0">
					<input type="checkbox" class="toggle toggle-xs" bind:checked={autoFollowEnabled} />
					<span class="label-text text-xs">Auto-follow</span>
				</label>
				<label class="label cursor-pointer gap-2 px-1 py-0">
					<input type="checkbox" class="toggle toggle-xs" bind:checked={livePaused} />
					<span class="label-text text-xs">Pause</span>
				</label>

				<span class="h-5 w-px shrink-0 bg-base-300"></span>

				<!-- Retention dropdown -->
				<div class="dropdown">
					<button class="btn gap-1.5 text-xs btn-ghost btn-sm" aria-label="Log retention settings">
						<CalendarSync class="h-3.5 w-3.5" />
						<span class="font-mono">{retentionDays}d</span>
					</button>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						tabindex="0"
						class="dropdown-content z-20 mt-1 w-56 rounded-xl border border-base-300 bg-base-200 shadow-lg xl:right-0 xl:left-auto"
					>
						<div class="p-3">
							<p
								class="mb-3 text-[10px] font-medium tracking-widest text-base-content/50 uppercase"
							>
								Log Retention
							</p>
							<div class="mb-3 flex items-center gap-2">
								<input
									id="retention-days"
									type="number"
									min="1"
									max={maxRetentionDays}
									class="input-bordered input input-xs w-20"
									bind:value={retentionDays}
								/>
								<span class="text-xs text-base-content/60">days</span>
								<button
									class="btn ml-auto btn-ghost btn-xs"
									onclick={() => (retentionDays = defaultRetentionDays)}
									disabled={retentionSaving}
								>
									Default
								</button>
							</div>
							<button
								class="btn w-full btn-xs btn-primary"
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

				<!-- Refresh (shows spinner inline while loading) -->
				<button class="btn text-xs btn-ghost btn-sm" onclick={refreshCurrentView}>
					{#if historyLoading}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{/if}
					Refresh
				</button>

				<button class="btn text-xs btn-ghost btn-sm" onclick={downloadHistoryLogs}>
					<Download class="h-3.5 w-3.5" />
					<span class="sm:inline">Export</span>
				</button>

				{#if hasActiveFilters}
					<button class="btn gap-1 text-error btn-ghost btn-xs" onclick={resetFilters}>
						<X class="h-3 w-3" />
						Clear filters
					</button>
				{/if}
			</div>

			<!-- Mobile: expandable custom date range row -->
			{#if mobileDateOpen}
				<div class="flex flex-col gap-2 border-t border-base-300 px-3 py-3 sm:hidden">
					<input
						type="datetime-local"
						class="input-bordered input input-sm w-full"
						bind:value={from}
						oninput={() => (activeQuickRange = null)}
					/>
					<input
						type="datetime-local"
						class="input-bordered input input-sm w-full"
						bind:value={to}
						oninput={() => (activeQuickRange = null)}
					/>
				</div>
			{/if}

			<!-- Status bar -->
			<div
				class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-base-300 px-3 py-2 text-xs text-base-content/50"
			>
				{#if historyTotal > entries.length}
					<span>Showing {entries.length} of {historyTotal}</span>
				{:else}
					<span>{entries.length} entries</span>
				{/if}
				{#if liveStatusLabel}
					<span class="text-base-content/20">·</span>
					<span>{liveStatusLabel}</span>
				{/if}
			</div>
		</div>

		{#if historyError}
			<div class="border-b border-base-300 px-3 py-3 text-sm text-error">{historyError}</div>
		{/if}

		<!-- Table + inspector side panel -->
		<div class="flex overflow-hidden" style="min-height: 20rem; height: calc(100svh - 22rem);">
			<!-- Log table -->
			<div
				class="min-w-0 flex-1 overflow-y-auto"
				bind:this={listViewport}
				onscroll={handleListScroll}
			>
				{#if historyLoading && entries.length === 0}
					<div class="flex items-center gap-2 px-1 py-6 text-sm text-base-content/60">
						<Loader2 class="h-4 w-4 animate-spin" />
						Loading logs
					</div>
				{:else if entries.length === 0}
					<div class="px-1 py-6 text-sm text-base-content/60">
						No logs matched the current filters. Clear filters or wait for new matching entries.
					</div>
				{:else}
					<table class="table-pin-rows table w-full table-sm">
						<thead>
							<tr
								class="bg-base-200/90 text-[10px] tracking-[0.12em] text-base-content/50 uppercase"
							>
								<th class="w-4 pr-0 pl-0"></th>
								<th class="w-24">Time</th>
								<th class="w-16">Level</th>
								<th class="hidden w-32 sm:table-cell">Source</th>
								<th>Message</th>
							</tr>
						</thead>
						<tbody>
							{#each entries as entry (entry.id)}
								<tr
									class={[
										'cursor-pointer border-b border-base-200/70 align-top transition-colors',
										rowAccentClass(entry.level),
										selectedEntry?.id === entry.id ? 'bg-primary/8' : 'hover:bg-base-200/60'
									]}
									onclick={() => handleRowClick(entry)}
								>
									<td class="px-0 py-2"></td>
									<td class="py-3 font-mono text-xs text-base-content/60 sm:py-2">
										{formatTimestamp(entry.timestamp)}
									</td>
									<td class="py-3 sm:py-2">
										<span
											class={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${levelBadgeClass(entry.level, true)}`}
										>
											{entry.level}
										</span>
									</td>
									<td class="hidden py-2 sm:table-cell">
										<span
											class="rounded bg-base-300 px-1.5 py-0.5 font-mono text-[10px] text-base-content/65"
										>
											{getSource(entry)}
										</span>
									</td>
									<td class="py-3 text-sm wrap-break-word whitespace-normal sm:py-2">{entry.msg}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<!-- Desktop inspector side panel -->
			{#if selectedEntry}
				<div
					class="hidden w-104 shrink-0 flex-col overflow-y-auto border-l border-base-300 bg-base-200/30 xl:flex"
				>
					<div
						class="sticky top-0 flex items-center justify-between border-b border-base-300 bg-base-200/80 px-4 py-3 backdrop-blur"
					>
						<p class="text-[10px] font-medium tracking-widest text-base-content/50 uppercase">
							Inspector
						</p>
						<button
							type="button"
							class="btn btn-circle btn-ghost btn-xs"
							onclick={closeInspector}
							aria-label="Close inspector"
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</div>
					{@render inspectorBody(selectedEntry)}
				</div>
			{/if}
		</div>

		<!-- Footer bar (sticky bottom so it's always accessible) -->
		<div
			class="sticky bottom-0 z-10 border-t border-base-300 bg-base-200/95 px-3 py-3 backdrop-blur"
		>
			<div class="flex flex-wrap items-center justify-between gap-3 text-xs text-base-content/55">
				<div>
					{#if historyHasMore}
						<span>Older persisted results are available</span>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					{#if showJumpToLatest}
						<button class="btn btn-xs btn-primary" onclick={jumpToLatest}>
							{#if pendingLiveCount > 0}
								Jump to latest ({pendingLiveCount} new)
							{:else}
								Jump to latest
							{/if}
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
	</div>
</SettingsPage>

<!-- Mobile inspector bottom sheet -->
{#if selectedEntry && mobileInspectorOpen}
	<div class="fixed inset-0 z-40 xl:hidden" role="presentation" onclick={closeInspector}></div>
	<div
		class="fixed right-0 bottom-0 left-0 z-50 max-h-[60vh] overflow-y-auto border-t border-base-300 bg-base-100 xl:hidden"
	>
		<div
			class="sticky top-0 flex items-center justify-between border-b border-base-300 bg-base-100/90 px-4 py-3 backdrop-blur"
		>
			<p class="text-[10px] font-medium tracking-widest text-base-content/50 uppercase">
				Inspector
			</p>
			<button
				type="button"
				class="btn btn-circle btn-ghost btn-xs"
				onclick={closeInspector}
				aria-label="Close inspector"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		</div>
		{@render inspectorBody(selectedEntry)}
	</div>
{/if}
