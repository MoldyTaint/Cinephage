<script lang="ts">
	import { AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-svelte';

	interface Props {
		enabled: boolean;
		healthy: boolean;
		consecutiveFailures: number;
		lastError?: string;
		throttledUntil?: string;
	}

	let { enabled, healthy, consecutiveFailures, lastError, throttledUntil }: Props = $props();

	const isThrottled = $derived(throttledUntil && new Date(throttledUntil) > new Date());

	const statusInfo = $derived.by(() => {
		if (!enabled) {
			return {
				text: 'Disabled',
				class: 'badge-ghost',
				icon: XCircle,
				tooltip: 'Subtitle provider is disabled by user'
			};
		}
		if (isThrottled) {
			const until = throttledUntil ? new Date(throttledUntil).toLocaleString() : 'unknown time';
			return {
				text: 'Throttled',
				class: 'badge-warning',
				icon: Clock,
				tooltip: lastError
					? `${lastError}. Throttled until ${until}`
					: `Provider throttled until ${until}`
			};
		}
		if (!healthy || consecutiveFailures > 0) {
			return {
				text: 'Unhealthy',
				class: 'badge-error',
				icon: AlertCircle,
				tooltip: lastError
					? `${consecutiveFailures} consecutive failures. Last error: ${lastError}`
					: `${consecutiveFailures} consecutive failures`
			};
		}
		return {
			text: 'Healthy',
			class: 'badge-success',
			icon: CheckCircle,
			tooltip: 'Subtitle provider is healthy and operational'
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
