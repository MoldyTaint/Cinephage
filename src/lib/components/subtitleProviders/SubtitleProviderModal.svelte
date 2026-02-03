<script lang="ts">
	import {
		X,
		Loader2,
		CheckCircle2,
		Globe,
		Key,
		Hash,
		Search,
		User,
		Crown,
		CreditCard
	} from 'lucide-svelte';
	import type { SubtitleProviderConfig, ProviderImplementation } from '$lib/server/subtitles/types';
	import type { ProviderDefinition } from '$lib/server/subtitles/providers/interfaces';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import { SectionHeader, TestResult } from '$lib/components/ui/modal';

	/**
	 * Get access type info for display
	 */
	function getAccessTypeInfo(def: ProviderDefinition): {
		icon: typeof Globe;
		iconClass: string;
		badge: string;
		badgeClass: string;
	} {
		const accessType =
			def.accessType ??
			(def.requiresApiKey ? 'api-key' : def.requiresCredentials ? 'free-account' : 'free');

		switch (accessType) {
			case 'free':
				return {
					icon: Globe,
					iconClass: 'text-success',
					badge: 'Free',
					badgeClass: 'badge-success'
				};
			case 'free-account':
				return {
					icon: User,
					iconClass: 'text-info',
					badge: 'Free Account',
					badgeClass: 'badge-info'
				};
			case 'api-key':
				return {
					icon: Key,
					iconClass: 'text-warning',
					badge: 'API Key',
					badgeClass: 'badge-warning'
				};
			case 'paid':
				return {
					icon: CreditCard,
					iconClass: 'text-error',
					badge: 'Paid',
					badgeClass: 'badge-error'
				};
			case 'vip':
				return {
					icon: Crown,
					iconClass: 'text-secondary',
					badge: 'VIP Only',
					badgeClass: 'badge-secondary'
				};
			default:
				return {
					icon: Globe,
					iconClass: 'text-base-content/50',
					badge: 'Unknown',
					badgeClass: 'badge-ghost'
				};
		}
	}

	interface SubtitleProviderFormData {
		name: string;
		implementation: string;
		enabled: boolean;
		priority: number;
		apiKey?: string;
		username?: string;
		password?: string;
		requestsPerMinute: number;
		settings?: Record<string, unknown>;
	}

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		provider?: SubtitleProviderConfig | null;
		definitions: ProviderDefinition[];
		saving: boolean;
		onClose: () => void;
		onSave: (data: SubtitleProviderFormData) => void;
		onDelete?: () => void;
		onTest: (
			data: SubtitleProviderFormData
		) => Promise<{ success: boolean; error?: string; responseTime?: number }>;
	}

	let {
		open,
		mode,
		provider = null,
		definitions,
		saving,
		onClose,
		onSave,
		onDelete,
		onTest
	}: Props = $props();

	// Form state - Implementation selection (defaults only, effect syncs from props)
	let implementation = $state<ProviderImplementation | ''>('');
	let searchQuery = $state('');

	// Form state - Basic
	let name = $state('');
	let enabled = $state(true);
	let priority = $state(25);

	// Form state - Authentication
	let apiKey = $state('');
	let username = $state('');
	let password = $state('');

	// Form state - Rate limiting
	let requestsPerMinute = $state(60);

	// Test state
	let testing = $state(false);
	let testResult = $state<{ success: boolean; error?: string; responseTime?: number } | null>(null);

	// Derived
	const modalTitle = $derived(mode === 'add' ? 'Add Subtitle Provider' : 'Edit Subtitle Provider');
	const hasPassword = $derived(!!provider?.password);
	const selectedDefinition = $derived(
		implementation ? definitions.find((d) => d.implementation === implementation) : null
	);
	const requiresApiKey = $derived(selectedDefinition?.requiresApiKey ?? false);
	const requiresCredentials = $derived(selectedDefinition?.requiresCredentials ?? false);

	// Filter definitions based on search
	const filteredDefinitions = $derived(() => {
		if (!searchQuery.trim()) return definitions;
		const query = searchQuery.toLowerCase();
		return definitions.filter(
			(d) =>
				d.name.toLowerCase().includes(query) ||
				d.description.toLowerCase().includes(query) ||
				d.implementation.toLowerCase().includes(query)
		);
	});

	// Reset form when modal opens or provider changes
	$effect(() => {
		if (open) {
			implementation = provider?.implementation ?? '';
			name = provider?.name ?? '';
			enabled = provider?.enabled ?? true;
			priority = provider?.priority ?? 25;
			apiKey = provider?.apiKey ?? '';
			username = provider?.username ?? '';
			password = '';
			requestsPerMinute = provider?.requestsPerMinute ?? 60;
			searchQuery = '';
			testResult = null;
		}
	});

	function handleImplementationChange(newImpl: ProviderImplementation) {
		implementation = newImpl;
		if (mode === 'add') {
			const def = definitions.find((d) => d.implementation === newImpl);
			if (def) {
				name = def.name;
				requestsPerMinute = newImpl === 'opensubtitles' ? 40 : 60;
			}
		}
	}

	function getFormData(): SubtitleProviderFormData {
		return {
			name,
			implementation,
			enabled,
			priority,
			apiKey: apiKey || undefined,
			username: username || undefined,
			password: password || undefined,
			requestsPerMinute
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

	function handleSave() {
		onSave(getFormData());
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="3xl" labelledBy="subtitle-provider-modal-title">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<h3 id="subtitle-provider-modal-title" class="text-xl font-bold">{modalTitle}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Provider Type Selection (only in add mode when not selected) -->
	{#if mode === 'add' && !implementation}
		<div class="space-y-4">
			<!-- Search -->
			<div class="form-control">
				<div class="relative">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/50" />
					<input
						type="text"
						class="input-bordered input w-full pl-10"
						placeholder="Search providers..."
						bind:value={searchQuery}
					/>
				</div>
			</div>

			<!-- Provider List -->
			<div class="max-h-[400px] overflow-y-auto rounded-lg border border-base-300">
				{#each filteredDefinitions() as def (def.implementation)}
					{@const accessInfo = getAccessTypeInfo(def)}
					{@const AccessIcon = accessInfo.icon}
					<button
						type="button"
						class="flex w-full items-center gap-4 border-b border-base-200 p-4 text-left transition-colors last:border-b-0 hover:bg-base-200"
						onclick={() => handleImplementationChange(def.implementation as ProviderImplementation)}
					>
						<div class="rounded-lg bg-base-300 p-2">
							{#if AccessIcon}
								<AccessIcon class="h-5 w-5 {accessInfo.iconClass}" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="font-semibold">{def.name}</span>
								{#if def.supportsHashSearch}
									<span class="badge badge-xs badge-info">Hash</span>
								{/if}
							</div>
							<p class="truncate text-sm text-base-content/60">{def.description}</p>
						</div>
						<div class="flex flex-col items-end gap-1">
							<span class="badge badge-sm {accessInfo.badgeClass}">{accessInfo.badge}</span>
							{#if def.requiresCredentials && def.accessType !== 'free-account'}
								<span class="badge badge-ghost badge-xs">Account</span>
							{/if}
						</div>
					</button>
				{:else}
					<div class="p-8 text-center text-base-content/50">
						No providers match "{searchQuery}"
					</div>
				{/each}
			</div>

			<p class="text-center text-sm text-base-content/50">
				{definitions.length} providers available
			</p>
		</div>

		<div class="modal-action">
			<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
		</div>
	{:else}
		<!-- Selected provider header (in add mode) -->
		{#if mode === 'add' && selectedDefinition}
			{@const selectedAccessInfo = getAccessTypeInfo(selectedDefinition)}
			{@const SelectedAccessIcon = selectedAccessInfo.icon}
			<div class="mb-6 flex items-center justify-between rounded-lg bg-base-200 px-4 py-3">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-base-300 p-2">
						{#if SelectedAccessIcon}
							<SelectedAccessIcon class="h-5 w-5 {selectedAccessInfo.iconClass}" />
						{/if}
					</div>
					<div>
						<div class="flex items-center gap-2">
							<span class="font-semibold">{selectedDefinition.name}</span>
							<span class="badge badge-xs {selectedAccessInfo.badgeClass}"
								>{selectedAccessInfo.badge}</span
							>
						</div>
						<div class="text-sm text-base-content/60">{selectedDefinition.description}</div>
					</div>
				</div>
				<button type="button" class="btn btn-ghost btn-sm" onclick={() => (implementation = '')}>
					Change
				</button>
			</div>
		{/if}

		<!-- Main Form - Responsive Two Column Layout -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
			<!-- Left Column: Basic Settings -->
			<div class="space-y-4">
				<SectionHeader title="Basic Settings" />

				<div class="form-control">
					<label class="label py-1" for="name">
						<span class="label-text">Name</span>
					</label>
					<input
						id="name"
						type="text"
						class="input-bordered input input-sm"
						bind:value={name}
						placeholder={selectedDefinition?.name ?? 'My Provider'}
					/>
				</div>

				<div class="grid grid-cols-2 gap-2 sm:gap-3">
					<div class="form-control">
						<label class="label py-1" for="priority">
							<span class="label-text">Priority</span>
						</label>
						<input
							id="priority"
							type="number"
							class="input-bordered input input-sm"
							bind:value={priority}
							min="1"
							max="100"
						/>
						<p class="label py-0">
							<span class="label-text-alt text-xs">Lower = higher priority</span>
						</p>
					</div>

					<div class="form-control">
						<label class="label py-1" for="requestsPerMinute">
							<span class="label-text">Rate Limit</span>
						</label>
						<input
							id="requestsPerMinute"
							type="number"
							class="input-bordered input input-sm"
							bind:value={requestsPerMinute}
							min="1"
							max="300"
						/>
						<p class="label py-0">
							<span class="label-text-alt text-xs">Requests/min</span>
						</p>
					</div>
				</div>

				<div class="flex gap-4 pt-2">
					<label class="label cursor-pointer gap-2">
						<input type="checkbox" class="checkbox checkbox-sm" bind:checked={enabled} />
						<span class="label-text">Enabled</span>
					</label>
				</div>
			</div>

			<!-- Right Column: Authentication -->
			<div class="space-y-4">
				<SectionHeader title="Authentication" />

				{#if requiresApiKey}
					<div class="form-control">
						<label class="label py-1" for="apiKey">
							<span class="label-text">API Key</span>
							<span class="badge badge-xs badge-warning">Required</span>
						</label>
						<input
							id="apiKey"
							type="password"
							class="input-bordered input input-sm"
							bind:value={apiKey}
							placeholder={mode === 'edit' && provider?.apiKey ? '••••••••' : 'Enter API key'}
						/>
						{#if selectedDefinition?.website}
							<p class="label py-1">
								<!-- eslint-disable svelte/no-navigation-without-resolve -- External URL -->
								<a
									href={selectedDefinition.website}
									target="_blank"
									rel="noopener noreferrer"
									class="label-text-alt link text-xs link-primary"
								>
									Get an API key from {selectedDefinition.name}
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							</p>
						{/if}
					</div>
				{:else}
					<div class="rounded-lg bg-success/10 p-3">
						<div class="flex items-center gap-2 text-success">
							<CheckCircle2 class="h-4 w-4" />
							<span class="text-sm font-medium">No API key required</span>
						</div>
						<p class="mt-1 text-xs text-base-content/60">
							This provider works without authentication.
						</p>
					</div>
				{/if}

				{#if requiresCredentials}
					<div class="grid grid-cols-2 gap-2 sm:gap-3">
						<div class="form-control">
							<label class="label py-1" for="username">
								<span class="label-text">Username</span>
							</label>
							<input
								id="username"
								type="text"
								class="input-bordered input input-sm"
								bind:value={username}
							/>
						</div>

						<div class="form-control">
							<label class="label py-1" for="password">
								<span class="label-text">
									Password
									{#if mode === 'edit' && hasPassword}
										<span class="text-xs opacity-50">(blank to keep)</span>
									{/if}
								</span>
							</label>
							<input
								id="password"
								type="password"
								class="input-bordered input input-sm"
								bind:value={password}
								placeholder={mode === 'edit' && hasPassword ? '••••••••' : ''}
							/>
						</div>
					</div>
				{/if}

				<!-- Features info -->
				{#if selectedDefinition}
					<SectionHeader title="Features" class="mt-4" />
					<div class="flex flex-wrap gap-2">
						{#each selectedDefinition.features as feature (feature)}
							<div class="badge badge-outline badge-sm">{feature}</div>
						{/each}
						{#if selectedDefinition.supportsHashSearch}
							<div class="badge gap-1 badge-sm badge-info">
								<Hash class="h-3 w-3" />
								Hash Matching
							</div>
						{/if}
					</div>
					<div class="mt-2 text-xs text-base-content/60">
						Supports {selectedDefinition.supportedLanguages.length}+ languages
					</div>
				{/if}
			</div>
		</div>

		<!-- Test Result -->
		<TestResult
			result={testResult}
			successDetails={testResult?.responseTime
				? `Response time: ${testResult.responseTime}ms`
				: undefined}
		/>

		<!-- Actions -->
		<div class="modal-action">
			{#if mode === 'edit' && onDelete}
				<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
			{/if}

			<button
				class="btn btn-ghost"
				onclick={handleTest}
				disabled={testing || saving || !name || (requiresApiKey && !apiKey)}
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
				disabled={saving || !name || (requiresApiKey && !apiKey)}
			>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				Save
			</button>
		</div>
	{/if}
</ModalWrapper>
