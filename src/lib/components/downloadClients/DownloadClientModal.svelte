<script lang="ts">
	import { X, Loader2, XCircle } from 'lucide-svelte';
	import type {
		DownloadClient,
		DownloadClientFormData,
		DownloadClientImplementation,
		ConnectionTestResult
	} from '$lib/types/downloadClient';
	import FolderBrowser from '$lib/components/FolderBrowser.svelte';
	import { SectionHeader, TestResult } from '$lib/components/ui/modal';
	import { clientDefinitions } from './forms/clientDefinitions';
	import NntpServerSettings from './forms/NntpServerSettings.svelte';
	import DownloadClientSettings from './forms/DownloadClientSettings.svelte';

	// NNTP server form data type
	interface NntpServerFormData {
		name: string;
		host: string;
		port: number;
		useSsl: boolean;
		username: string | null;
		password: string | null;
		maxConnections: number;
		priority: number;
		enabled: boolean;
	}

	// NNTP server type for editing
	interface NntpServer {
		id: string;
		name: string;
		host: string;
		port: number;
		useSsl: boolean | null;
		username: string | null;
		hasPassword?: boolean;
		maxConnections: number | null;
		priority: number | null;
		enabled: boolean | null;
	}

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		client?: DownloadClient | NntpServer | null;
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: DownloadClientFormData | NntpServerFormData, isNntp: boolean) => void;
		onDelete?: () => void;
		onTest: (
			data: DownloadClientFormData | NntpServerFormData,
			isNntp: boolean
		) => Promise<ConnectionTestResult>;
	}

	let {
		open,
		mode,
		client = null,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete,
		onTest
	}: Props = $props();

	// Form state - Implementation selection (defaults only, effect syncs from props)
	let implementation = $state<DownloadClientImplementation | ''>('');

	// Form state - Basic
	let name = $state('');
	let enabled = $state(true);
	let host = $state('localhost');
	let port = $state(8080);
	let useSsl = $state(false);
	let username = $state('');
	let password = $state('');

	// Form state - Categories
	let movieCategory = $state('movies');
	let tvCategory = $state('tv');

	// Form state - Priority & State
	let recentPriority = $state<'normal' | 'high' | 'force'>('normal');
	let olderPriority = $state<'normal' | 'high' | 'force'>('normal');
	let initialState = $state<'start' | 'pause' | 'force'>('start');

	// Form state - Path
	let downloadPathLocal = $state('');

	// Form state - Priority order
	let priority = $state(1);

	// Form state - NNTP specific
	let maxConnections = $state(10);

	// UI state
	let testing = $state(false);
	let testResult = $state<ConnectionTestResult | null>(null);
	let showFolderBrowser = $state(false);

	// Derived
	const modalTitle = $derived(mode === 'add' ? 'Add Download Client' : 'Edit Download Client');
	const hasPassword = $derived(client?.hasPassword ?? false);
	const selectedDefinition = $derived(
		implementation ? clientDefinitions.find((d) => d.id === implementation) : null
	);
	// Check if selected client uses API key auth (SABnzbd)
	const usesApiKey = $derived(
		selectedDefinition?.protocol === 'usenet' && selectedDefinition?.id === 'sabnzbd'
	);
	// Check if this is an NNTP server
	const isNntpServer = $derived(implementation === 'nntp');

	// Reset form when modal opens or client changes
	$effect(() => {
		if (open) {
			// Check if editing an NNTP server (has maxConnections but no movieCategory)
			const isNntpEdit = client && 'maxConnections' in client && !('movieCategory' in client);
			implementation = isNntpEdit ? 'nntp' : ((client as DownloadClient)?.implementation ?? '');
			name = client?.name ?? '';
			enabled = client?.enabled ?? true;
			host = client?.host ?? 'localhost';
			port = client?.port ?? (isNntpEdit ? 563 : 8080);
			useSsl = client?.useSsl ?? (isNntpEdit ? true : false);
			username = client?.username ?? '';
			password = '';

			// Download client fields
			const dcClient = client as DownloadClient | undefined;
			movieCategory = dcClient?.movieCategory ?? 'movies';
			tvCategory = dcClient?.tvCategory ?? 'tv';
			recentPriority = dcClient?.recentPriority ?? 'normal';
			olderPriority = dcClient?.olderPriority ?? 'normal';
			initialState = dcClient?.initialState ?? 'start';
			downloadPathLocal = dcClient?.downloadPathLocal ?? '';

			// NNTP-specific fields
			const nntpClient = client as NntpServer | undefined;
			maxConnections = nntpClient?.maxConnections ?? 10;

			// Priority (used by both types)
			priority = client?.priority ?? 1;

			testResult = null;
			showFolderBrowser = false;
		}
	});

	function handleImplementationChange(newImpl: DownloadClientImplementation | 'nntp') {
		implementation = newImpl as DownloadClientImplementation;
		if (mode === 'add') {
			const def = clientDefinitions.find((d) => d.id === newImpl);
			if (def) {
				port = def.defaultPort;
				name = def.name;
				// NNTP defaults to SSL on
				if (newImpl === 'nntp') {
					useSsl = true;
				}
			}
		}
	}

	// Auto-update port when SSL changes for NNTP
	function handleSslChange() {
		if (isNntpServer && mode === 'add') {
			port = useSsl ? 563 : 119;
		}
	}

	function getFormData(): DownloadClientFormData | NntpServerFormData {
		if (isNntpServer) {
			const data: NntpServerFormData = {
				name,
				host,
				port,
				useSsl,
				username: username || null,
				password: password || null,
				maxConnections,
				priority,
				enabled
			};
			// In edit mode, only include password if user actually typed something new
			if (mode === 'edit' && !password) {
				delete (data as unknown as Record<string, unknown>).password;
			}
			return data;
		}

		return {
			name,
			implementation: implementation as DownloadClientImplementation,
			enabled,
			host,
			port,
			useSsl,
			username: username || null,
			password: password || null,
			movieCategory,
			tvCategory,
			recentPriority,
			olderPriority,
			initialState,
			seedRatioLimit: null,
			seedTimeLimit: null,
			downloadPathLocal: downloadPathLocal || null,
			priority
		};
	}

	async function handleTest() {
		testing = true;
		testResult = null;
		try {
			testResult = await onTest(getFormData(), isNntpServer);
		} finally {
			testing = false;
		}
	}

	function handleSave() {
		onSave(getFormData(), isNntpServer);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (showFolderBrowser) {
				showFolderBrowser = false;
			} else {
				onClose();
			}
		}
	}

	function handleFolderSelect(path: string) {
		downloadPathLocal = path;
		showFolderBrowser = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-h-[90vh] max-w-3xl overflow-y-auto">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<h3 class="text-xl font-bold">{modalTitle}</h3>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Client Type Selection (only in add mode when not selected) -->
			{#if mode === 'add' && !implementation}
				<div class="space-y-4">
					<p class="text-base-content/70">Select the type of download client you want to add:</p>

					<div class="grid grid-cols-2 gap-3">
						{#each clientDefinitions as def (def.id)}
							<button
								type="button"
								class="card cursor-pointer border-2 border-transparent bg-base-200 text-left transition-all hover:border-primary hover:bg-primary/10"
								onclick={() => handleImplementationChange(def.id)}
							>
								<div class="card-body p-4">
									<div class="flex items-start justify-between gap-2">
										<div class="flex-1">
											<div class="flex items-center gap-2">
												<h3 class="font-semibold">{def.name}</h3>
												<span
													class="badge badge-sm {def.protocol === 'usenet'
														? 'badge-secondary'
														: 'badge-primary'}"
												>
													{def.protocol}
												</span>
											</div>
											<p class="mt-1 text-sm text-base-content/60">{def.description}</p>
										</div>
										<div class="badge badge-outline badge-sm">:{def.defaultPort}</div>
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>

				<div class="modal-action">
					<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
				</div>
			{:else}
				<!-- Selected client header (in add mode) -->
				{#if mode === 'add' && selectedDefinition}
					<div class="mb-6 flex items-center justify-between rounded-lg bg-base-200 px-4 py-3">
						<div class="flex items-center gap-3">
							<div class="font-semibold">{selectedDefinition.name}</div>
							<div class="badge badge-ghost badge-sm">Port {selectedDefinition.defaultPort}</div>
						</div>
						<button
							type="button"
							class="btn btn-ghost btn-sm"
							onclick={() => (implementation = '')}
						>
							Change Type
						</button>
					</div>
				{/if}

				<!-- Folder Browser Overlay -->
				{#if showFolderBrowser}
					<div class="mb-6">
						<FolderBrowser
							value={downloadPathLocal || '/'}
							onSelect={handleFolderSelect}
							onCancel={() => (showFolderBrowser = false)}
						/>
					</div>
				{:else}
					<!-- Main Form - Two Column Layout -->
					<div class="grid grid-cols-2 gap-6">
						<!-- Left Column: Connection -->
						<div class="space-y-4">
							<SectionHeader title="Connection" />

							<div class="form-control">
								<label class="label py-1" for="name">
									<span class="label-text">Name</span>
								</label>
								<input
									id="name"
									type="text"
									class="input-bordered input input-sm"
									bind:value={name}
									placeholder={selectedDefinition?.name ?? 'My Download Client'}
								/>
							</div>

							<div class="grid grid-cols-2 gap-3">
								<div class="form-control">
									<label class="label py-1" for="host">
										<span class="label-text">Host</span>
									</label>
									<input
										id="host"
										type="text"
										class="input-bordered input input-sm"
										bind:value={host}
										placeholder="localhost"
									/>
								</div>

								<div class="form-control">
									<label class="label py-1" for="port">
										<span class="label-text">Port</span>
									</label>
									<input
										id="port"
										type="number"
										class="input-bordered input input-sm"
										bind:value={port}
										min="1"
										max="65535"
									/>
								</div>
							</div>

							{#if usesApiKey}
								<!-- API Key auth for SABnzbd -->
								<div class="form-control">
									<label class="label py-1" for="password">
										<span class="label-text">
											API Key
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
										placeholder={mode === 'edit' && hasPassword
											? '********'
											: 'Find in SABnzbd Config > General'}
									/>
									<div class="label py-1">
										<span class="label-text-alt text-xs">
											Found in SABnzbd Config &gt; General &gt; API Key
										</span>
									</div>
								</div>
							{:else}
								<!-- Username/password auth for torrent clients and NZBGet -->
								<div class="grid grid-cols-2 gap-3">
									<div class="form-control">
										<label class="label py-1" for="username">
											<span class="label-text">Username</span>
										</label>
										<input
											id="username"
											type="text"
											class="input-bordered input input-sm"
											bind:value={username}
											placeholder="admin"
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
											placeholder={mode === 'edit' && hasPassword ? '********' : ''}
										/>
									</div>
								</div>
							{/if}

							<div class="flex gap-4">
								<label class="label cursor-pointer gap-2">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										bind:checked={useSsl}
										onchange={handleSslChange}
									/>
									<span class="label-text">Use SSL</span>
								</label>

								<label class="label cursor-pointer gap-2">
									<input type="checkbox" class="checkbox checkbox-sm" bind:checked={enabled} />
									<span class="label-text">Enabled</span>
								</label>
							</div>
						</div>

						<!-- Right Column: Settings -->
						<div class="space-y-4">
							{#if isNntpServer}
								<NntpServerSettings bind:maxConnections bind:priority />
							{:else}
								<DownloadClientSettings
									definition={selectedDefinition}
									bind:movieCategory
									bind:tvCategory
									bind:recentPriority
									bind:olderPriority
									bind:initialState
									bind:downloadPathLocal
									onBrowse={() => (showFolderBrowser = true)}
								/>
							{/if}
						</div>
					</div>

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
						result={testResult}
						successDetails={testResult?.greeting
							? `Server greeting: ${testResult.greeting}`
							: testResult?.details
								? `Version: ${testResult.details.version} (API ${testResult.details.apiVersion})${testResult.details.savePath ? ` | Save Path: ${testResult.details.savePath}` : ''}`
								: undefined}
					/>
				{/if}

				<!-- Actions -->
				{#if !showFolderBrowser}
					<div class="modal-action">
						{#if mode === 'edit' && onDelete}
							<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
						{/if}

						<button
							class="btn btn-ghost"
							onclick={handleTest}
							disabled={testing || saving || !host || !name || !implementation}
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
							disabled={saving || !host || !name || !implementation}
						>
							{#if saving}
								<Loader2 class="h-4 w-4 animate-spin" />
							{/if}
							Save
						</button>
					</div>
				{/if}
			{/if}
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={onClose}
			aria-label="Close modal"
		></button>
	</div>
{/if}
