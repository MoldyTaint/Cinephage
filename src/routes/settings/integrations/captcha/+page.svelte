<script lang="ts">
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
	import { toasts } from '$lib/stores/toast.svelte';
	import * as m from '$lib/paraglide/messages.js';

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
			fetchAttempts: number;
			fetchSuccessCount: number;
			fetchFailureCount: number;
			avgFetchTimeMs: number;
			lastSolveAt?: string;
			lastFetchAt?: string;
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
			toasts.error(m.settings_integrations_captcha_failedToLoad(), {
				description:
					error instanceof Error ? error.message : m.settings_integrations_captcha_failedToLoad()
			});
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
			toasts.error(m.settings_integrations_captcha_failedToClearCache(), {
				description:
					error instanceof Error
						? error.message
						: m.settings_integrations_captcha_failedToClearCache()
			});
		} finally {
			clearing = false;
		}
	}

	function formatDuration(ms: number): string {
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function getSuccessRate(): string {
		if (!health?.stats.totalAttempts) return '0%';
		const rate = (health.stats.successCount / health.stats.totalAttempts) * 100;
		return `${rate.toFixed(1)}%`;
	}

	function getFetchSuccessRate(): string {
		if (!health?.stats.fetchAttempts) return '0%';
		const rate = (health.stats.fetchSuccessCount / health.stats.fetchAttempts) * 100;
		return `${rate.toFixed(1)}%`;
	}
</script>

<svelte:head>
	<title>{m.settings_integrations_captcha_pageTitle()}</title>
</svelte:head>

<div class="w-full p-4">
	<div class="mb-6">
		<div class="flex items-center gap-3">
			<Shield size={28} class="text-primary" />
			<div>
				<h1 class="text-2xl font-bold">{m.nav_captchaSolver()}</h1>
				<p class="mt-1 text-base-content/60">{m.settings_integrations_captcha_subtitle()}</p>
			</div>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<RefreshCw size={24} class="animate-spin text-primary" />
		</div>
	{:else}
		<div class="space-y-6">
			<!-- Status Banner -->
			<div>
				{#if health?.status === 'initializing'}
					<div class="alert flex items-center gap-2 alert-info">
						<RefreshCw size={20} class="animate-spin" />
						<div>
							<span class="font-medium">{m.settings_integrations_captcha_statusInitializing()}</span
							>
							<p class="text-sm">{m.settings_integrations_captcha_statusInitializingDesc()}</p>
						</div>
					</div>
				{:else if health?.available}
					<div class="alert flex items-center gap-2 alert-success">
						<CheckCircle size={20} />
						<span>{m.settings_integrations_captcha_statusReady()}</span>
						{#if health.status === 'busy'}
							<span class="badge badge-warning">{m.settings_integrations_captcha_statusBusy()}</span
							>
						{/if}
					</div>
				{:else if settings.enabled && !health?.browserAvailable}
					<div class="alert flex items-center gap-2 alert-error">
						<XCircle size={20} />
						<div>
							<span class="font-medium"
								>{m.settings_integrations_captcha_browserNotAvailable()}</span
							>
							<p class="text-sm">
								{health?.error || m.settings_integrations_captcha_browserNotAvailableDesc()}
							</p>
						</div>
					</div>
				{:else}
					<div class="alert flex items-center gap-2 alert-warning">
						<AlertCircle size={20} />
						<span>{m.settings_integrations_captcha_statusDisabled()}</span>
					</div>
				{/if}
			</div>

			<!-- Settings -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h2 class="card-title">
						<Settings2 size={20} />
						{m.nav_settings()}
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
							<span>{m.settings_integrations_captcha_settingsSaved()}</span>
						</div>
					{/if}

					<div class="mt-4 space-y-6">
						<!-- Enable Toggle -->
						<div class="form-control">
							<label
								class="label w-full cursor-pointer items-start justify-start gap-3 py-0 whitespace-normal"
							>
								<input
									type="checkbox"
									bind:checked={settings.enabled}
									class="toggle mt-0.5 shrink-0 toggle-primary"
								/>
								<div class="min-w-0">
									<span class="label-text block font-medium whitespace-normal">
										{m.settings_integrations_captcha_enableLabel()}
									</span>
									<p
										class="text-sm leading-relaxed wrap-break-word whitespace-normal text-base-content/60"
									>
										{m.settings_integrations_captcha_enableDesc()}
									</p>
								</div>
							</label>
						</div>

						<!-- Headless Mode -->
						<div class="form-control">
							<label
								class="label w-full cursor-pointer items-start justify-start gap-3 py-0 whitespace-normal"
							>
								<input
									type="checkbox"
									bind:checked={settings.headless}
									class="toggle mt-0.5 shrink-0 toggle-secondary"
									disabled={!settings.enabled}
								/>
								<div class="min-w-0">
									<span class="label-text block font-medium whitespace-normal">
										{m.settings_integrations_captcha_headlessLabel()}
									</span>
									<p
										class="text-sm leading-relaxed wrap-break-word whitespace-normal text-base-content/60"
									>
										{m.settings_integrations_captcha_headlessDesc()}
									</p>
								</div>
							</label>
						</div>

						<div class="divider">{m.settings_integrations_captcha_timing()}</div>

						<!-- Timeout -->
						<div class="form-control w-full max-w-xs">
							<label class="label" for="timeout">
								<span class="label-text">{m.settings_integrations_captcha_solveTimeout()}</span>
							</label>
							<select
								id="timeout"
								bind:value={settings.timeoutSeconds}
								class="select-bordered select"
								disabled={!settings.enabled}
							>
								<option value={30}>{m.settings_integrations_captcha_seconds30()}</option>
								<option value={60}>{m.settings_integrations_captcha_seconds60Default()}</option>
								<option value={90}>{m.settings_integrations_captcha_seconds90()}</option>
								<option value={120}>{m.settings_integrations_captcha_minutes2()}</option>
								<option value={180}>{m.settings_integrations_captcha_minutes3()}</option>
							</select>
							<div class="label">
								<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/50">
									{m.settings_integrations_captcha_solveTimeoutHelp()}
								</span>
							</div>
						</div>

						<!-- Cache TTL -->
						<div class="form-control w-full max-w-xs">
							<label class="label" for="cacheTtl">
								<span class="label-text">{m.settings_integrations_captcha_cacheDuration()}</span>
							</label>
							<select
								id="cacheTtl"
								bind:value={settings.cacheTtlSeconds}
								class="select-bordered select"
								disabled={!settings.enabled}
							>
								<option value={1800}>{m.settings_integrations_captcha_minutes30()}</option>
								<option value={3600}>{m.settings_integrations_captcha_hour1Default()}</option>
								<option value={7200}>{m.settings_integrations_captcha_hours2()}</option>
								<option value={14400}>{m.settings_integrations_captcha_hours4()}</option>
								<option value={28800}>{m.settings_integrations_captcha_hours8()}</option>
								<option value={86400}>{m.settings_integrations_captcha_hours24()}</option>
							</select>
							<div class="label">
								<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/50">
									{m.settings_integrations_captcha_cacheDurationHelp()}
								</span>
							</div>
						</div>

						<div class="divider">
							<Globe size={16} />
							{m.settings_integrations_captcha_proxyOptional()}
						</div>

						<!-- Proxy URL -->
						<div class="form-control w-full">
							<label class="label" for="proxyUrl">
								<span class="label-text">{m.settings_integrations_captcha_proxyUrl()}</span>
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
								<span class="label-text-alt wrap-break-word whitespace-normal text-base-content/50">
									{m.settings_integrations_captcha_proxyUrlHelp()}
								</span>
							</div>
						</div>

						<!-- Proxy Auth -->
						{#if settings.proxyUrl}
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<div class="form-control">
									<label class="label" for="proxyUsername">
										<span class="label-text">{m.settings_integrations_captcha_proxyUsername()}</span
										>
									</label>
									<input
										id="proxyUsername"
										type="text"
										bind:value={settings.proxyUsername}
										placeholder={m.settings_integrations_captcha_optional()}
										class="input-bordered input"
										disabled={!settings.enabled}
									/>
								</div>
								<div class="form-control">
									<label class="label" for="proxyPassword">
										<span class="label-text">{m.settings_integrations_captcha_proxyPassword()}</span
										>
									</label>
									<input
										id="proxyPassword"
										type="password"
										bind:value={settings.proxyPassword}
										placeholder={m.settings_integrations_captcha_optional()}
										class="input-bordered input"
										disabled={!settings.enabled}
									/>
								</div>
							</div>
						{/if}
					</div>

					<div class="mt-6 card-actions justify-end">
						<button
							class="btn w-full gap-2 btn-sm btn-primary sm:w-auto"
							onclick={saveSettings}
							disabled={saving}
						>
							{#if saving}
								<RefreshCw size={16} class="animate-spin" />
								{m.common_saving()}
							{:else}
								<CheckCircle size={16} />
								{m.settings_integrations_captcha_saveSettings()}
							{/if}
						</button>
					</div>
				</div>
			</div>

			<!-- Test Solver -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h2 class="card-title">
						<Play size={20} />
						{m.settings_integrations_captcha_testSolver()}
					</h2>
					<p class="mb-4 text-sm text-base-content/70">
						{m.settings_integrations_captcha_testSolverDesc()}
					</p>

					<div class="flex flex-col gap-2 sm:flex-row">
						<input
							type="url"
							bind:value={testUrl}
							placeholder="https://example.com"
							class="input-bordered input w-full sm:flex-1"
							disabled={testing || !settings.enabled}
						/>
						<button
							class="btn w-full gap-2 btn-sm btn-primary sm:w-auto"
							onclick={testSolver}
							disabled={testing || !testUrl || !settings.enabled}
						>
							{#if testing}
								<RefreshCw size={16} class="animate-spin" />
								{m.common_testing()}
							{:else}
								<Play size={16} />
								{m.action_test()}
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

			<!-- Statistics -->
			{#if health?.stats}
				<div class="card bg-base-100 shadow-xl">
					<div class="card-body">
						<h2 class="card-title">
							<Activity size={20} />
							{m.settings_integrations_captcha_statistics()}
						</h2>

						<div class="stats stats-vertical bg-base-100 shadow lg:stats-horizontal">
							<div class="stat">
								<div class="stat-figure text-primary">
									<Activity size={24} />
								</div>
								<div class="stat-title">{m.settings_integrations_captcha_solveSuccessRate()}</div>
								<div class="stat-value text-primary">{getSuccessRate()}</div>
								<div class="stat-desc">
									{m.settings_integrations_captcha_solvesAttempted({
										count: health.stats.totalAttempts
									})}
								</div>
							</div>

							<div class="stat">
								<div class="stat-figure text-secondary">
									<Clock size={24} />
								</div>
								<div class="stat-title">{m.settings_integrations_captcha_avgSolveTime()}</div>
								<div class="stat-value text-secondary">
									{formatDuration(health.stats.avgSolveTimeMs)}
								</div>
							</div>

							<div class="stat">
								<div class="stat-figure text-secondary">
									<Globe size={24} />
								</div>
								<div class="stat-title">{m.settings_integrations_captcha_fetchSuccessRate()}</div>
								<div class="stat-value text-secondary">{getFetchSuccessRate()}</div>
								<div class="stat-desc">
									{m.settings_integrations_captcha_fetchesAttempted({
										count: health.stats.fetchAttempts
									})}
								</div>
							</div>

							<div class="stat">
								<div class="stat-figure text-accent">
									<Shield size={24} />
								</div>
								<div class="stat-title">{m.settings_integrations_captcha_cacheHits()}</div>
								<div class="stat-value text-accent">{health.stats.cacheHits}</div>
								<div class="stat-desc">
									{m.settings_integrations_captcha_domainsCached({ count: health.stats.cacheSize })}
								</div>
							</div>
						</div>

						<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div class="text-sm text-base-content/60">
								{#if health.stats.lastSolveAt}
									{m.settings_integrations_captcha_lastSolve()}
									{new Date(health.stats.lastSolveAt).toLocaleString()}
								{:else if health.stats.lastFetchAt}
									{m.settings_integrations_captcha_lastFetch()}
									{new Date(health.stats.lastFetchAt).toLocaleString()}
								{:else}
									{m.settings_integrations_captcha_noActivity()}
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
								{m.settings_integrations_captcha_clearCache()}
							</button>
						</div>

						{#if health.stats.lastError}
							<div class="alert-sm mt-2 alert alert-error">
								<span class="text-sm"
									>{m.settings_integrations_captcha_lastError()} {health.stats.lastError}</span
								>
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Info Card -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h2 class="card-title">{m.settings_integrations_captcha_howItWorks()}</h2>
					<div class="prose-sm prose max-w-none">
						<ol class="space-y-2">
							<li>
								<strong>{m.settings_integrations_captcha_step1Label()}</strong>
								{m.settings_integrations_captcha_step1Desc()}
							</li>
							<li>
								<strong>{m.settings_integrations_captcha_step2Label()}</strong>
								{m.settings_integrations_captcha_step2Desc()}
							</li>
							<li>
								<strong>{m.settings_integrations_captcha_step3Label()}</strong>
								{m.settings_integrations_captcha_step3Desc()}
							</li>
							<li>
								<strong>{m.settings_integrations_captcha_step4Label()}</strong>
								{m.settings_integrations_captcha_step4Desc()}
							</li>
							<li>
								<strong>{m.settings_integrations_captcha_step5Label()}</strong>
								{m.settings_integrations_captcha_step5Desc()}
							</li>
						</ol>
					</div>

					<div class="mt-4 alert alert-info">
						<span class="text-sm">
							{m.settings_integrations_captcha_supportedChallenges()}
						</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
