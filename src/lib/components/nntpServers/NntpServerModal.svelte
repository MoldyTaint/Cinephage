<script lang="ts">
	import { X, Loader2, XCircle } from 'lucide-svelte';
	import { SectionHeader, TestResult } from '$lib/components/ui/modal';
	import ModalWrapper from '$lib/components/ui/modal/ModalWrapper.svelte';

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

	interface ConnectionTestResult {
		success: boolean;
		error?: string;
		greeting?: string;
	}

	interface Props {
		open: boolean;
		mode: 'add' | 'edit';
		server?: NntpServer | null;
		saving: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (data: NntpServerFormData) => void;
		onDelete?: () => void;
		onTest: (data: NntpServerFormData) => Promise<ConnectionTestResult>;
	}

	let {
		open,
		mode,
		server = null,
		saving,
		error = null,
		onClose,
		onSave,
		onDelete,
		onTest
	}: Props = $props();

	// Form state
	let name = $state('');
	let host = $state('');
	let port = $state(563);
	let useSsl = $state(true);
	let username = $state('');
	let password = $state('');
	let maxConnections = $state(10);
	let priority = $state(1);
	let enabled = $state(true);

	// UI state
	let testing = $state(false);
	let testResult = $state<ConnectionTestResult | null>(null);
	const MAX_NAME_LENGTH = 15;
	const nameTooLong = $derived(name.length > MAX_NAME_LENGTH);

	// Derived
	const modalTitle = $derived(mode === 'add' ? 'Add Usenet Server' : 'Edit Usenet Server');
	const hasPassword = $derived(server?.hasPassword ?? false);

	// Reset form when modal opens or server changes
	$effect(() => {
		if (open) {
			name = server?.name ?? '';
			host = server?.host ?? '';
			port = server?.port ?? 563;
			useSsl = server?.useSsl ?? true;
			username = server?.username ?? '';
			password = '';
			maxConnections = server?.maxConnections ?? 10;
			priority = server?.priority ?? 1;
			enabled = server?.enabled ?? true;
			testResult = null;
		}
	});

	// Auto-update port when SSL changes (in add mode)
	function handleSslChange() {
		if (mode === 'add') {
			port = useSsl ? 563 : 119;
		}
	}

	function getFormData(): NntpServerFormData {
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
		// This prevents accidentally clearing existing passwords
		if (mode === 'edit' && !password) {
			// Remove password from payload to preserve existing value
			delete (data as unknown as Record<string, unknown>).password;
		}

		return data;
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

<ModalWrapper {open} {onClose} maxWidth="2xl" labelledBy="nntp-server-modal-title">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<h3 id="nntp-server-modal-title" class="text-xl font-bold">{modalTitle}</h3>
		<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
			<X class="h-4 w-4" />
		</button>
	</div>

	<!-- Main Form - Responsive Two Column Layout -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
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
					maxlength={MAX_NAME_LENGTH}
					placeholder="My Usenet Server"
				/>
				<div class="label py-1">
					<span
						class="label-text-alt text-xs {nameTooLong ? 'text-error' : 'text-base-content/60'}"
					>
						{name.length}/{MAX_NAME_LENGTH}
					</span>
					{#if nameTooLong}
						<span class="label-text-alt text-xs text-error">Max {MAX_NAME_LENGTH} characters.</span>
					{/if}
				</div>
			</div>

			<div class="grid grid-cols-2 gap-2 sm:gap-3">
				<div class="form-control">
					<label class="label py-1" for="host">
						<span class="label-text">Host</span>
					</label>
					<input
						id="host"
						type="text"
						class="input-bordered input input-sm"
						bind:value={host}
						placeholder="news.example.com"
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
						placeholder="(optional)"
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
						placeholder={mode === 'edit' && hasPassword ? '********' : '(optional)'}
					/>
				</div>
			</div>

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
			<SectionHeader title="Settings" />

			<div class="form-control">
				<label class="label py-1" for="maxConnections">
					<span class="label-text">Max Connections</span>
				</label>
				<input
					id="maxConnections"
					type="number"
					class="input-bordered input input-sm"
					bind:value={maxConnections}
					min="1"
					max="50"
				/>
				<div class="label py-1">
					<span class="label-text-alt text-xs">
						Check your usenet provider for connection limits (usually 10-50)
					</span>
				</div>
			</div>

			<div class="form-control">
				<label class="label py-1" for="priority">
					<span class="label-text">Priority</span>
				</label>
				<input
					id="priority"
					type="number"
					class="input-bordered input input-sm"
					bind:value={priority}
					min="0"
					max="99"
				/>
				<div class="label py-1">
					<span class="label-text-alt text-xs">
						Lower values = higher priority. Use for server failover.
					</span>
				</div>
			</div>
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
		successDetails={testResult?.greeting ? `Server greeting: ${testResult.greeting}` : undefined}
	/>

	<!-- Actions -->
	<div class="modal-action">
		{#if mode === 'edit' && onDelete}
			<button class="btn mr-auto btn-outline btn-error" onclick={onDelete}>Delete</button>
		{/if}

		<button
			class="btn btn-ghost"
			onclick={handleTest}
			disabled={testing || saving || !host || !name || nameTooLong}
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
			disabled={saving || !host || !name || nameTooLong}
		>
			{#if saving}
				<Loader2 class="h-4 w-4 animate-spin" />
			{/if}
			Save
		</button>
	</div>
</ModalWrapper>
