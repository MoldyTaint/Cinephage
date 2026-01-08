<script lang="ts">
	import { X, Loader2, Search, ChevronRight, ChevronLeft, Radio } from 'lucide-svelte';

	interface StalkerPortal {
		id: string;
		name: string;
		url: string;
		endpoint: string | null;
		lastScannedAt: string | null;
		enabled: boolean;
	}

	interface Props {
		open: boolean;
		onClose: () => void;
		onScanStarted: (workerId: string, portalId: string) => void;
	}

	let { open, onClose, onScanStarted }: Props = $props();

	// Steps
	type Step = 'portal' | 'config';
	let currentStep = $state<Step>('portal');

	// Portal state
	let portals = $state<StalkerPortal[]>([]);
	let loadingPortals = $state(false);
	let selectedPortalId = $state<string | null>(null);
	let creatingPortal = $state(false);
	let newPortalUrl = $state('');
	let newPortalName = $state('');
	let detectingPortal = $state(false);
	let portalError = $state<string | null>(null);

	// Scan config state
	type ScanType = 'random' | 'sequential' | 'import';
	let scanType = $state<ScanType>('random');

	// Random scan options
	let macPrefix = $state('00:1A:79');
	let macCount = $state(100);

	// Sequential scan options
	let macRangeStart = $state('');
	let macRangeEnd = $state('');

	// Import scan options
	let importedMacs = $state('');

	// Rate limit
	let rateLimit = $state(500);

	// Starting scan
	let startingScan = $state(false);
	let scanError = $state<string | null>(null);

	// MAC prefixes from MacGenerator
	const macPrefixes = [
		{ prefix: '00:1A:79', name: 'Magnum Semiconductors Ltd (MAG boxes)' },
		{ prefix: '00:2A:01', name: 'STB Device' },
		{ prefix: '00:1B:79', name: 'Magnum Semiconductors Ltd' },
		{ prefix: '00:2A:79', name: 'STB Device' },
		{ prefix: '00:A1:79', name: 'STB Device' },
		{ prefix: 'D4:CF:F9', name: 'STB Device' },
		{ prefix: '33:44:CF', name: 'STB Device' },
		{ prefix: '10:27:BE', name: 'STB Device' },
		{ prefix: 'A0:BB:3E', name: 'STB Device' },
		{ prefix: '55:93:EA', name: 'STB Device' },
		{ prefix: '04:D6:AA', name: 'STB Device' },
		{ prefix: '11:33:01', name: 'STB Device' },
		{ prefix: '00:1C:19', name: 'STB Device' },
		{ prefix: '1A:00:6A', name: 'STB Device' },
		{ prefix: '1A:00:FB', name: 'STB Device' }
	];

	// Derived
	const selectedPortal = $derived(portals.find((p) => p.id === selectedPortalId));
	const canProceedToConfig = $derived(
		selectedPortalId !== null || (newPortalUrl.trim() && newPortalName.trim())
	);

	const canStartScan = $derived(() => {
		if (!selectedPortalId && !newPortalUrl.trim()) return false;

		switch (scanType) {
			case 'random':
				return macCount > 0 && macCount <= 10000;
			case 'sequential':
				return isValidMac(macRangeStart) && isValidMac(macRangeEnd);
			case 'import':
				return importedMacs.trim().length > 0;
			default:
				return false;
		}
	});

	// Reset state when modal opens
	$effect(() => {
		if (open) {
			currentStep = 'portal';
			selectedPortalId = null;
			creatingPortal = false;
			newPortalUrl = '';
			newPortalName = '';
			portalError = null;
			scanType = 'random';
			macPrefix = '00:1A:79';
			macCount = 100;
			macRangeStart = '';
			macRangeEnd = '';
			importedMacs = '';
			rateLimit = 500;
			scanError = null;
			loadPortals();
		}
	});

	async function loadPortals() {
		loadingPortals = true;
		portalError = null;

		try {
			const response = await fetch('/api/livetv/portals');
			if (!response.ok) throw new Error('Failed to load portals');
			portals = await response.json();
		} catch (e) {
			portalError = e instanceof Error ? e.message : 'Failed to load portals';
		} finally {
			loadingPortals = false;
		}
	}

	async function detectPortal() {
		if (!newPortalUrl.trim()) return;

		detectingPortal = true;
		portalError = null;

		try {
			const response = await fetch('/api/livetv/portals/detect', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: newPortalUrl.trim() })
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to detect portal');
			}

			await response.json();
			// Auto-generate name from URL if not set
			if (!newPortalName.trim()) {
				try {
					const url = new URL(newPortalUrl);
					newPortalName = url.hostname;
				} catch {
					newPortalName = 'New Portal';
				}
			}
		} catch (e) {
			portalError = e instanceof Error ? e.message : 'Failed to detect portal';
		} finally {
			detectingPortal = false;
		}
	}

	function isValidMac(mac: string): boolean {
		const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
		return macRegex.test(mac);
	}

	function formatMacAddress(value: string): string {
		const hex = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
		const parts = hex.match(/.{1,2}/g) || [];
		return parts.slice(0, 6).join(':');
	}

	function handleMacInput(e: Event, which: 'start' | 'end') {
		const input = e.target as HTMLInputElement;
		const formatted = formatMacAddress(input.value);
		if (which === 'start') {
			macRangeStart = formatted;
		} else {
			macRangeEnd = formatted;
		}
	}

	async function handleStartScan() {
		startingScan = true;
		scanError = null;

		try {
			let portalId = selectedPortalId;

			// Create new portal if needed
			if (!portalId && newPortalUrl.trim()) {
				const createResponse = await fetch('/api/livetv/portals', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: newPortalName.trim(),
						url: newPortalUrl.trim()
					})
				});

				if (!createResponse.ok) {
					const data = await createResponse.json();
					throw new Error(data.error || 'Failed to create portal');
				}

				const newPortal = await createResponse.json();
				portalId = newPortal.id;
			}

			if (!portalId) {
				throw new Error('No portal selected');
			}

			// Build scan request - use 'type' to match API schema
			const scanRequest: Record<string, unknown> = {
				type: scanType,
				rateLimit
			};

			if (scanType === 'random') {
				scanRequest.macPrefix = macPrefix;
				scanRequest.macCount = macCount;
			} else if (scanType === 'sequential') {
				scanRequest.macRangeStart = macRangeStart;
				scanRequest.macRangeEnd = macRangeEnd;
			} else if (scanType === 'import') {
				scanRequest.macs = importedMacs
					.split(/[\n,;]+/)
					.map((m) => m.trim())
					.filter((m) => m.length > 0);
			}

			// Start the scan
			const scanResponse = await fetch(`/api/livetv/portals/${portalId}/scan`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(scanRequest)
			});

			if (!scanResponse.ok) {
				const data = await scanResponse.json();
				throw new Error(data.error || 'Failed to start scan');
			}

			const scanData = await scanResponse.json();
			onScanStarted(scanData.workerId, portalId);
		} catch (e) {
			scanError = e instanceof Error ? e.message : 'Failed to start scan';
		} finally {
			startingScan = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="modal-open modal">
		<div class="modal-box max-w-2xl">
			<!-- Header -->
			<div class="mb-6 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
						<Search class="h-5 w-5 text-primary" />
					</div>
					<div>
						<h3 class="text-xl font-bold">Scan for Accounts</h3>
						<div class="mt-1 flex items-center gap-2 text-sm text-base-content/60">
							<span
								class="badge badge-sm {currentStep === 'portal' ? 'badge-primary' : 'badge-ghost'}"
							>
								1. Portal
							</span>
							<ChevronRight class="h-3 w-3" />
							<span
								class="badge badge-sm {currentStep === 'config' ? 'badge-primary' : 'badge-ghost'}"
							>
								2. Configure
							</span>
						</div>
					</div>
				</div>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={onClose}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Step 1: Portal Selection -->
			{#if currentStep === 'portal'}
				<div class="space-y-4">
					{#if loadingPortals}
						<div class="flex items-center justify-center py-8">
							<Loader2 class="h-6 w-6 animate-spin text-primary" />
						</div>
					{:else}
						<!-- Existing Portals -->
						{#if portals.length > 0}
							<div class="space-y-2">
								<label class="label py-1">
									<span class="label-text font-medium">Select an existing portal</span>
								</label>
								<div class="space-y-2">
									{#each portals as portal (portal.id)}
										<button
											class="w-full rounded-lg border p-3 text-left transition-colors {selectedPortalId ===
											portal.id
												? 'border-primary bg-primary/5'
												: 'border-base-300 hover:border-primary/50'}"
											onclick={() => {
												selectedPortalId = portal.id;
												creatingPortal = false;
											}}
										>
											<div class="flex items-center justify-between">
												<div>
													<div class="font-medium">{portal.name}</div>
													<div class="text-sm text-base-content/60">{portal.url}</div>
												</div>
												{#if selectedPortalId === portal.id}
													<Radio class="h-5 w-5 text-primary" />
												{/if}
											</div>
										</button>
									{/each}
								</div>
							</div>

							<div class="divider">OR</div>
						{/if}

						<!-- Create New Portal -->
						<div class="space-y-3">
							<button
								class="w-full rounded-lg border p-3 text-left transition-colors {creatingPortal
									? 'border-primary bg-primary/5'
									: 'border-base-300 hover:border-primary/50'}"
								onclick={() => {
									creatingPortal = true;
									selectedPortalId = null;
								}}
							>
								<div class="font-medium">Add a new portal</div>
								<div class="text-sm text-base-content/60">Enter a portal URL to scan</div>
							</button>

							{#if creatingPortal}
								<div class="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">
									<div class="form-control">
										<label class="label py-1" for="portalUrl">
											<span class="label-text">Portal URL</span>
										</label>
										<div class="flex gap-2">
											<input
												id="portalUrl"
												type="url"
												class="input-bordered input input-sm flex-1"
												bind:value={newPortalUrl}
												placeholder="http://portal.example.com/c"
											/>
											<button
												class="btn btn-ghost btn-sm"
												onclick={detectPortal}
												disabled={detectingPortal || !newPortalUrl.trim()}
											>
												{#if detectingPortal}
													<Loader2 class="h-4 w-4 animate-spin" />
												{:else}
													Detect
												{/if}
											</button>
										</div>
									</div>

									<div class="form-control">
										<label class="label py-1" for="portalName">
											<span class="label-text">Portal Name</span>
										</label>
										<input
											id="portalName"
											type="text"
											class="input-bordered input input-sm"
											bind:value={newPortalName}
											placeholder="My Portal"
										/>
									</div>
								</div>
							{/if}
						</div>
					{/if}

					{#if portalError}
						<div class="alert text-sm alert-error">
							<span>{portalError}</span>
						</div>
					{/if}
				</div>

				<!-- Portal Step Actions -->
				<div class="modal-action">
					<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
					<button
						class="btn btn-primary"
						disabled={!canProceedToConfig}
						onclick={() => (currentStep = 'config')}
					>
						Next
						<ChevronRight class="h-4 w-4" />
					</button>
				</div>
			{/if}

			<!-- Step 2: Scan Configuration -->
			{#if currentStep === 'config'}
				<div class="space-y-6">
					<!-- Portal Info -->
					<div class="rounded-lg bg-base-200 p-3">
						<div class="text-sm text-base-content/60">Scanning portal:</div>
						<div class="font-medium">
							{selectedPortal?.name || newPortalName || 'New Portal'}
						</div>
						<div class="text-sm text-base-content/60">
							{selectedPortal?.url || newPortalUrl}
						</div>
					</div>

					<!-- Scan Type Selection -->
					<div class="form-control">
						<label class="label py-1">
							<span class="label-text font-medium">Scan Type</span>
						</label>
						<div class="flex flex-wrap gap-2">
							<button
								class="btn btn-sm {scanType === 'random' ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => (scanType = 'random')}
							>
								Random
							</button>
							<button
								class="btn btn-sm {scanType === 'sequential' ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => (scanType = 'sequential')}
							>
								Sequential
							</button>
							<button
								class="btn btn-sm {scanType === 'import' ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => (scanType = 'import')}
							>
								Import List
							</button>
						</div>
					</div>

					<!-- Random Scan Options -->
					{#if scanType === 'random'}
						<div class="space-y-4">
							<div class="form-control">
								<label class="label py-1" for="macPrefix">
									<span class="label-text">MAC Prefix</span>
								</label>
								<select
									id="macPrefix"
									class="select-bordered select select-sm"
									bind:value={macPrefix}
								>
									{#each macPrefixes as { prefix, name } (prefix)}
										<option value={prefix}>{prefix} - {name}</option>
									{/each}
								</select>
								<div class="label py-1">
									<span class="label-text-alt text-xs">
										Common prefixes for STB devices like MAG boxes
									</span>
								</div>
							</div>

							<div class="form-control">
								<label class="label py-1" for="macCount">
									<span class="label-text">Number of MACs to test</span>
								</label>
								<input
									id="macCount"
									type="number"
									class="input-bordered input input-sm w-32"
									bind:value={macCount}
									min="1"
									max="10000"
								/>
								<div class="label py-1">
									<span class="label-text-alt text-xs"> Maximum 10,000 per scan </span>
								</div>
							</div>
						</div>
					{/if}

					<!-- Sequential Scan Options -->
					{#if scanType === 'sequential'}
						<div class="space-y-4">
							<div class="form-control">
								<label class="label py-1" for="macStart">
									<span class="label-text">Start MAC</span>
								</label>
								<input
									id="macStart"
									type="text"
									class="input-bordered input input-sm font-mono"
									class:input-error={macRangeStart && !isValidMac(macRangeStart)}
									value={macRangeStart}
									oninput={(e) => handleMacInput(e, 'start')}
									placeholder="00:1A:79:00:00:00"
									maxlength="17"
								/>
							</div>

							<div class="form-control">
								<label class="label py-1" for="macEnd">
									<span class="label-text">End MAC</span>
								</label>
								<input
									id="macEnd"
									type="text"
									class="input-bordered input input-sm font-mono"
									class:input-error={macRangeEnd && !isValidMac(macRangeEnd)}
									value={macRangeEnd}
									oninput={(e) => handleMacInput(e, 'end')}
									placeholder="00:1A:79:FF:FF:FF"
									maxlength="17"
								/>
							</div>

							{#if isValidMac(macRangeStart) && isValidMac(macRangeEnd)}
								{@const startNum = parseInt(macRangeStart.replace(/:/g, ''), 16)}
								{@const endNum = parseInt(macRangeEnd.replace(/:/g, ''), 16)}
								{@const rangeSize = Math.abs(endNum - startNum) + 1}
								<div class="text-sm text-base-content/60">
									Range size: {rangeSize.toLocaleString()} MACs
									{#if rangeSize > 1000000}
										<span class="text-warning">(Large range - will take a while)</span>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<!-- Import Scan Options -->
					{#if scanType === 'import'}
						<div class="form-control">
							<label class="label py-1" for="importMacs">
								<span class="label-text">MAC Addresses</span>
							</label>
							<textarea
								id="importMacs"
								class="textarea-bordered textarea h-32 font-mono text-sm"
								bind:value={importedMacs}
								placeholder="00:1A:79:AB:CD:EF&#10;00:1A:79:12:34:56&#10;..."
							></textarea>
							<div class="label py-1">
								<span class="label-text-alt text-xs">
									One MAC address per line, or comma/semicolon separated
								</span>
							</div>
							{#if importedMacs.trim()}
								{@const count = importedMacs.split(/[\n,;]+/).filter((m) => m.trim()).length}
								<div class="text-sm text-base-content/60">
									{count} MAC address{count !== 1 ? 'es' : ''} detected
								</div>
							{/if}
						</div>
					{/if}

					<!-- Rate Limit -->
					<div class="form-control">
						<label class="label py-1" for="rateLimit">
							<span class="label-text">Delay between requests</span>
							<span class="label-text-alt">{rateLimit}ms</span>
						</label>
						<input
							id="rateLimit"
							type="range"
							class="range range-sm"
							bind:value={rateLimit}
							min="100"
							max="5000"
							step="100"
						/>
						<div class="label py-1">
							<span class="label-text-alt text-xs">
								Lower = faster but may trigger rate limiting
							</span>
						</div>
					</div>

					{#if scanError}
						<div class="alert text-sm alert-error">
							<span>{scanError}</span>
						</div>
					{/if}
				</div>

				<!-- Config Step Actions -->
				<div class="modal-action">
					<button class="btn btn-ghost" onclick={() => (currentStep = 'portal')}>
						<ChevronLeft class="h-4 w-4" />
						Back
					</button>
					<button class="btn btn-ghost" onclick={onClose}>Cancel</button>
					<button
						class="btn btn-primary"
						disabled={startingScan || !canStartScan()}
						onclick={handleStartScan}
					>
						{#if startingScan}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Search class="h-4 w-4" />
						{/if}
						Start Scan
					</button>
				</div>
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
