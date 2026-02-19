<script lang="ts">
	import { AlertTriangle, CheckCircle, XCircle } from 'lucide-svelte';
	import type { DownloadClientHealth } from '$lib/types/downloadClient';

	interface Props {
		enabled: boolean | null;
		health?: DownloadClientHealth;
		consecutiveFailures?: number;
		lastFailure?: string;
		lastFailureMessage?: string;
	}

	let {
		enabled,
		health = 'healthy',
		consecutiveFailures = 0,
		lastFailure,
		lastFailureMessage: _lastFailureMessage
	}: Props = $props();

	const statusInfo = $derived.by(() => {
		if (!enabled) {
			return {
				text: 'Disabled',
				class: 'badge-ghost',
				icon: XCircle,
				tooltip: 'Download client is disabled by user'
			};
		}

		if (health === 'failing' || consecutiveFailures >= 3) {
			const failureTime = lastFailure ? new Date(lastFailure).toLocaleString() : 'Unknown';
			return {
				text: 'Unhealthy',
				class: 'badge-error',
				icon: AlertTriangle,
				tooltip: `${consecutiveFailures} consecutive failures. Last: ${failureTime}`
			};
		}

		if (health === 'warning' || consecutiveFailures >= 1) {
			const failureTime = lastFailure ? new Date(lastFailure).toLocaleString() : 'Unknown';
			return {
				text: 'Degraded',
				class: 'badge-warning',
				icon: AlertTriangle,
				tooltip: `${consecutiveFailures} recent failures. Last: ${failureTime}`
			};
		}

		return {
			text: 'Healthy',
			class: 'badge-success',
			icon: CheckCircle,
			tooltip: 'Download client is healthy and reachable'
		};
	});

	const Icon = $derived(statusInfo.icon);
</script>

<div class="tooltip tooltip-right" data-tip={statusInfo.tooltip}>
	<div class="badge gap-1 {statusInfo.class}">
		<Icon class="h-3 w-3" />
		<span class="text-xs">{statusInfo.text}</span>
	</div>
</div>
