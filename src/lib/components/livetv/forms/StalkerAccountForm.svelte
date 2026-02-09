<script lang="ts">
	import { CheckCircle2, XCircle } from 'lucide-svelte';
	import { SectionHeader } from '$lib/components/ui/modal';

	interface Props {
		name: string;
		portalUrl: string;
		macAddress: string;
		epgUrl: string;
		enabled: boolean;
		mode: 'add' | 'edit';
		onNameChange: (value: string) => void;
		onPortalUrlChange: (value: string) => void;
		onMacAddressChange: (value: string) => void;
		onEpgUrlChange: (value: string) => void;
		onEnabledChange: (value: boolean) => void;
	}

	let {
		name,
		portalUrl,
		macAddress,
		epgUrl,
		enabled,
		mode: _mode,
		onNameChange,
		onPortalUrlChange,
		onMacAddressChange,
		onEpgUrlChange,
		onEnabledChange
	}: Props = $props();

	const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
	const isMacValid = $derived(macRegex.test(macAddress));
	const isUrlValid = $derived(() => {
		try {
			new URL(portalUrl);
			return true;
		} catch {
			return false;
		}
	});
	const isEpgUrlValid = $derived(() => {
		if (!epgUrl.trim()) return true;
		try {
			new URL(epgUrl);
			return true;
		} catch {
			return false;
		}
	});

	function formatMacAddress(value: string): string {
		const hex = value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
		const parts = hex.match(/.{1,2}/g) || [];
		return parts.slice(0, 6).join(':');
	}

	function handleMacInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const cursorPos = input.selectionStart || 0;
		const oldLength = macAddress.length;

		onMacAddressChange(formatMacAddress(input.value));

		const newLength = macAddress.length;
		const diff = newLength - oldLength;
		requestAnimationFrame(() => {
			input.setSelectionRange(cursorPos + diff, cursorPos + diff);
		});
	}
</script>

<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
	<!-- Left Column: Connection -->
	<div class="space-y-4">
		<SectionHeader title="Connection" />

		<div class="form-control">
			<label class="label py-1" for="stalker-name">
				<span class="label-text">Name</span>
			</label>
			<input
				id="stalker-name"
				type="text"
				class="input-bordered input input-sm"
				value={name}
				oninput={(e) => onNameChange(e.currentTarget.value)}
				placeholder="My Stalker Portal"
			/>
			<div class="label py-1">
				<span class="label-text-alt text-xs">A friendly name for this account</span>
			</div>
		</div>

		<div class="form-control">
			<label class="label py-1" for="portal-url">
				<span class="label-text">Portal URL</span>
			</label>
			<div class="relative">
				<input
					id="portal-url"
					type="url"
					class="input-bordered input input-sm w-full pr-8"
					class:input-error={portalUrl.length > 0 && !isUrlValid()}
					value={portalUrl}
					oninput={(e) => onPortalUrlChange(e.currentTarget.value)}
					placeholder="http://portal.example.com/c"
				/>
				{#if portalUrl.length > 0}
					<div class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
						{#if isUrlValid()}
							<CheckCircle2 class="h-4 w-4 text-success" />
						{:else}
							<XCircle class="h-4 w-4 text-error" />
						{/if}
					</div>
				{/if}
			</div>
			<div class="label py-1">
				<span class="label-text-alt text-xs"
					>The full portal URL (e.g., http://portal.example.com/c)</span
				>
			</div>
		</div>

		<div class="form-control">
			<label class="label py-1" for="mac-address">
				<span class="label-text">MAC Address</span>
			</label>
			<div class="relative">
				<input
					id="mac-address"
					type="text"
					class="input-bordered input input-sm w-full pr-8 font-mono"
					class:input-error={macAddress.length > 0 && !isMacValid}
					value={macAddress}
					oninput={handleMacInput}
					placeholder="00:1A:79:XX:XX:XX"
					maxlength="17"
				/>
				{#if macAddress.length > 0}
					<div class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
						{#if isMacValid}
							<CheckCircle2 class="h-4 w-4 text-success" />
						{:else}
							<XCircle class="h-4 w-4 text-error" />
						{/if}
					</div>
				{/if}
			</div>
			<div class="label py-1">
				<span class="label-text-alt text-xs"
					>Format: XX:XX:XX:XX:XX:XX (colons added automatically)</span
				>
			</div>
		</div>
	</div>

	<!-- Right Column: Settings -->
	<div class="space-y-4">
		<SectionHeader title="Settings" />

		<div class="form-control">
			<label class="label py-1" for="epg-url">
				<span class="label-text">EPG URL (Optional)</span>
			</label>
			<div class="relative">
				<input
					id="epg-url"
					type="url"
					class="input-bordered input input-sm w-full pr-8"
					class:input-error={epgUrl.length > 0 && !isEpgUrlValid()}
					value={epgUrl}
					oninput={(e) => onEpgUrlChange(e.currentTarget.value)}
					placeholder="http://example.com/epg.xml"
				/>
				{#if epgUrl.length > 0}
					<div class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
						{#if isEpgUrlValid()}
							<CheckCircle2 class="h-4 w-4 text-success" />
						{:else}
							<XCircle class="h-4 w-4 text-error" />
						{/if}
					</div>
				{/if}
			</div>
			<div class="label py-1">
				<span class="label-text-alt text-xs">Override EPG source (XMLTV format)</span>
			</div>
		</div>

		<label class="label cursor-pointer gap-2">
			<input
				type="checkbox"
				class="checkbox checkbox-sm"
				checked={enabled}
				onchange={(e) => onEnabledChange(e.currentTarget.checked)}
			/>
			<span class="label-text">Enabled</span>
		</label>
	</div>
</div>
