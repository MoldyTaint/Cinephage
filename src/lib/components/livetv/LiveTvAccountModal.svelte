<script lang="ts">
	import { X, Loader2, XCircle, Tv, Radio, List } from 'lucide-svelte';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';
	import { TestResult } from '$lib/components/ui/modal';
	import LiveTvProviderPicker from './LiveTvProviderPicker.svelte';
	import StalkerAccountForm from './forms/StalkerAccountForm.svelte';
	import XstreamAccountForm from './forms/XstreamAccountForm.svelte';
	import M3uAccountForm from './forms/M3uAccountForm.svelte';
	import { getProviderDefinition } from './providerDefinitions';
	import type {
		LiveTvAccount,
		LiveTvProviderType,
		LiveTvAccountTestResult
	} from '$lib/types/livetv';

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		account?: LiveTvAccount | null;
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: FormData) => void;
		onDelete?: () => void;
		onTest: (data: TestConfig) => Promise<LiveTvAccountTestResult>;
	}

	export interface FormData {
		name: string;
		providerType: LiveTvProviderType;
		portalUrl?: string;
		macAddress?: string;
		baseUrl?: string;
		username?: string;
		password?: string;
		url?: string;
		fileContent?: string;
		selectedCountries?: string[];
		epgUrl: string;
		autoRefresh: boolean;
		enabled: boolean;
	}

	export interface TestConfig {
		providerType: LiveTvProviderType;
		portalUrl?: string;
		macAddress?: string;
		baseUrl?: string;
		username?: string;
		password?: string;
		url?: string;
		fileContent?: string;
		countries?: string[];
	}

	let {
		open,
		mode,
		account = null,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete,
		onTest
	}: Props = $props();

	// Provider selection state
	let selectedProvider = $state<LiveTvProviderType | ''>('');

	// Common form state
	let name = $state('');
	let enabled = $state(true);
	let epgUrl = $state('');

	// Stalker form state
	let portalUrl = $state('');
	let macAddress = $state('');

	// XStream form state
	let baseUrl = $state('');
	let username = $state('');
	let password = $state('');

	// M3U form state
	let inputMode = $state<'url' | 'file' | 'freeiptv'>('url');
	let url = $state('');
	let fileContent = $state('');
	let fileName = $state('');
	let selectedCountries = $state<string[]>([]);
	let autoRefresh = $state(false);

	// UI state
	let testing = $state(false);
	let testResult = $state<LiveTvAccountTestResult | null>(null);

	// Derived
	const modalTitle = $derived(mode === 'add' ? 'Add Live TV Account' : 'Edit Live TV Account');
	const providerDef = $derived(selectedProvider ? getProviderDefinition(selectedProvider) : null);
	const isIptvOrgAccount = $derived(account?.providerType === 'iptvorg');

	// Reset form when modal opens
	$effect(() => {
		if (open) {
			// Set provider type
			if (mode === 'edit' && account) {
				if (isIptvOrgAccount) {
					selectedProvider = 'm3u';
					inputMode = 'freeiptv';
				} else {
					selectedProvider = account.providerType;
					inputMode = account.m3uConfig?.url ? 'url' : 'file';
				}
			} else {
				selectedProvider = '';
				inputMode = 'url';
			}

			// Common fields
			name = account?.name ?? '';
			enabled = account?.enabled ?? true;
			epgUrl = account?.m3uConfig?.epgUrl ?? '';

			// Stalker fields
			portalUrl = account?.stalkerConfig?.portalUrl ?? '';
			macAddress = account?.stalkerConfig?.macAddress ?? '';

			// XStream fields
			baseUrl = account?.xstreamConfig?.baseUrl ?? '';
			username = account?.xstreamConfig?.username ?? '';
			password = '';

			// M3U fields
			url = account?.m3uConfig?.url ?? '';
			fileContent = account?.m3uConfig?.fileContent ?? '';
			fileName = '';
			selectedCountries = account?.iptvOrgConfig?.countries ?? [];
			autoRefresh = account?.m3uConfig?.autoRefresh ?? false;

			// Reset UI state
			testing = false;
			testResult = null;
		}
	});

	// Validation
	const isStalkerValid = $derived(
		name.trim().length > 0 && portalUrl.trim().length > 0 && macAddress.trim().length > 0
	);
	const isXstreamValid = $derived(
		name.trim().length > 0 &&
			baseUrl.trim().length > 0 &&
			username.trim().length > 0 &&
			(mode === 'add' || password.trim().length > 0 || account?.xstreamConfig?.password)
	);
	const isM3uValid = $derived(() => {
		if (name.trim().length === 0) return false;
		if (inputMode === 'freeiptv') return selectedCountries.length > 0;
		if (inputMode === 'url') return url.trim().length > 0;
		return fileContent.length > 0;
	});

	const canSubmit = $derived(() => {
		switch (selectedProvider) {
			case 'stalker':
				return isStalkerValid;
			case 'xstream':
				return isXstreamValid;
			case 'm3u':
				return isM3uValid();
			default:
				return false;
		}
	});

	function getFormData(): FormData {
		const data: FormData = {
			name: name.trim(),
			providerType: selectedProvider as LiveTvProviderType,
			epgUrl: epgUrl.trim(),
			autoRefresh,
			enabled
		};

		switch (selectedProvider) {
			case 'stalker':
				data.portalUrl = portalUrl.trim();
				data.macAddress = macAddress.toUpperCase();
				break;
			case 'xstream':
				data.baseUrl = baseUrl.trim();
				data.username = username.trim();
				if (password.trim()) {
					data.password = password.trim();
				}
				break;
			case 'm3u':
				if (inputMode === 'freeiptv') {
					data.selectedCountries = selectedCountries;
				} else if (inputMode === 'url') {
					data.url = url.trim();
				} else {
					data.fileContent = fileContent;
				}
				break;
		}

		return data;
	}

	function getTestConfig(): TestConfig {
		const config: TestConfig = {
			providerType: selectedProvider as LiveTvProviderType
		};

		switch (selectedProvider) {
			case 'stalker':
				config.portalUrl = portalUrl.trim();
				config.macAddress = macAddress.toUpperCase();
				break;
			case 'xstream':
				config.baseUrl = baseUrl.trim();
				config.username = username.trim();
				config.password = password.trim();
				break;
			case 'm3u':
				if (inputMode === 'freeiptv') {
					config.countries = selectedCountries;
				} else if (inputMode === 'url') {
					config.url = url.trim();
				} else {
					config.fileContent = fileContent;
				}
				break;
		}

		return config;
	}

	async function handleTest() {
		if (!canSubmit()) return;

		testing = true;
		testResult = null;

		try {
			testResult = await onTest(getTestConfig());
		} finally {
			testing = false;
		}
	}

	function handleSave() {
		if (!canSubmit()) return;
		onSave(getFormData());
	}

	function handleProviderSelect(type: LiveTvProviderType) {
		selectedProvider = type;
		testResult = null;
	}
</script>

<ModalWrapper {open} {onClose} maxWidth="3xl" labelledBy="livetv-account-modal-title">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<h3 id="livetv-account-modal-title" class="text-xl font-bold">{modalTitle}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Provider Selection (add mode only) -->
	{#if mode === 'add' && !selectedProvider}
		<LiveTvProviderPicker onSelect={handleProviderSelect} onCancel={onClose} />
	{:else}
		<!-- Provider Header (with change button in add mode) -->
		{#if providerDef}
			<div class="mb-6 flex items-center justify-between rounded-lg bg-base-200 px-4 py-3">
				<div class="flex items-center gap-3">
					<div class="rounded-lg bg-primary/10 p-2">
						{#if selectedProvider === 'stalker'}
							<Tv class="h-5 w-5 text-primary" />
						{:else if selectedProvider === 'xstream'}
							<Radio class="h-5 w-5 text-primary" />
						{:else if selectedProvider === 'm3u'}
							<List class="h-5 w-5 text-primary" />
						{/if}
					</div>
					<div>
						<div class="font-semibold">{providerDef.name}</div>
						<div class="text-sm text-base-content/60">{providerDef.description}</div>
					</div>
				</div>
				{#if mode === 'add'}
					<button
						type="button"
						class="btn btn-ghost btn-sm"
						onclick={() => (selectedProvider = '')}
					>
						Change
					</button>
				{/if}
			</div>
		{/if}

		<!-- Form Content -->
		{#if selectedProvider === 'stalker'}
			<StalkerAccountForm
				{name}
				{portalUrl}
				{macAddress}
				{epgUrl}
				{enabled}
				{mode}
				onNameChange={(v) => (name = v)}
				onPortalUrlChange={(v) => (portalUrl = v)}
				onMacAddressChange={(v) => (macAddress = v)}
				onEpgUrlChange={(v) => (epgUrl = v)}
				onEnabledChange={(v) => (enabled = v)}
			/>
		{:else if selectedProvider === 'xstream'}
			<XstreamAccountForm
				{name}
				{baseUrl}
				{username}
				{password}
				{epgUrl}
				{enabled}
				{mode}
				hasPassword={!!account?.xstreamConfig?.password}
				onNameChange={(v) => (name = v)}
				onBaseUrlChange={(v) => (baseUrl = v)}
				onUsernameChange={(v) => (username = v)}
				onPasswordChange={(v) => (password = v)}
				onEpgUrlChange={(v) => (epgUrl = v)}
				onEnabledChange={(v) => (enabled = v)}
			/>
		{:else if selectedProvider === 'm3u'}
			<M3uAccountForm
				{name}
				{inputMode}
				{url}
				{fileContent}
				{fileName}
				{selectedCountries}
				{epgUrl}
				{autoRefresh}
				{enabled}
				{mode}
				onNameChange={(v) => (name = v)}
				onInputModeChange={(m) => {
					inputMode = m;
					testResult = null;
				}}
				onUrlChange={(v) => (url = v)}
				onFileUpload={(content, name) => {
					fileContent = content;
					fileName = name;
				}}
				onCountriesChange={(v) => (selectedCountries = v)}
				onEpgUrlChange={(v) => (epgUrl = v)}
				onAutoRefreshChange={(v) => (autoRefresh = v)}
				onEnabledChange={(v) => (enabled = v)}
			/>
		{/if}

		<!-- Save Error -->
		{#if error}
			<div class="mt-6 alert alert-error">
				<XCircle class="h-5 w-5" />
				<div>
					<div class="font-medium">Failed to save</div>
					<div class="text-sm opacity-80">{error}</div>
				</div>
			</div>
		{/if}

		<!-- Test Result -->
		<TestResult
			result={testResult
				? {
						success: testResult.success,
						error: testResult.error
					}
				: null}
			successMessage={testResult?.profile
				? `Connection successful • ${testResult.profile.channelCount.toLocaleString()} channels`
				: 'Connection successful!'}
			successDetails={testResult?.profile
				? `Categories: ${testResult.profile.categoryCount} • Status: ${testResult.profile.status}${testResult.profile.expiresAt ? ` • Expires: ${new Date(testResult.profile.expiresAt).toLocaleDateString()}` : ''}`
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
				disabled={testing || saving || !canSubmit()}
			>
				{#if testing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				Test
			</button>

			<button class="btn btn-ghost" onclick={onClose}>Cancel</button>

			<button class="btn btn-primary" onclick={handleSave} disabled={saving || !canSubmit()}>
				{#if saving}
					<Loader2 class="h-4 w-4 animate-spin" />
				{/if}
				Save
			</button>
		</div>
	{/if}
</ModalWrapper>
