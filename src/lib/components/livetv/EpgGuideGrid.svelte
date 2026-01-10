<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { Tv, ChevronLeft, ChevronRight, Clock, Loader2, X } from 'lucide-svelte';
	import type { ChannelLineupItemWithDetails, EpgProgram } from '$lib/types/livetv';
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		lineup: ChannelLineupItemWithDetails[];
		loading: boolean;
	}

	let { lineup, loading }: Props = $props();

	// Time window state - store as timestamp for reactivity
	let windowStartTime = $state(getWindowStartTime(Date.now()));
	let windowStart = $derived(new Date(windowStartTime));
	let windowEnd = $derived(new Date(windowStartTime + 3 * 60 * 60 * 1000)); // 3 hours

	// Program data
	let programsByChannel = new SvelteMap<string, EpgProgram[]>();
	let loadingPrograms = $state(false);

	// Current time for indicator - store as timestamp
	let nowTime = $state(Date.now());
	let now = $derived(new Date(nowTime));
	let timeInterval: ReturnType<typeof setInterval> | null = null;

	// Selected program for details
	let selectedProgram = $state<{
		program: EpgProgram;
		channel: ChannelLineupItemWithDetails;
	} | null>(null);

	// Grid configuration
	const CHANNEL_WIDTH = 180; // px
	const HOUR_WIDTH = 400; // px per hour
	const ROW_HEIGHT = 64; // px
	const SLOT_MINUTES = 30;

	function getWindowStartTime(time: number): number {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- pure function, not reactive state
		const d = new Date(time);
		d.setMinutes(Math.floor(d.getMinutes() / 30) * 30, 0, 0);
		return d.getTime();
	}

	// Generate time slots for the header
	const timeSlots = $derived.by(() => {
		const slots: number[] = [];
		let current = windowStartTime;
		const end = windowStartTime + 3 * 60 * 60 * 1000;
		while (current < end) {
			slots.push(current);
			current += SLOT_MINUTES * 60 * 1000;
		}
		return slots;
	});

	// Grid width based on time window
	const gridWidth = $derived(
		((windowEnd.getTime() - windowStart.getTime()) / 3600000) * HOUR_WIDTH
	);

	// Current time indicator position
	const nowPosition = $derived.by(() => {
		if (now < windowStart || now > windowEnd) return null;
		const elapsed = (now.getTime() - windowStart.getTime()) / 3600000;
		return CHANNEL_WIDTH + elapsed * HOUR_WIDTH;
	});

	onMount(() => {
		loadPrograms();
		timeInterval = setInterval(() => {
			nowTime = Date.now();
		}, 60000); // Update every minute
	});

	onDestroy(() => {
		if (timeInterval) {
			clearInterval(timeInterval);
		}
	});

	// Reload programs when time window changes
	$effect(() => {
		// Access windowStartTime to create dependency
		void windowStartTime;
		loadPrograms();
	});

	async function loadPrograms() {
		if (lineup.length === 0) return;

		loadingPrograms = true;
		try {
			const channelIds = lineup.map((ch) => ch.epgSourceChannelId ?? ch.channelId);
			const params = new URLSearchParams({
				start: windowStart.toISOString(),
				end: windowEnd.toISOString(),
				channelIds: channelIds.join(',')
			});

			const res = await fetch(`/api/livetv/epg/guide?${params}`);
			if (res.ok) {
				const data = await res.json();
				programsByChannel.clear();

				// Map the programs back to lineup item IDs
				for (const item of lineup) {
					const sourceChannelId = item.epgSourceChannelId ?? item.channelId;
					programsByChannel.set(item.id, data.programs[sourceChannelId] || []);
				}
			}
		} catch {
			// Silent failure
		} finally {
			loadingPrograms = false;
		}
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function formatDate(date: Date): string {
		return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function navigatePrev() {
		windowStartTime = windowStartTime - 2 * 60 * 60 * 1000;
	}

	function navigateNext() {
		windowStartTime = windowStartTime + 2 * 60 * 60 * 1000;
	}

	function jumpToNow() {
		windowStartTime = getWindowStartTime(Date.now());
	}

	function getProgramStyle(program: EpgProgram): string {
		const start = new Date(program.startTime);
		const end = new Date(program.endTime);

		// Clamp to window bounds
		const clampedStart = Math.max(start.getTime(), windowStart.getTime());
		const clampedEnd = Math.min(end.getTime(), windowEnd.getTime());

		const leftOffset = ((clampedStart - windowStart.getTime()) / 3600000) * HOUR_WIDTH;
		const width = ((clampedEnd - clampedStart) / 3600000) * HOUR_WIDTH;

		return `left: ${leftOffset}px; width: ${Math.max(width - 2, 20)}px;`;
	}

	function isCurrentlyAiring(program: EpgProgram): boolean {
		const start = new Date(program.startTime).getTime();
		const end = new Date(program.endTime).getTime();
		const nowTime = now.getTime();
		return nowTime >= start && nowTime < end;
	}

	function showProgramDetails(program: EpgProgram, channel: ChannelLineupItemWithDetails) {
		selectedProgram = { program, channel };
	}

	function closeProgramDetails() {
		selectedProgram = null;
	}
</script>

<div class="space-y-4">
	<!-- Navigation header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<button class="btn btn-ghost btn-sm" onclick={navigatePrev}>
				<ChevronLeft class="h-4 w-4" />
				Earlier
			</button>
			<button class="btn btn-ghost btn-sm" onclick={jumpToNow}>
				<Clock class="h-4 w-4" />
				Now
			</button>
			<button class="btn btn-ghost btn-sm" onclick={navigateNext}>
				Later
				<ChevronRight class="h-4 w-4" />
			</button>
		</div>
		<div class="text-sm text-base-content/60">
			{formatDate(windowStart)}
			{formatTime(windowStart)} - {formatTime(windowEnd)}
		</div>
	</div>

	<!-- Guide grid -->
	{#if loading || loadingPrograms}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="h-8 w-8 animate-spin text-primary" />
		</div>
	{:else if lineup.length === 0}
		<div class="py-12 text-center text-base-content/50">No channels in lineup</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100">
			<div class="relative" style="min-width: {CHANNEL_WIDTH + gridWidth}px;">
				<!-- Time header -->
				<div class="sticky top-0 z-20 flex border-b border-base-300 bg-base-200">
					<!-- Channel column header -->
					<div
						class="sticky left-0 z-30 flex shrink-0 items-center border-r border-base-300 bg-base-200 px-3 font-medium"
						style="width: {CHANNEL_WIDTH}px; height: 40px;"
					>
						Channel
					</div>
					<!-- Time slots -->
					<div class="relative flex" style="width: {gridWidth}px;">
						{#each timeSlots as slotTime (slotTime)}
							<div
								class="shrink-0 border-r border-base-300/50 px-2 py-2 text-sm"
								style="width: {HOUR_WIDTH / 2}px;"
							>
								{formatTime(new Date(slotTime))}
							</div>
						{/each}
					</div>
				</div>

				<!-- Channel rows -->
				{#each lineup as channel (channel.id)}
					{@const programs = programsByChannel.get(channel.id) || []}
					<div class="flex border-b border-base-300/50 last:border-b-0">
						<!-- Channel info (sticky) -->
						<div
							class="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-base-300 bg-base-100 px-3"
							style="width: {CHANNEL_WIDTH}px; height: {ROW_HEIGHT}px;"
						>
							{#if channel.displayLogo}
								<img
									src={channel.displayLogo}
									alt=""
									class="h-8 w-8 shrink-0 rounded bg-base-300 object-contain"
								/>
							{:else}
								<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-base-300">
									<Tv class="h-4 w-4 text-base-content/30" />
								</div>
							{/if}
							<div class="min-w-0">
								<div class="truncate text-sm font-medium" title={channel.displayName}>
									{channel.displayName}
								</div>
								{#if channel.channelNumber}
									<div class="text-xs text-base-content/50">#{channel.channelNumber}</div>
								{/if}
							</div>
						</div>

						<!-- Programs -->
						<div class="relative" style="width: {gridWidth}px; height: {ROW_HEIGHT}px;">
							{#each programs as program (program.id)}
								{@const isCurrent = isCurrentlyAiring(program)}
								<button
									class="absolute top-1 flex h-[calc(100%-8px)] cursor-pointer items-center overflow-hidden rounded border px-2 text-left text-sm transition-colors {isCurrent
										? 'border-primary/30 bg-primary/20 hover:bg-primary/30'
										: 'border-base-300 bg-base-200 hover:bg-base-300'}"
									style={getProgramStyle(program)}
									onclick={() => showProgramDetails(program, channel)}
									title="{program.title}{program.description ? `: ${program.description}` : ''}"
								>
									<span class="truncate">
										{#if isCurrent}
											<span class="mr-1 inline-block h-2 w-2 rounded-full bg-primary"></span>
										{/if}
										{program.title}
									</span>
								</button>
							{/each}

							<!-- Empty state for no programs -->
							{#if programs.length === 0}
								<div class="flex h-full items-center justify-center text-sm text-base-content/30">
									No program data
								</div>
							{/if}
						</div>
					</div>
				{/each}

				<!-- Current time indicator -->
				{#if nowPosition !== null}
					<div
						class="pointer-events-none absolute top-0 z-40 h-full w-0.5 bg-error"
						style="left: {nowPosition}px;"
					>
						<div
							class="absolute -top-1 -left-1 h-3 w-3 rounded-full border-2 border-error bg-base-100"
						></div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Program details modal -->
{#if selectedProgram}
	<div class="modal-open modal">
		<div class="modal-box max-w-md">
			<div class="mb-4 flex items-start justify-between">
				<div>
					<h3 class="text-lg font-bold">{selectedProgram.program.title}</h3>
					<p class="text-sm text-base-content/60">{selectedProgram.channel.displayName}</p>
				</div>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={closeProgramDetails}>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="space-y-3">
				<div class="flex items-center gap-2 text-sm">
					<Clock class="h-4 w-4 text-base-content/50" />
					<span>
						{formatTime(new Date(selectedProgram.program.startTime))} -
						{formatTime(new Date(selectedProgram.program.endTime))}
					</span>
					{#if isCurrentlyAiring(selectedProgram.program)}
						<span class="badge badge-sm badge-primary">LIVE</span>
					{/if}
				</div>

				{#if selectedProgram.program.category}
					<div class="badge badge-ghost badge-sm">{selectedProgram.program.category}</div>
				{/if}

				{#if selectedProgram.program.description}
					<p class="text-sm text-base-content/80">{selectedProgram.program.description}</p>
				{/if}

				{#if selectedProgram.program.director}
					<div class="text-sm">
						<span class="text-base-content/50">Director:</span>
						{selectedProgram.program.director}
					</div>
				{/if}

				{#if selectedProgram.program.actor}
					<div class="text-sm">
						<span class="text-base-content/50">Cast:</span>
						{selectedProgram.program.actor}
					</div>
				{/if}
			</div>

			<div class="modal-action">
				<button class="btn btn-ghost" onclick={closeProgramDetails}>Close</button>
			</div>
		</div>
		<button
			type="button"
			class="modal-backdrop cursor-default border-none bg-black/50"
			onclick={closeProgramDetails}
			aria-label="Close modal"
		></button>
	</div>
{/if}
