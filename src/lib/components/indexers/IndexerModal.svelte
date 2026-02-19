<script lang="ts">
	import { X, Loader2, Globe, Lock, Zap } from 'lucide-svelte';
	import type { IndexerDefinition, Indexer, IndexerFormData } from '$lib/types/indexer';
	import { computeUIHints } from '$lib/types/indexer';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import { TestResult } from '$lib/components/ui/modal';
	import IndexerDefinitionPicker from './IndexerDefinitionPicker.svelte';
	import IndexerFormStreaming from './IndexerFormStreaming.svelte';
	import IndexerFormRegular from './IndexerFormRegular.svelte';
	import IndexerFormInternal from './IndexerFormInternal.svelte';

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		indexer?: Indexer | null;
		definitions: IndexerDefinition[];
		saving: boolean;
		onClose: () => void;
		onSave: (data: IndexerFormData) => void | Promise<void>;
		onDelete?: () => void;
		onTest: (data: IndexerFormData) => Promise<{ success: boolean; error?: string }>;
	}

	let {
		open,
		mode,
		indexer = null,
		definitions,
		saving,
		onClose,
		onSave,
		onDelete,
		onTest
	}: Props = $props();

	// Form state - Basic
	let selectedDefinitionId = $state('');
	let name = $state('');
	let url = $state('');
	let enabled = $state(true);
	let priority = $state(25);
	let settings = $state<Record<string, string>>({});

	// Form state - Search capabilities
	let enableAutomaticSearch = $state(true);
	let enableInteractiveSearch = $state(true);

	// Form state - Torrent seeding settings
	let minimumSeeders = $state(1);
	let seedRatio = $state('');
	let seedTime = $state<number | ''>('');
	let packSeedTime = $state<number | ''>('');
	let rejectDeadTorrents = $state(true);

	// Test state
	let testing = $state(false);
	let testResult = $state<{ success: boolean; error?: string } | null>(null);

	// Validation state
	let urlTouched = $state(false);
	const urlValid = $derived(() => {
		if (!url) return true;
		try {
			const parsed = new URL(url);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:';
		} catch {
			return false;
		}
	});
	const urlError = $derived(() => {
		if (!urlTouched || !url) return '';
		if (!urlValid()) return 'Please enter a valid URL (e.g., https://example.com)';
		return '';
	});

	// Derived values
	const selectedDefinition = $derived(definitions.find((d) => d.id === selectedDefinitionId));
	const modalTitle = $derived(mode === 'add' ? 'Add Indexer' : 'Edit Indexer');
	const effectiveProtocol = $derived(
		selectedDefinition?.protocol ?? indexer?.protocol ?? 'torrent'
	);
	const isInternalIndexer = $derived(mode === 'edit' && indexer && !selectedDefinition);

	const uiHints = $derived(() => {
		if (selectedDefinition) {
			return computeUIHints(selectedDefinition);
		}
		if (indexer) {
			return computeUIHints({
				type: 'public',
				protocol: indexer.protocol,
				settings: []
			});
		}
		return null;
	});

	const isTorrent = $derived(uiHints()?.showTorrentSettings ?? false);
	const isStreaming = $derived(uiHints()?.isStreaming ?? false);

	const hasAuthSettings = $derived(
		selectedDefinition?.settings &&
			selectedDefinition.settings.length > 0 &&
			selectedDefinition.settings.some(
				(s) =>
					s.type !== 'info' &&
					s.type !== 'info_cookie' &&
					s.type !== 'info_cloudflare' &&
					s.type !== 'info_useragent'
			)
	);

	const definitionUrls = $derived(
		[selectedDefinition?.siteUrl ?? '', ...(selectedDefinition?.alternateUrls ?? [])].filter(
			Boolean
		)
	);
	const normalizeUrlForCompare = (value: string): string => value.trim().replace(/\/+$/, '');
	const alternateUrls = $derived.by(() => {
		const normalizedCurrent = normalizeUrlForCompare(url);
		const normalizedDefinitionUrls = definitionUrls.map((u) => normalizeUrlForCompare(u));
		const singleDefinitionUrl =
			normalizedDefinitionUrls.length === 1 ? normalizedDefinitionUrls[0] : null;

		// In edit mode, only reflect explicitly saved failover URLs.
		// Also suppress stale placeholder failovers when definition has only one URL and
		// the user chose a custom base URL.
		if (mode === 'edit') {
			return (indexer?.alternateUrls ?? []).filter((u) => {
				const normalized = normalizeUrlForCompare(u);
				if (!normalized || normalized === normalizedCurrent) return false;
				if (
					singleDefinitionUrl &&
					normalized === singleDefinitionUrl &&
					normalizedCurrent &&
					normalizedCurrent !== singleDefinitionUrl
				) {
					return false;
				}
				return true;
			});
		}

		// In add mode, only infer failovers when definition explicitly provides
		// multiple URLs and the selected URL is one of them.
		if (normalizedDefinitionUrls.length <= 1) return [];
		if (!normalizedDefinitionUrls.includes(normalizedCurrent)) return [];
		return definitionUrls.filter((u) => normalizeUrlForCompare(u) !== normalizedCurrent);
	});

	// Reset form when modal opens
	$effect(() => {
		if (open) {
			const initialDefId = indexer?.definitionId ?? '';
			const def = definitions.find((d) => d.id === initialDefId);

			selectedDefinitionId = initialDefId;
			name = indexer?.name ?? def?.name ?? '';
			url = indexer?.baseUrl ?? def?.siteUrl ?? '';
			enabled = indexer?.enabled ?? true;
			priority = indexer?.priority ?? 25;
			settings = { ...(indexer?.settings ?? {}) };

			enableAutomaticSearch = indexer?.enableAutomaticSearch ?? true;
			enableInteractiveSearch = indexer?.enableInteractiveSearch ?? true;

			minimumSeeders = indexer?.minimumSeeders ?? 1;
			seedRatio = indexer?.seedRatio ?? '';
			seedTime = indexer?.seedTime ?? '';
			packSeedTime = indexer?.packSeedTime ?? '';
			rejectDeadTorrents = indexer?.rejectDeadTorrents ?? true;

			urlTouched = false;
			testResult = null;
		}
	});

	// Update defaults when definition changes in add mode
	$effect(() => {
		if (mode === 'add' && selectedDefinition) {
			if (!url) url = selectedDefinition.siteUrl ?? '';
			if (!name) name = selectedDefinition.name;
		}
	});

	function handleDefinitionSelect(defId: string) {
		selectedDefinitionId = defId;
		const def = definitions.find((d) => d.id === defId);
		if (def && mode === 'add') {
			name = def.name;
			url = def.siteUrl ?? '';
			settings = {};
		}
	}

	function getFormData(): IndexerFormData {
		return {
			name,
			definitionId: selectedDefinitionId,
			baseUrl: url,
			alternateUrls,
			enabled,
			priority,
			protocol: effectiveProtocol,
			settings,
			enableAutomaticSearch,
			enableInteractiveSearch,
			minimumSeeders,
			seedRatio: seedRatio || null,
			seedTime: seedTime === '' ? null : seedTime,
			packSeedTime: packSeedTime === '' ? null : packSeedTime,
			rejectDeadTorrents
		};
	}

	async function handleTest() {
		testing = true;
		testResult = null;
		try {
			testResult = await onTest(getFormData());
		} finally {
			testing = false;
		}
	}

	async function handleSave() {
		const formData = getFormData();

		// Pre-save validation: run connection test first for enabled indexers.
		// If test fails, block save and surface the returned error inline.
		if (enabled) {
			testing = true;
			testResult = null;
			try {
				const result = await onTest(formData);
				testResult = result;
				if (!result.success) {
					return;
				}
			} finally {
				testing = false;
			}
		}

		await onSave(formData);
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="3xl" labelledBy="indexer-modal-title">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<h3 id="indexer-modal-title" class="text-xl font-bold">{modalTitle}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Definition Selection (only in add mode when not selected) -->
	{#if mode === 'add' && !selectedDefinitionId}
		<IndexerDefinitionPicker {definitions} onSelect={handleDefinitionSelect} onCancel={onClose} />
	{:else}
		<!-- Selected definition header (in add mode) -->
		{#if mode === 'add' && selectedDefinition}
			<div class="mb-6 flex items-center justify-between rounded-lg bg-base-200 px-4 py-3">
				<div class="flex items-center gap-3">
					<div
						class="rounded-lg p-2 {isStreaming
							? 'bg-info/10'
							: selectedDefinition.type === 'public'
								? 'bg-success/10'
								: 'bg-warning/10'}"
					>
						{#if isStreaming}
							<Zap class="h-5 w-5 text-info" />
						{:else if selectedDefinition.type === 'public'}
							<Globe class="h-5 w-5 text-success" />
						{:else}
							<Lock class="h-5 w-5 text-warning" />
						{/if}
					</div>
					<div>
						<div class="flex items-center gap-2">
							<span class="font-semibold">{selectedDefinition.name}</span>
							<span class="badge badge-ghost badge-sm">{selectedDefinition.protocol}</span>
							{#if selectedDefinition.isCustom}
								<span class="badge badge-ghost badge-sm">custom</span>
							{/if}
						</div>
						{#if selectedDefinition.description}
							<div class="text-sm text-base-content/60">{selectedDefinition.description}</div>
						{/if}
					</div>
				</div>
				<button
					type="button"
					class="btn btn-ghost btn-sm"
					onclick={() => (selectedDefinitionId = '')}
				>
					Change
				</button>
			</div>
		{/if}

		<!-- Internal indexer header (edit mode for auto-managed indexers) -->
		{#if isInternalIndexer && indexer}
			<div class="mb-6 flex items-center justify-between rounded-lg bg-info/10 px-4 py-3">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-info/20 p-2">
						<Zap class="h-5 w-5 text-info" />
					</div>
					<div>
						<div class="flex items-center gap-2">
							<span class="font-semibold">{indexer.name}</span>
							<span class="badge badge-sm badge-info">Internal</span>
							<span class="badge badge-ghost badge-sm">{indexer.protocol}</span>
						</div>
						<div class="text-sm text-base-content/60">
							This is a built-in indexer that is automatically managed.
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Form Content -->
		{#if isInternalIndexer && indexer}
			<IndexerFormInternal
				{indexer}
				{url}
				urlError={urlError()}
				{priority}
				{enabled}
				{enableAutomaticSearch}
				{enableInteractiveSearch}
				{isStreaming}
				onUrlChange={(v) => (url = v)}
				onUrlBlur={() => (urlTouched = true)}
				onPriorityChange={(v) => (priority = v)}
				onEnabledChange={(v) => (enabled = v)}
				onAutomaticSearchChange={(v) => (enableAutomaticSearch = v)}
				onInteractiveSearchChange={(v) => (enableInteractiveSearch = v)}
			/>
		{:else if isStreaming && selectedDefinition}
			<IndexerFormStreaming
				definition={selectedDefinition}
				{name}
				{priority}
				{enabled}
				{settings}
				{enableAutomaticSearch}
				{enableInteractiveSearch}
				onNameChange={(v) => (name = v)}
				onPriorityChange={(v) => (priority = v)}
				onEnabledChange={(v) => (enabled = v)}
				onSettingsChange={(k, v) => (settings[k] = v)}
				onAutomaticSearchChange={(v) => (enableAutomaticSearch = v)}
				onInteractiveSearchChange={(v) => (enableInteractiveSearch = v)}
			/>
		{:else}
			<IndexerFormRegular
				definition={selectedDefinition ?? null}
				{name}
				{url}
				urlError={urlError()}
				{priority}
				{enabled}
				{settings}
				{enableAutomaticSearch}
				{enableInteractiveSearch}
				{minimumSeeders}
				{seedRatio}
				{seedTime}
				{packSeedTime}
				{rejectDeadTorrents}
				{isTorrent}
				{isStreaming}
				hasAuthSettings={hasAuthSettings ?? false}
				{definitionUrls}
				{alternateUrls}
				onNameChange={(v) => (name = v)}
				onUrlChange={(v) => (url = v)}
				onUrlBlur={() => (urlTouched = true)}
				onPriorityChange={(v) => (priority = v)}
				onEnabledChange={(v) => (enabled = v)}
				onSettingsChange={(s) => (settings = s)}
				onAutomaticSearchChange={(v) => (enableAutomaticSearch = v)}
				onInteractiveSearchChange={(v) => (enableInteractiveSearch = v)}
				onMinimumSeedersChange={(v) => (minimumSeeders = v)}
				onSeedRatioChange={(v) => (seedRatio = v)}
				onSeedTimeChange={(v) => (seedTime = v)}
				onPackSeedTimeChange={(v) => (packSeedTime = v)}
				onRejectDeadTorrentsChange={(v) => (rejectDeadTorrents = v)}
			/>
		{/if}

		<!-- Test Result -->
		<TestResult result={testResult} />

		<!-- Actions -->
		<div class="modal-action">
			{#if mode === 'edit' && onDelete}
				<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
			{/if}

			<button
				class="btn btn-ghost"
				onclick={handleTest}
				disabled={testing || saving || !url || !name || !urlValid()}
			>
				{#if testing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				Test
			</button>

			<button class="btn btn-ghost" onclick={onClose}>Cancel</button>

			<button
				class="btn btn-primary"
				onclick={handleSave}
				disabled={saving || testing || !url || !name || !urlValid()}
			>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				Save
			</button>
		</div>
	{/if}
</ModalWrapper>
