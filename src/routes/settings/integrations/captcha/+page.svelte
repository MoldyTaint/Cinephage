<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		Shield,
		RefreshCw,
		CheckCircle,
		AlertCircle,
		XCircle,
		Activity,
		Clock,
		Trash2,
		Play,
		Settings2,
		Globe
	} from 'lucide-svelte';

	interface SolverHealth {
		available: boolean;
		status: 'ready' | 'busy' | 'error' | 'disabled' | 'initializing';
		browserAvailable: boolean;
		error?: string;
		stats: {
			totalAttempts: number;
			successCount: number;
			failureCount: number;
			cacheHits: number;
			avgSolveTimeMs: number;
			cacheSize: number;
			lastSolveAt?: string;
			lastError?: string;
		};
	}

	interface SolverSettings {
		enabled: boolean;
		timeoutSeconds: number;
		cacheTtlSeconds: number;
		headless: boolean;
		proxyUrl: string;
		proxyUsername: string;
		proxyPassword: string;
	}

	// State
	let loading = $state(true);
	let saving = $state(false);
	let testing = $state(false);
	let clearing = $state(false);
	let health = $state<SolverHealth | null>(null);
	let settings = $state<SolverSettings>({
		enabled: false,
		timeoutSeconds: 60,
		cacheTtlSeconds: 3600,
		headless: true,
		proxyUrl: '',
		proxyUsername: '',
		proxyPassword: ''
	});
	let testUrl = $state('');
	let testResult = $state<{ success: boolean; message: string } | null>(null);
	let saveError = $state<string | null>(null);
	let saveSuccess = $state(false);

	// Load data on mount
	$effect(() => {
		loadData();
	});

	// Poll while initializing
	$effect(() => {
		if (health?.status !== 'initializing') return;

		const pollInterval = setInterval(async () => {
			try {
				const res = await fetch('/api/captcha-solver/health');
				if (res.ok) {
					const data = await res.json();
					health = data.health;
				}
			} catch {
				// Ignore errors during polling
			}
		}, 2000);

		return () => clearInterval(pollInterval);
	});

	async function loadData() {
		loading = true;
		try {
			const [healthRes, settingsRes] = await Promise.all([
				fetch('/api/captcha-solver/health'),
				fetch('/api/captcha-solver')
			]);

			if (healthRes.ok) {
				const data = await healthRes.json();
				health = data.health;
			}

			if (settingsRes.ok) {
				const data = await settingsRes.json();
				settings = data.settings;
			}
		} catch (error) {
			console.error('Failed to load captcha solver data:', error);
		} finally {
			loading = false;
		}
	}

	async function saveSettings() {
		saving = true;
		saveError = null;
		saveSuccess = false;

		try {
			const response = await fetch('/api/captcha-solver', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(settings)
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				saveError = result.error || 'Failed to save settings';
				return;
			}

			settings = result.settings;
			saveSuccess = true;
			await loadData();

			// Clear success after 3 seconds
			setTimeout(() => {
				saveSuccess = false;
			}, 3000);
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Failed to save settings';
		} finally {
			saving = false;
		}
	}

	async function testSolver() {
		if (!testUrl) return;
		testing = true;
		testResult = null;

		try {
			const response = await fetch('/api/captcha-solver/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: testUrl })
			});

			const result = await response.json();

			if (result.success) {
				if (result.hasChallenge) {
					testResult = {
						success: true,
						message: `Solved ${result.challengeType} challenge in ${result.solveTimeMs}ms`
					};
				} else {
					testResult = {
						success: true,
						message: result.message || 'No challenge detected for this URL'
					};
				}
			} else {
				testResult = {
					success: false,
					message: result.error || 'Test failed'
				};
			}

			// Refresh stats
			await loadData();
		} catch (error) {
			testResult = {
				success: false,
				message: error instanceof Error ? error.message : 'Test failed'
			};
		} finally {
			testing = false;
		}
	}

	async function clearCache() {
		clearing = true;
		try {
			const response = await fetch('/api/captcha-solver/health', {
				method: 'DELETE'
			});

			if (response.ok) {
				await loadData();
			}
		} catch (error) {
			console.error('Failed to clear cache:', error);
		} finally {
			clearing = false;
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function formatCacheTtl(seconds: number): string {
		if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
		if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
		return `${Math.round(seconds / 86400)} days`;
	}

	function getSuccessRate(): string {
		if (!health?.stats.totalAttempts) return '0%';
		const rate = (health.stats.successCount / health.stats.totalAttempts) * 100;
		return `${rate.toFixed(1)}%`;
	}
</script>

<svelte:head>
	<title>Captcha Solver - Cinephage</title>
</svelte:head>

<div class="container mx-auto max-w-4xl p-6">
	<div class="mb-6 flex items-center gap-3">
		<Shield size={28} class="text-primary" />
		<div>
			<h1 class="text-2xl font-bold">Captcha Solver</h1>
			<p class="text-base-content/70">Automated anti-bot protection bypass for indexers</p>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<RefreshCw size={24} class="animate-spin text-primary" />
		</div>
	{:else}
		<!-- Status Banner -->
		<div class="mb-6">
			{#if health?.status === 'initializing'}
				<div class="alert flex items-center gap-2 alert-info">
					<RefreshCw size={20} class="animate-spin" />
					<div>
						<span class="font-medium">Initializing</span>
						<p class="text-sm">Captcha solver is starting up, please wait...</p>
					</div>
				</div>
			{:else if health?.available}
				<div class="alert flex items-center gap-2 alert-success">
					<CheckCircle size={20} />
					<span>Captcha solver is enabled and ready</span>
					{#if health.status === 'busy'}
						<span class="badge badge-warning">Solving...</span>
					{/if}
				</div>
			{:else if settings.enabled && !health?.browserAvailable}
				<div class="alert flex items-center gap-2 alert-error">
					<XCircle size={20} />
					<div>
						<span class="font-medium">Browser not available</span>
						<p class="text-sm">
							{health?.error || 'Camoufox browser is not installed or failed to start'}
						</p>
					</div>
				</div>
			{:else}
				<div class="alert flex items-center gap-2 alert-warning">
					<AlertCircle size={20} />
					<span>Captcha solver is disabled</span>
				</div>
			{/if}
		</div>

		<!-- Statistics -->
		{#if health?.stats}
			<div class="card mb-6 bg-base-200">
				<div class="card-body">
					<h2 class="card-title">
						<Activity size={20} />
						Statistics
					</h2>

					<div class="stats stats-vertical bg-base-100 shadow lg:stats-horizontal">
						<div class="stat">
							<div class="stat-figure text-primary">
								<Activity size={24} />
							</div>
							<div class="stat-title">Success Rate</div>
							<div class="stat-value text-primary">{getSuccessRate()}</div>
							<div class="stat-desc">{health.stats.totalAttempts} total attempts</div>
						</div>

						<div class="stat">
							<div class="stat-figure text-secondary">
								<Clock size={24} />
							</div>
							<div class="stat-title">Avg Solve Time</div>
							<div class="stat-value text-secondary">
								{formatDuration(health.stats.avgSolveTimeMs)}
							</div>
						</div>

						<div class="stat">
							<div class="stat-figure text-accent">
								<Shield size={24} />
							</div>
							<div class="stat-title">Cache Hits</div>
							<div class="stat-value text-accent">{health.stats.cacheHits}</div>
							<div class="stat-desc">{health.stats.cacheSize} domains cached</div>
						</div>
					</div>

					<div class="mt-4 flex items-center justify-between">
						<div class="text-sm text-base-content/60">
							{#if health.stats.lastSolveAt}
								Last solve: {new Date(health.stats.lastSolveAt).toLocaleString()}
							{:else}
								No solves recorded yet
							{/if}
						</div>
						<button
							class="btn gap-2 btn-outline btn-sm"
							onclick={clearCache}
							disabled={clearing || health.stats.cacheSize === 0}
						>
							{#if clearing}
								<RefreshCw size={14} class="animate-spin" />
							{:else}
								<Trash2 size={14} />
							{/if}
							Clear Cache
						</button>
					</div>

					{#if health.stats.lastError}
						<div class="alert-sm mt-2 alert alert-error">
							<span class="text-sm">Last error: {health.stats.lastError}</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Test Solver -->
		<div class="card mb-6 bg-base-200">
			<div class="card-body">
				<h2 class="card-title">
					<Play size={20} />
					Test Solver
				</h2>
				<p class="mb-4 text-sm text-base-content/70">
					Test the captcha solver with a specific URL to verify it can handle the site's protection.
				</p>

				<div class="flex gap-2">
					<input
						type="url"
						bind:value={testUrl}
						placeholder="https://example.com"
						class="input-bordered input flex-1"
						disabled={testing || !settings.enabled}
					/>
					<button
						class="btn gap-2 btn-primary"
						onclick={testSolver}
						disabled={testing || !testUrl || !settings.enabled}
					>
						{#if testing}
							<RefreshCw size={16} class="animate-spin" />
							Testing...
						{:else}
							<Play size={16} />
							Test
						{/if}
					</button>
				</div>

				{#if testResult}
					<div class="mt-4 alert {testResult.success ? 'alert-success' : 'alert-error'}">
						{#if testResult.success}
							<CheckCircle size={16} />
						{:else}
							<XCircle size={16} />
						{/if}
						<span>{testResult.message}</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Settings -->
		<div class="card bg-base-200">
			<div class="card-body">
				<h2 class="card-title">
					<Settings2 size={20} />
					Settings
				</h2>

				{#if saveError}
					<div class="alert alert-error">
						<XCircle size={16} />
						<span>{saveError}</span>
					</div>
				{/if}

				{#if saveSuccess}
					<div class="alert alert-success">
						<CheckCircle size={16} />
						<span>Settings saved successfully</span>
					</div>
				{/if}

				<div class="mt-4 space-y-6">
					<!-- Enable Toggle -->
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-4">
							<input
								type="checkbox"
								bind:checked={settings.enabled}
								class="toggle toggle-primary"
							/>
							<div>
								<span class="label-text font-medium">Enable Captcha Solver</span>
								<p class="text-sm text-base-content/60">
									Automatically solve Cloudflare and other anti-bot challenges
								</p>
							</div>
						</label>
					</div>

					<!-- Headless Mode -->
					<div class="form-control">
						<label class="label cursor-pointer justify-start gap-4">
							<input
								type="checkbox"
								bind:checked={settings.headless}
								class="toggle toggle-secondary"
								disabled={!settings.enabled}
							/>
							<div>
								<span class="label-text font-medium">Headless Mode</span>
								<p class="text-sm text-base-content/60">
									Run browser in background without visible window (recommended)
								</p>
							</div>
						</label>
					</div>

					<div class="divider">Timing</div>

					<!-- Timeout -->
					<div class="form-control w-full max-w-xs">
						<label class="label" for="timeout">
							<span class="label-text">Solve Timeout</span>
						</label>
						<select
							id="timeout"
							bind:value={settings.timeoutSeconds}
							class="select-bordered select"
							disabled={!settings.enabled}
						>
							<option value={30}>30 seconds</option>
							<option value={60}>60 seconds (default)</option>
							<option value={90}>90 seconds</option>
							<option value={120}>2 minutes</option>
							<option value={180}>3 minutes</option>
						</select>
						<div class="label">
							<span class="label-text-alt text-base-content/50">
								Maximum time to wait for challenge resolution
							</span>
						</div>
					</div>

					<!-- Cache TTL -->
					<div class="form-control w-full max-w-xs">
						<label class="label" for="cacheTtl">
							<span class="label-text">Cache Duration</span>
						</label>
						<select
							id="cacheTtl"
							bind:value={settings.cacheTtlSeconds}
							class="select-bordered select"
							disabled={!settings.enabled}
						>
							<option value={1800}>30 minutes</option>
							<option value={3600}>1 hour (default)</option>
							<option value={7200}>2 hours</option>
							<option value={14400}>4 hours</option>
							<option value={28800}>8 hours</option>
							<option value={86400}>24 hours</option>
						</select>
						<div class="label">
							<span class="label-text-alt text-base-content/50">
								How long to cache solved cookies before re-solving
							</span>
						</div>
					</div>

					<div class="divider">
						<Globe size={16} />
						Proxy (Optional)
					</div>

					<!-- Proxy URL -->
					<div class="form-control w-full">
						<label class="label" for="proxyUrl">
							<span class="label-text">Proxy URL</span>
						</label>
						<input
							id="proxyUrl"
							type="text"
							bind:value={settings.proxyUrl}
							placeholder="http://proxy.example.com:8080"
							class="input-bordered input"
							disabled={!settings.enabled}
						/>
						<div class="label">
							<span class="label-text-alt text-base-content/50">
								HTTP/SOCKS5 proxy for browser connections
							</span>
						</div>
					</div>

					<!-- Proxy Auth -->
					{#if settings.proxyUrl}
						<div class="grid grid-cols-2 gap-4">
							<div class="form-control">
								<label class="label" for="proxyUsername">
									<span class="label-text">Proxy Username</span>
								</label>
								<input
									id="proxyUsername"
									type="text"
									bind:value={settings.proxyUsername}
									placeholder="Optional"
									class="input-bordered input"
									disabled={!settings.enabled}
								/>
							</div>
							<div class="form-control">
								<label class="label" for="proxyPassword">
									<span class="label-text">Proxy Password</span>
								</label>
								<input
									id="proxyPassword"
									type="password"
									bind:value={settings.proxyPassword}
									placeholder="Optional"
									class="input-bordered input"
									disabled={!settings.enabled}
								/>
							</div>
						</div>
					{/if}
				</div>

				<div class="mt-6 card-actions justify-end">
					<button class="btn gap-2 btn-primary" onclick={saveSettings} disabled={saving}>
						{#if saving}
							<RefreshCw size={16} class="animate-spin" />
							Saving...
						{:else}
							<CheckCircle size={16} />
							Save Settings
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Info Card -->
		<div class="card mt-6 bg-base-200">
			<div class="card-body">
				<h2 class="card-title">How It Works</h2>
				<div class="prose-sm prose max-w-none">
					<ol class="space-y-2">
						<li>
							<strong>Detection:</strong> When an indexer returns a challenge page (Cloudflare, DDoS-Guard,
							etc.), the solver is triggered.
						</li>
						<li>
							<strong>Browser Launch:</strong> A stealth browser instance is launched with fingerprint
							randomization to avoid detection.
						</li>
						<li>
							<strong>Challenge Solving:</strong> The browser navigates to the protected page and waits
							for the challenge to be solved (usually automatic).
						</li>
						<li>
							<strong>Cookie Extraction:</strong> Once solved, the clearance cookies are extracted and
							cached.
						</li>
						<li>
							<strong>Reuse:</strong> Subsequent requests to the same domain use the cached cookies until
							they expire.
						</li>
					</ol>
				</div>

				<div class="mt-4 alert alert-info">
					<span class="text-sm">
						The solver supports Cloudflare (JS Challenge, Turnstile), DDoS-Guard, and generic
						JavaScript challenges. CAPTCHA puzzles requiring human interaction are not supported.
					</span>
				</div>
			</div>
		</div>
	{/if}
</div>
