<script lang="ts">
	import { Plus, RefreshCw, Loader2, Wifi, WifiOff } from 'lucide-svelte';
	import { LiveTvAccountTable, LiveTvAccountModal } from '$lib/components/livetv';
	import { toFriendlyLiveTvTestError } from '$lib/livetv/errorMessages';
	import { ConfirmationModal } from '$lib/components/ui/modal';
	import type { LiveTvAccount, LiveTvAccountTestResult } from '$lib/types/livetv';
	import type { FormData, TestConfig } from '$lib/components/livetv/LiveTvAccountModal.svelte';
	import { createSSE } from '$lib/sse';
	import { resolvePath } from '$lib/utils/routing';
	import { toasts } from '$lib/stores/toast.svelte';
	import type { AccountStreamEvents } from '$lib/types/sse/events/livetv-account-events.js';
	import { layoutState, deriveMobileSseStatus } from '$lib/layout.svelte';
	import * as m from '$lib/paraglide/messages.js';

	// State
	let accounts = $state<LiveTvAccount[]>([]);
	let loading = $state(true);
	let refreshing = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Modal state
	let modalOpen = $state(false);
	let modalMode = $state<'add' | 'edit'>('add');
	let editingAccount = $state<LiveTvAccount | null>(null);
	let modalError = $state<string | null>(null);
	let deleteConfirmOpen = $state(false);

	// Testing state
	let testingId = $state<string | null>(null);

	// Syncing state
	let syncingId = $state<string | null>(null);

	// SSE Connection - internally handles browser/SSR
	const sse = createSSE<AccountStreamEvents>(resolvePath('/api/livetv/accounts/stream'), {
		'accounts:initial': (payload) => {
			accounts = payload.accounts || [];
			loading = false;
		},
		'account:created': (payload) => {
			accounts = payload.accounts || [];
		},
		'account:updated': (payload) => {
			accounts = payload.accounts || [];
		},
		'account:deleted': (payload) => {
			accounts = payload.accounts || [];
		},
		'channels:syncStarted': (payload) => {
			syncingId = payload.accountId;
		},
		'channels:syncCompleted': (payload) => {
			if (syncingId === payload.accountId) {
				syncingId = null;
			}
		},
		'channels:syncFailed': (payload) => {
			if (syncingId === payload.accountId) {
				syncingId = null;
			}
		}
	});

	$effect(() => {
		layoutState.setMobileSseStatus(deriveMobileSseStatus(sse));
		return () => {
			layoutState.clearMobileSseStatus();
		};
	});

	// Load accounts on mount
	$effect(() => {
		loadAccounts();
	});

	async function loadAccounts(options: { foreground?: boolean } = {}) {
		const { foreground = true } = options;
		if (foreground) {
			loading = true;
			error = null;
		}

		try {
			const response = await fetch('/api/livetv/accounts');
			if (!response.ok) {
				throw new Error(m.livetv_accounts_failedToLoadAccounts());
			}
			const data = await response.json();
			accounts = data.accounts;
		} catch (e) {
			error = e instanceof Error ? e.message : m.livetv_accounts_failedToLoadAccounts();
		} finally {
			if (foreground) {
				loading = false;
			}
		}
	}

	async function refreshAccounts() {
		refreshing = true;
		await loadAccounts({ foreground: false });
		refreshing = false;
	}

	function openAddModal() {
		modalMode = 'add';
		editingAccount = null;
		modalError = null;
		modalOpen = true;
	}

	function openEditModal(account: LiveTvAccount) {
		modalMode = 'edit';
		editingAccount = account;
		modalError = null;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		editingAccount = null;
		modalError = null;
		deleteConfirmOpen = false;
	}

	async function handleSave(data: FormData) {
		saving = true;
		modalError = null;

		try {
			const url =
				modalMode === 'add' ? '/api/livetv/accounts' : `/api/livetv/accounts/${editingAccount!.id}`;
			const method = modalMode === 'add' ? 'POST' : 'PUT';

			// Build request body based on provider type
			const body: Record<string, unknown> = {
				name: data.name,
				providerType: data.providerType,
				enabled: data.enabled
			};

			switch (data.providerType) {
				case 'stalker':
					body.stalkerConfig = {
						portalUrl: data.portalUrl,
						macAddress: data.macAddress,
						epgUrl: data.epgUrl || undefined
					};
					break;
				case 'xstream': {
					const normalizedXstreamEpgUrl = data.epgUrl.trim();
					body.xstreamConfig = {
						baseUrl: data.baseUrl,
						username: data.username,
						password: data.password,
						// In edit mode, send empty string to explicitly clear an existing EPG URL.
						epgUrl: normalizedXstreamEpgUrl || (modalMode === 'edit' ? '' : undefined)
					};
					break;
				}
				case 'm3u':
					if (data.selectedCountries?.length) {
						// IPTV-Org mode
						body.providerType = 'iptvorg';
						body.iptvOrgConfig = {
							countries: data.selectedCountries
						};
					} else {
						const normalizedEpgUrl = data.epgUrl.trim();
						// Regular M3U mode
						body.m3uConfig = {
							url: data.url || undefined,
							fileContent: data.fileContent || undefined,
							// In edit mode, send empty string to explicitly clear an existing EPG URL.
							epgUrl: normalizedEpgUrl || (modalMode === 'edit' ? '' : undefined),
							autoRefresh: data.autoRefresh
						};
					}
					break;
			}

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || m.livetv_accounts_failedToSaveAccount());
			}

			closeModal();
			void loadAccounts({ foreground: false });
		} catch (e) {
			modalError = e instanceof Error ? e.message : m.livetv_accounts_failedToSaveAccount();
		} finally {
			saving = false;
		}
	}

	function handleDelete() {
		if (!editingAccount) return;
		deleteConfirmOpen = true;
	}

	function closeDeleteConfirm() {
		if (saving) return;
		deleteConfirmOpen = false;
	}

	function getTestSummary(result: LiveTvAccountTestResult): string | undefined {
		if (!result.profile) return undefined;

		const parts = [
			m.livetv_accounts_testSummaryChannels({
				count: result.profile.channelCount.toLocaleString()
			}),
			m.livetv_accounts_testSummaryCategories({
				count: result.profile.categoryCount.toLocaleString()
			})
		];

		const epgStatus = result.profile.epg?.status;
		if (epgStatus === 'reachable') {
			parts.push(m.livetv_accounts_epgReachable());
		} else if (epgStatus === 'unreachable') {
			const epgError = result.profile.epg?.error;
			parts.push(
				epgError
					? m.livetv_accounts_epgUnreachableWithError({ error: epgError })
					: m.livetv_accounts_epgUnreachable()
			);
		} else if (epgStatus === 'not_configured') {
			parts.push(m.livetv_accounts_epgNotConfigured());
		}

		return parts.join(' \u2022 ');
	}

	async function confirmDelete() {
		if (!editingAccount) return;

		saving = true;
		modalError = null;

		try {
			const response = await fetch(`/api/livetv/accounts/${editingAccount.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || m.livetv_accounts_failedToDeleteAccount());
			}

			await loadAccounts({ foreground: false });
			deleteConfirmOpen = false;
			closeModal();
		} catch (e) {
			modalError = e instanceof Error ? e.message : m.livetv_accounts_failedToDeleteAccount();
		} finally {
			saving = false;
		}
	}

	async function handleToggle(account: LiveTvAccount) {
		try {
			const response = await fetch(`/api/livetv/accounts/${account.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: !account.enabled })
			});

			if (!response.ok) {
				throw new Error(m.livetv_accounts_failedToUpdateAccount());
			}

			await loadAccounts({ foreground: false });
		} catch (e) {
			toasts.error(m.livetv_accounts_failedToUpdateAccount(), {
				description: e instanceof Error ? e.message : m.livetv_accounts_failedToUpdateAccount()
			});
		}
	}

	async function handleTest(account: LiveTvAccount) {
		testingId = account.id;

		try {
			const response = await fetch(`/api/livetv/accounts/${account.id}/test`, {
				method: 'POST'
			});

			const payload = await response.json();

			if (!response.ok) {
				throw new Error(
					toFriendlyLiveTvTestError(
						typeof payload?.error === 'string'
							? payload.error
							: m.livetv_accounts_failedToTestAccount(),
						account.providerType
					)
				);
			}

			const rawTestResult =
				payload?.result && typeof payload.result.success === 'boolean'
					? payload.result
					: payload && typeof payload.success === 'boolean'
						? payload
						: null;

			if (!rawTestResult) {
				throw new Error(m.livetv_accounts_invalidTestResponse());
			}
			const testResult = rawTestResult.success
				? rawTestResult
				: {
						...rawTestResult,
						error: toFriendlyLiveTvTestError(rawTestResult.error, account.providerType)
					};

			const now = new Date().toISOString();
			accounts = accounts.map((existing) => {
				if (existing.id !== account.id) return existing;

				return {
					...existing,
					lastTestedAt: now,
					lastTestSuccess: testResult.success,
					lastTestError: testResult.success ? null : (testResult.error ?? 'Unknown error'),
					...(testResult.success && testResult.profile
						? {
								playbackLimit: testResult.profile.playbackLimit,
								channelCount: testResult.profile.channelCount,
								categoryCount: testResult.profile.categoryCount,
								expiresAt: testResult.profile.expiresAt,
								serverTimezone: testResult.profile.serverTimezone
							}
						: {})
				};
			});

			if (testResult.success) {
				toasts.success(m.livetv_accounts_connectionTestPassed({ name: account.name }), {
					description: getTestSummary(testResult)
				});
			} else {
				toasts.error(m.livetv_accounts_connectionTestFailed({ name: account.name }), {
					description: testResult.error || m.livetv_accounts_unknownTestFailure()
				});
			}
		} catch (e) {
			toasts.error(m.livetv_accounts_connectionTestFailed({ name: account.name }), {
				description: toFriendlyLiveTvTestError(
					e instanceof Error ? e.message : m.livetv_accounts_failedToTestAccount(),
					account.providerType
				)
			});
		} finally {
			testingId = null;
		}
	}

	async function handleSync(account: LiveTvAccount) {
		syncingId = account.id;

		try {
			const response = await fetch('/api/livetv/channels/sync', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accountIds: [account.id] })
			});

			if (!response.ok) {
				throw new Error(m.livetv_accounts_failedToSyncAccount());
			}

			await loadAccounts({ foreground: false });
		} catch (e) {
			toasts.error(m.livetv_accounts_failedToSyncAccount(), {
				description: e instanceof Error ? e.message : m.livetv_accounts_failedToSyncAccount()
			});
		} finally {
			syncingId = null;
		}
	}

	async function handleTestConfig(config: TestConfig): Promise<LiveTvAccountTestResult> {
		const body: Record<string, unknown> = {
			providerType: config.providerType
		};

		switch (config.providerType) {
			case 'stalker':
				body.stalkerConfig = {
					portalUrl: config.portalUrl,
					macAddress: config.macAddress
				};
				break;
			case 'xstream':
				body.xstreamConfig = {
					baseUrl: config.baseUrl,
					username: config.username,
					password: config.password,
					epgUrl: config.epgUrl
				};
				break;
			case 'm3u':
				if (config.countries) {
					body.providerType = 'iptvorg';
					body.iptvOrgConfig = {
						countries: config.countries
					};
				} else {
					body.m3uConfig = {
						url: config.url,
						fileContent: config.fileContent,
						epgUrl: config.epgUrl
					};
				}
				break;
		}

		try {
			const response = await fetch('/api/livetv/accounts/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await response.json();

			if (!response.ok) {
				return {
					success: false,
					error: toFriendlyLiveTvTestError(
						typeof result?.error === 'string'
							? result.error
							: m.livetv_accounts_failedToTestConfig(),
						config.providerType
					)
				};
			}

			// API currently returns { success, result }, but keep backward compatibility
			// in case the endpoint returns LiveTvAccountTestResult directly.
			if (result?.result && typeof result.result.success === 'boolean') {
				const testResult = result.result as LiveTvAccountTestResult;
				return testResult.success
					? testResult
					: {
							...testResult,
							error: toFriendlyLiveTvTestError(testResult.error, config.providerType)
						};
			}

			if (typeof result?.success === 'boolean') {
				const testResult = result as LiveTvAccountTestResult;
				return testResult.success
					? testResult
					: {
							...testResult,
							error: toFriendlyLiveTvTestError(testResult.error, config.providerType)
						};
			}

			return {
				success: false,
				error: m.livetv_accounts_invalidTestEndpointResponse()
			};
		} catch (error) {
			return {
				success: false,
				error: toFriendlyLiveTvTestError(
					error instanceof Error ? error.message : m.livetv_accounts_failedToTestConfig(),
					config.providerType
				)
			};
		}
	}
</script>

<svelte:head>
	<title>{m.livetv_accounts_pageTitle()}</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">{m.livetv_accounts_heading()}</h1>
			<p class="mt-1 text-base-content/60">{m.livetv_accounts_subtitle()}</p>
		</div>
		<div class="flex w-full items-center gap-2 sm:w-auto">
			<!-- Connection Status -->
			<div class="hidden lg:block">
				{#if sse.isConnected}
					<span class="badge gap-1 badge-success">
						<Wifi class="h-3 w-3" />
						{m.common_live()}
					</span>
				{:else if sse.status === 'connecting' || sse.status === 'error'}
					<span class="badge gap-1 {sse.status === 'error' ? 'badge-error' : 'badge-warning'}">
						<Loader2 class="h-3 w-3 animate-spin" />
						{sse.status === 'error' ? m.common_reconnecting() : m.common_connecting()}
					</span>
				{:else}
					<span class="badge gap-1 badge-ghost">
						<WifiOff class="h-3 w-3" />
						{m.common_disconnected()}
					</span>
				{/if}
			</div>
			<button
				class="btn btn-ghost btn-sm"
				onclick={refreshAccounts}
				disabled={loading || refreshing}
				title={m.action_refresh()}
			>
				{#if refreshing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<RefreshCw class="h-4 w-4" />
				{/if}
			</button>
			<button class="btn flex-1 btn-sm btn-primary sm:flex-none" onclick={openAddModal}>
				<Plus class="h-4 w-4" />
				{m.livetv_accounts_addAccount()}
			</button>
		</div>
	</div>

	<!-- Content -->
	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if error}
		<div class="alert alert-error">
			<span>{error}</span>
			<button class="btn btn-ghost btn-sm" onclick={() => loadAccounts()}>{m.common_retry()}</button
			>
		</div>
	{:else}
		<LiveTvAccountTable
			{accounts}
			onEdit={openEditModal}
			onDelete={(account) => {
				editingAccount = account;
				handleDelete();
			}}
			onToggle={handleToggle}
			onTest={handleTest}
			onSync={handleSync}
			{testingId}
			{syncingId}
		/>
	{/if}
</div>

<!-- Account Modal -->
<LiveTvAccountModal
	open={modalOpen}
	mode={modalMode}
	account={editingAccount}
	{saving}
	error={modalError}
	onClose={closeModal}
	onSave={handleSave}
	onDelete={handleDelete}
	onTest={handleTestConfig}
/>

<ConfirmationModal
	open={deleteConfirmOpen}
	title={m.livetv_accounts_deleteAccountTitle()}
	messagePrefix={m.livetv_accounts_deleteAccountMessagePrefix()}
	messageEmphasis={editingAccount?.name ?? 'this account'}
	messageSuffix={m.livetv_accounts_deleteAccountMessageSuffix()}
	confirmLabel={m.common_delete()}
	confirmVariant="error"
	loading={saving}
	onConfirm={confirmDelete}
	onCancel={closeDeleteConfirm}
/>
