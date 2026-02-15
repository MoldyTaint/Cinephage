<script lang="ts">
	import { Plus, RefreshCw, Loader2, Wifi, WifiOff } from 'lucide-svelte';
	import { LiveTvAccountTable, LiveTvAccountModal } from '$lib/components/livetv';
	import type { LiveTvAccount, LiveTvAccountTestResult } from '$lib/types/livetv';
	import type { FormData, TestConfig } from '$lib/components/livetv/LiveTvAccountModal.svelte';
	import { onMount } from 'svelte';
	import { createSSE } from '$lib/sse';
	import { mobileSSEStatus } from '$lib/sse/mobileStatus.svelte';
	import { resolvePath } from '$lib/utils/routing';

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

	// Testing state
	let testingId = $state<string | null>(null);

	// Syncing state
	let syncingId = $state<string | null>(null);

	// SSE Connection - internally handles browser/SSR
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const sse = createSSE<Record<string, any>>(resolvePath('/api/livetv/accounts/stream'), {
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

	const MOBILE_SSE_SOURCE = 'livetv-accounts';

	$effect(() => {
		mobileSSEStatus.publish(MOBILE_SSE_SOURCE, sse.status);
		return () => {
			mobileSSEStatus.clear(MOBILE_SSE_SOURCE);
		};
	});

	// Load accounts on mount
	onMount(() => {
		loadAccounts();

		return () => {
			sse.close();
		};
	});

	async function loadAccounts() {
		loading = true;
		error = null;

		try {
			const response = await fetch('/api/livetv/accounts');
			if (!response.ok) {
				throw new Error('Failed to load accounts');
			}
			const data = await response.json();
			accounts = data.accounts;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load accounts';
		} finally {
			loading = false;
		}
	}

	async function refreshAccounts() {
		refreshing = true;
		await loadAccounts();
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
				case 'xstream':
					body.xstreamConfig = {
						baseUrl: data.baseUrl,
						username: data.username,
						password: data.password,
						epgUrl: data.epgUrl || undefined
					};
					break;
				case 'm3u':
					if (data.selectedCountries?.length) {
						// IPTV-Org mode
						body.providerType = 'iptvorg';
						body.iptvOrgConfig = {
							countries: data.selectedCountries
						};
					} else {
						// Regular M3U mode
						body.m3uConfig = {
							url: data.url || undefined,
							fileContent: data.fileContent || undefined,
							epgUrl: data.epgUrl || undefined,
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
				throw new Error(result.error || 'Failed to save account');
			}

			await loadAccounts();
			closeModal();
		} catch (e) {
			modalError = e instanceof Error ? e.message : 'Failed to save account';
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!editingAccount) return;

		const confirmed = confirm(`Are you sure you want to delete "${editingAccount.name}"?`);
		if (!confirmed) return;

		saving = true;
		modalError = null;

		try {
			const response = await fetch(`/api/livetv/accounts/${editingAccount.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to delete account');
			}

			await loadAccounts();
			closeModal();
		} catch (e) {
			modalError = e instanceof Error ? e.message : 'Failed to delete account';
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
				throw new Error('Failed to update account');
			}

			await loadAccounts();
		} catch (e) {
			console.error('Failed to toggle account:', e);
		}
	}

	async function handleTest(account: LiveTvAccount) {
		testingId = account.id;

		try {
			const response = await fetch(`/api/livetv/accounts/${account.id}/test`, {
				method: 'POST'
			});

			if (!response.ok) {
				throw new Error('Failed to test account');
			}

			await loadAccounts();
		} catch (e) {
			console.error('Failed to test account:', e);
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
				throw new Error('Failed to sync account');
			}

			await loadAccounts();
		} catch (e) {
			console.error('Failed to sync account:', e);
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
					password: config.password
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
						fileContent: config.fileContent
					};
				}
				break;
		}

		const response = await fetch('/api/livetv/accounts/test', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		return response.json();
	}
</script>

<svelte:head>
	<title>Live TV Accounts - Cinephage</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">Live TV Accounts</h1>
			<p class="mt-1 text-base-content/60">Manage your IPTV accounts (Stalker, XStream, M3U)</p>
		</div>
		<div class="flex items-center gap-2">
			<!-- Connection Status -->
			<div class="hidden lg:block">
				{#if sse.isConnected}
					<span class="badge gap-1 badge-success">
						<Wifi class="h-3 w-3" />
						Live
					</span>
				{:else if sse.status === 'connecting' || sse.status === 'error'}
					<span class="badge gap-1 {sse.status === 'error' ? 'badge-error' : 'badge-warning'}">
						<Loader2 class="h-3 w-3 animate-spin" />
						{sse.status === 'error' ? 'Reconnecting...' : 'Connecting...'}
					</span>
				{:else}
					<span class="badge gap-1 badge-ghost">
						<WifiOff class="h-3 w-3" />
						Disconnected
					</span>
				{/if}
			</div>
			<button
				class="btn btn-ghost btn-sm"
				onclick={refreshAccounts}
				disabled={loading || refreshing}
				title="Refresh"
			>
				{#if refreshing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<RefreshCw class="h-4 w-4" />
				{/if}
			</button>
			<button class="btn btn-sm btn-primary" onclick={openAddModal}>
				<Plus class="h-4 w-4" />
				Add Account
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
			<button class="btn btn-ghost btn-sm" onclick={loadAccounts}>Retry</button>
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
