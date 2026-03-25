<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { SvelteMap, SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		ChevronDown,
		ChevronRight,
		Download,
		Terminal,
		Pause,
		Play,
		RotateCcw,
		Search,
		Wifi,
		WifiOff,
		ArrowDown
	} from 'lucide-svelte';
	import type {
		CapturedLogDomain,
		CapturedLogEntry,
		CapturedLogLevel
	} from '$lib/logging/log-capture';
	import { createDynamicSSE } from '$lib/sse';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';
	import { toasts } from '$lib/stores/toast.svelte';

	interface LogSeedEvent {
		entries: CapturedLogEntry[];
	}

	interface PageData {
		initialEntries: CapturedLogEntry[];
		availableLevels: CapturedLogLevel[];
		availableDomains: CapturedLogDomain[];
	}

	let {
		data
	}: {
		data: PageData;
	} = $props();

	// ── Filter state ────────────────────────────────────────────
	let activeLevels = new SvelteSet<CapturedLogLevel>(['info', 'warn', 'error']);
	let selectedDomain = $state<CapturedLogDomain | 'all'>('all');
	let searchDraft = $state('');
	let search = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	// ── View state ──────────────────────────────────────────────
	let paused = $state(false);
	let seededEntriesFromData = false;
	const initialSeedEntries = $derived.by(() => structuredClone(data.initialEntries).slice(-200));
	// Seed entries from SSR data so the UI has content immediately.
	// The SSE `logs:seed` event will replace these once the stream connects.
	let entries = $state<CapturedLogEntry[]>([]);
	let pendingEntries = $state<CapturedLogEntry[]>([]);
	let expandedEntries = new SvelteSet<string>();
	let bufferedById = new SvelteMap<string, CapturedLogEntry>();
	let autoScroll = $state(true);
	let terminalEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (seededEntriesFromData) return;
		entries = initialSeedEntries;
		seededEntriesFromData = true;
	});

	// ── Debounced search ────────────────────────────────────────
	$effect(() => {
		void searchDraft;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			search = searchDraft.trim();
		}, 250);

		return () => {
			clearTimeout(searchTimer);
		};
	});

	// ── Level toggle helpers ────────────────────────────────────
	function toggleLevel(level: CapturedLogLevel) {
		if (activeLevels.has(level)) {
			// Don't allow deselecting all levels
			if (activeLevels.size <= 1) return;
			activeLevels.delete(level);
		} else {
			activeLevels.add(level);
		}
	}

	function allLevelsActive(): boolean {
		return data.availableLevels.every((l) => activeLevels.has(l));
	}

	// ── Filter key for SSE reconnection ─────────────────────────
	let levelsKey = $derived([...activeLevels].sort().join(','));

	let filterKey = $derived.by(() => `${levelsKey}|${selectedDomain}|${search}`);

	let isFirstFilterRun = true;
	$effect(() => {
		void filterKey;
		if (isFirstFilterRun) {
			isFirstFilterRun = false;
			return;
		}
		entries = [];
		pendingEntries = [];
		bufferedById.clear();
		expandedEntries.clear();
	});

	// ── SSE URL construction ────────────────────────────────────
	let liveUrl = $derived.by(() => {
		const params = new SvelteURLSearchParams();
		// Send levels as comma-separated list
		if (!allLevelsActive() && activeLevels.size > 0) {
			params.set('levels', [...activeLevels].join(','));
		}
		if (selectedDomain !== 'all') {
			params.set('logDomain', selectedDomain);
		}
		if (search) {
			params.set('search', search);
		}
		params.set('limit', '200');
		return `/api/settings/logs/stream?${params.toString()}`;
	});

	let downloadUrl = $derived.by(() => {
		const params = new SvelteURLSearchParams();
		if (!allLevelsActive() && activeLevels.size > 0) {
			params.set('levels', [...activeLevels].join(','));
		}
		if (selectedDomain !== 'all') {
			params.set('logDomain', selectedDomain);
		}
		if (search) {
			params.set('search', search);
		}
		params.set('limit', '1000');
		params.set('format', 'jsonl');
		return `/api/settings/logs/download?${params.toString()}`;
	});

	// ── Dedup and trim ──────────────────────────────────────────
	function dedupeAndTrim(items: CapturedLogEntry[], limit: number): CapturedLogEntry[] {
		const seen = new SvelteSet<string>();
		const result: CapturedLogEntry[] = [];

		for (let i = items.length - 1; i >= 0; i -= 1) {
			const item = items[i];
			if (seen.has(item.id)) continue;
			seen.add(item.id);
			result.unshift(item);
			if (result.length >= limit) break;
		}

		return result;
	}

	function mergeIntoEntries(nextEntries: CapturedLogEntry[]): void {
		entries = dedupeAndTrim([...entries, ...nextEntries], 200);
	}

	function bufferEntry(entry: CapturedLogEntry): void {
		bufferedById.set(entry.id, entry);
		pendingEntries = Array.from(bufferedById.values()).slice(-200);
	}

	function flushPendingEntries(): void {
		if (pendingEntries.length === 0) return;
		mergeIntoEntries(pendingEntries);
		pendingEntries = [];
		bufferedById.clear();
	}

	// ── SSE connection ──────────────────────────────────────────
	const sse = createDynamicSSE<{
		'logs:seed': LogSeedEvent;
		'log:entry': CapturedLogEntry;
	}>(
		() => liveUrl,
		{
			'logs:seed': (event) => {
				entries = dedupeAndTrim(event.entries, 200);
				pendingEntries = [];
				bufferedById.clear();
			},
			'log:entry': (entry) => {
				if (paused) {
					bufferEntry(entry);
					return;
				}
				mergeIntoEntries([entry]);
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

	// ── Auto-scroll on new entries ──────────────────────────────
	$effect(() => {
		void entries.length;
		if (autoScroll && terminalEl) {
			requestAnimationFrame(() => {
				if (terminalEl) {
					terminalEl.scrollTop = terminalEl.scrollHeight;
				}
			});
		}
	});

	function handleTerminalScroll() {
		if (!terminalEl) return;
		const { scrollTop, scrollHeight, clientHeight } = terminalEl;
		// Consider "at bottom" if within 40px of the end
		autoScroll = scrollHeight - scrollTop - clientHeight < 40;
	}

	function scrollToBottom() {
		autoScroll = true;
		if (terminalEl) {
			terminalEl.scrollTop = terminalEl.scrollHeight;
		}
	}

	// ── Derived labels ──────────────────────────────────────────
	const entryCountLabel = $derived(
		`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
	);
	const pendingCountLabel = $derived(
		pendingEntries.length > 0 ? `${pendingEntries.length} buffered` : ''
	);

	// ── Actions ─────────────────────────────────────────────────
	function clearView() {
		entries = [];
		pendingEntries = [];
		bufferedById.clear();
		expandedEntries.clear();
	}

	function togglePause() {
		paused = !paused;
		if (!paused) {
			flushPendingEntries();
		}
	}

	async function downloadLogs() {
		try {
			const response = await fetch(downloadUrl);
			if (!response.ok) {
				throw new Error('Failed to download logs');
			}

			const blob = await response.blob();
			const href = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = href;
			link.download = 'cinephage-logs.jsonl';
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(href);
		} catch (error) {
			toasts.error(error instanceof Error ? error.message : m.settings_logs_failedToDownload());
		}
	}

	// ── Format helpers ──────────────────────────────────────────
	function formatTimestamp(value: string): string {
		return new Intl.DateTimeFormat(undefined, {
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
				return 'text-base-content/40';
			case 'info':
				return 'text-info';
			case 'warn':
				return 'text-warning';
			case 'error':
				return 'text-error';
		}
	}

	function levelToggleClass(level: CapturedLogLevel, active: boolean): string {
		if (!active) return 'bg-base-300/50 text-base-content/30 border-base-300';
		switch (level) {
			case 'debug':
				return 'bg-base-content/10 text-base-content/70 border-base-content/30';
			case 'info':
				return 'bg-info/15 text-info border-info/40';
			case 'warn':
				return 'bg-warning/15 text-warning border-warning/40';
			case 'error':
				return 'bg-error/15 text-error border-error/40';
		}
	}

	function getSource(entry: CapturedLogEntry): string {
		const parts = [entry.logDomain, entry.component, entry.service, entry.module].filter(
			(v): v is string => typeof v === 'string' && v.length > 0
		);
		// Deduplicate adjacent identical values (e.g., component derived from module by sanitizeContext)
		const deduped = parts.filter((v, i) => i === 0 || v !== parts[i - 1]);
		return deduped.length > 0 ? deduped.join('/') : '';
	}

	function hasDetails(entry: CapturedLogEntry): boolean {
		return Boolean(
			entry.method ||
			entry.path ||
			entry.requestId ||
			entry.supportId ||
			entry.correlationId ||
			entry.data ||
			entry.err
		);
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

	function toggleExpanded(entryId: string): void {
		if (expandedEntries.has(entryId)) {
			expandedEntries.delete(entryId);
		} else {
			expandedEntries.add(entryId);
		}
	}

	function isExpanded(entryId: string): boolean {
		return expandedEntries.has(entryId);
	}

	function entryRowBorderClass(level: CapturedLogLevel): string {
		switch (level) {
			case 'error':
				return 'border-l-2 border-l-error/50';
			case 'warn':
				return 'border-l-2 border-l-warning/40';
			default:
				return 'border-l-2 border-l-transparent';
		}
	}
</script>

<svelte:head>
	<title>{m.settings_logs_pageTitle()}</title>
</svelte:head>

<div class="w-full space-y-4 p-3 sm:p-4">
	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">{m.settings_logs_heading()}</h1>
			<p class="mt-1 text-sm text-base-content/60">
				{m.settings_logs_subtitle()}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if sse.isConnected}
				<span class="badge gap-1.5 text-xs badge-success">
					<Wifi class="h-3 w-3" />
					{m.common_live()}
				</span>
			{:else}
				<span class="badge gap-1.5 text-xs badge-warning">
					<WifiOff class="h-3 w-3" />
					{m.common_connecting()}
				</span>
			{/if}
			<span class="badge badge-ghost text-xs">{entryCountLabel}</span>
			{#if paused && pendingCountLabel}
				<span class="badge badge-outline text-xs badge-warning">{pendingCountLabel}</span>
			{/if}
		</div>
	</div>

	<!-- Toolbar -->
	<div class="rounded-lg border border-base-300 bg-base-200 p-3">
		<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
			<!-- Left side: Level toggles + Domain + Search -->
			<div class="flex flex-wrap items-center gap-2">
				<!-- Level toggle badges -->
				<div class="flex items-center gap-1">
					{#each data.availableLevels as level (level)}
						<button
							class="cursor-pointer rounded border px-2.5 py-1 font-mono text-xs font-semibold tracking-wide uppercase transition-all select-none {levelToggleClass(
								level,
								activeLevels.has(level)
							)}"
							onclick={() => toggleLevel(level)}
							title={m.settings_logs_toggleLevel({ level })}
						>
							{level}
						</button>
					{/each}
				</div>

				<div class="hidden h-5 w-px bg-base-300 sm:block"></div>

				<!-- Domain select -->
				<select
					class="select-bordered select bg-base-100 select-sm text-xs"
					bind:value={selectedDomain}
				>
					<option value="all">{m.settings_logs_allDomains()}</option>
					{#each data.availableDomains as domain (domain)}
						<option value={domain}>{domain}</option>
					{/each}
				</select>

				<div class="hidden h-5 w-px bg-base-300 sm:block"></div>

				<!-- Search -->
				<label class="input-bordered input input-sm flex items-center gap-2 bg-base-100">
					<Search class="h-3.5 w-3.5 text-base-content/40" />
					<input
						type="text"
						class="w-40 grow sm:w-52"
						bind:value={searchDraft}
						placeholder={m.settings_logs_filterPlaceholder()}
					/>
				</label>
			</div>

			<!-- Right side: Actions -->
			<div class="flex flex-wrap items-center gap-1.5">
				<button
					class="btn text-xs btn-ghost btn-sm"
					onclick={togglePause}
					title={paused ? m.settings_logs_resumeStream() : m.settings_logs_pauseStream()}
				>
					{#if paused}
						<Play class="h-3.5 w-3.5" />
						{m.action_resume()}
					{:else}
						<Pause class="h-3.5 w-3.5" />
						{m.action_pause()}
					{/if}
				</button>
				<button
					class="btn text-xs btn-ghost btn-sm"
					onclick={clearView}
					title={m.settings_logs_clearView()}
				>
					<RotateCcw class="h-3.5 w-3.5" />
					{m.action_clear()}
				</button>
				<button
					class="btn text-xs btn-ghost btn-sm"
					onclick={downloadLogs}
					title={m.settings_logs_downloadJsonl()}
				>
					<Download class="h-3.5 w-3.5" />
					{m.action_export()}
				</button>
			</div>
		</div>

		<!-- Paused banner -->
		{#if paused && pendingEntries.length > 0}
			<div
				class="mt-3 flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
			>
				<span class="text-warning">
					{m.settings_logs_bufferedEntries({ count: pendingEntries.length })}
				</span>
				<button class="btn btn-xs btn-warning" onclick={togglePause}>
					<Play class="h-3 w-3" />
					{m.action_resume()}
				</button>
			</div>
		{/if}
	</div>

	<!-- Terminal log viewer -->
	<div class="relative">
		<div
			bind:this={terminalEl}
			onscroll={handleTerminalScroll}
			class="h-[calc(100vh-280px)] min-h-80 overflow-auto rounded-lg border border-base-300 bg-neutral text-neutral-content"
		>
			{#if entries.length === 0 && !sse.isConnected}
				<!-- Loading state: SSE still connecting/reconnecting -->
				<div class="flex items-center gap-3 p-6 font-mono text-sm text-neutral-content/50">
					<span class="loading loading-sm loading-dots"></span>
					<span>{m.settings_logs_connectingToStream()}</span>
				</div>
			{:else if entries.length === 0}
				<!-- Empty state: connected but no matching entries -->
				<div class="flex flex-col items-center justify-center gap-3 p-12 text-center">
					<div class="rounded-full bg-neutral-content/10 p-3">
						<Terminal class="h-5 w-5 text-neutral-content/40" />
					</div>
					<div>
						<p class="font-mono text-sm text-neutral-content/60">
							{m.settings_logs_noMatchingEntries()}
						</p>
						<p class="mt-1 font-mono text-xs text-neutral-content/40">
							{m.settings_logs_adjustFilters()}
						</p>
					</div>
				</div>
			{:else}
				<!-- Log entries -->
				<div class="divide-y divide-neutral-content/5">
					{#each entries as entry (entry.id)}
						{@const details = hasDetails(entry)}
						{@const expanded = isExpanded(entry.id)}
						{@const source = getSource(entry)}
						<div class={entryRowBorderClass(entry.level)}>
							<!-- Log line -->
							<button
								class="group flex w-full items-start gap-0 px-3 py-1 text-left font-mono text-xs leading-5 transition-colors hover:bg-neutral-content/5 {details
									? 'cursor-pointer'
									: 'cursor-default'}"
								onclick={() => details && toggleExpanded(entry.id)}
							>
								<!-- Expand indicator -->
								<span class="mt-0.5 mr-1.5 w-3 shrink-0">
									{#if details}
										{#if expanded}
											<ChevronDown class="h-3 w-3 text-neutral-content/30" />
										{:else}
											<ChevronRight
												class="h-3 w-3 text-neutral-content/20 group-hover:text-neutral-content/40"
											/>
										{/if}
									{/if}
								</span>

								<!-- Timestamp -->
								<span class="mr-3 shrink-0 text-neutral-content/35"
									>{formatTimestamp(entry.timestamp)}</span
								>

								<!-- Level -->
								<span
									class="mr-3 w-12 shrink-0 text-right font-bold uppercase {levelColor(
										entry.level
									)}">{entry.level.padStart(5)}</span
								>

								<!-- Source -->
								{#if source}
									<span class="mr-3 w-28 shrink-0 truncate text-neutral-content/40 xl:w-40"
										>[{source}]</span
									>
								{/if}

								<!-- Message -->
								<span class="min-w-0 flex-1 wrap-break-word text-neutral-content/85"
									>{entry.msg}</span
								>
							</button>

							<!-- Expanded details -->
							{#if details && expanded}
								<div class="border-t border-neutral-content/5 bg-neutral-content/3 px-3 py-2">
									<div class="ml-18 xl:ml-30">
										<!-- Quick info badges -->
										<div class="mb-2 flex flex-wrap gap-1.5">
											{#if entry.method && entry.path}
												<span
													class="rounded bg-neutral-content/10 px-1.5 py-0.5 font-mono text-xs text-neutral-content/60"
												>
													{entry.method}
													{entry.path}
												</span>
											{/if}
											{#if entry.requestId}
												<span
													class="rounded bg-neutral-content/10 px-1.5 py-0.5 font-mono text-xs text-neutral-content/40"
												>
													req:{entry.requestId}
												</span>
											{/if}
											{#if entry.supportId}
												<span
													class="rounded bg-neutral-content/10 px-1.5 py-0.5 font-mono text-xs text-neutral-content/40"
												>
													support:{entry.supportId}
												</span>
											{/if}
										</div>
										<!-- JSON details -->
										<pre
											class="overflow-auto rounded bg-neutral-content/6 p-2.5 font-mono text-xs leading-relaxed wrap-break-word whitespace-pre-wrap text-neutral-content/60">{formatDetails(
												entry
											)}</pre>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Scroll to bottom button -->
		{#if !autoScroll}
			<button
				class="btn absolute right-4 bottom-4 btn-circle shadow-lg btn-sm btn-neutral"
				onclick={scrollToBottom}
				title={m.settings_logs_scrollToBottom()}
			>
				<ArrowDown class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>
