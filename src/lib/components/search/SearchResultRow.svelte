<script lang="ts">
	import {
		Download,
		ExternalLink,
		Loader2,
		Check,
		X,
		Play,
		ChevronDown,
		ChevronUp,
		Calendar,
		HardDrive,
		ArrowUpCircle,
		ArrowDownCircle
	} from 'lucide-svelte';
	import { formatBytes } from '$lib/utils/format';
	import type { ScoreComponents } from '$lib/server/quality/types.js';

	interface Release {
		guid: string;
		title: string;
		downloadUrl: string;
		magnetUrl?: string;
		infoHash?: string;
		size: number;
		seeders?: number;
		leechers?: number;
		publishDate: string | Date;
		indexerId: string;
		indexerName: string;
		protocol: string;
		commentsUrl?: string;
		sourceIndexers?: string[];
		torrent?: {
			freeleech?: boolean;
			downloadFactor?: number;
			uploadFactor?: number;
		};
		parsed?: {
			resolution?: string;
			source?: string;
			codec?: string;
			hdr?: string;
			releaseGroup?: string;
		};
		totalScore?: number;
		scoreComponents?: ScoreComponents;
		scoringResult?: {
			totalScore?: number;
			breakdown?: {
				resolution?: { score: number; formats: string[] };
				source?: { score: number; formats: string[] };
				codec?: { score: number; formats: string[] };
				releaseGroupTier?: { score: number; formats: string[] };
				audio?: { score: number; formats: string[] };
				hdr?: { score: number; formats: string[] };
				streaming?: { score: number; formats: string[] };
				enhancement?: { score: number; formats: string[] };
				banned?: { score: number; formats: string[] };
			};
		};
		rejected?: boolean;
	}

	interface Props {
		release: Release;
		onGrab: (release: Release, streaming?: boolean) => Promise<void>;
		grabbing?: boolean;
		grabbed?: boolean;
		error?: string | null;
		streaming?: boolean;
		showUsenetStreamButton?: boolean;
		canUsenetStream?: boolean;
		usenetStreamUnavailableReason?: string | null;
	}

	let {
		release,
		onGrab,
		grabbing = false,
		grabbed = false,
		error = null,
		streaming = false,
		showUsenetStreamButton = true,
		canUsenetStream = true,
		usenetStreamUnavailableReason = null
	}: Props = $props();

	let expanded = $state(false);

	function formatAge(date: string | Date): string {
		const publishDate = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffMs = now.getTime() - publishDate.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return '1d';
		if (diffDays < 7) return `${diffDays}d`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
		if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
		return `${Math.floor(diffDays / 365)}y`;
	}

	function isKnownBadge(value?: string): boolean {
		return Boolean(value && value.trim() && value.trim().toLowerCase() !== 'unknown');
	}

	function getQualityTags(): string[] {
		const tags: string[] = [];
		const seen: string[] = [];
		const addTag = (value?: string) => {
			if (!isKnownBadge(value)) return;
			const label = value!.trim();
			const normalized = label.toLowerCase();
			if (seen.includes(normalized)) return;
			seen.push(normalized);
			tags.push(label);
		};

		addTag(release.parsed?.resolution);
		addTag(release.parsed?.source);
		addTag(release.parsed?.codec);
		addTag(release.parsed?.hdr);
		return tags;
	}

	function getProtocolColor(): string {
		switch (release.protocol) {
			case 'torrent':
				return 'bg-blue-500';
			case 'streaming':
				return 'bg-green-500';
			case 'usenet':
				return 'bg-yellow-500';
			default:
				return 'bg-base-300';
		}
	}

	function getScoreColor(score: number): string {
		if (score >= 700) return 'text-green-500';
		if (score >= 400) return 'text-yellow-500';
		return 'text-red-500';
	}

	async function handleGrab() {
		await onGrab(release, false);
	}

	async function handleStream() {
		if (!canUsenetStream) return;
		await onGrab(release, true);
	}

	function getTorrentAvailabilityText(): { seeders: string; leechers: string } | null {
		if (release.protocol !== 'torrent') return null;
		const hasSeederData = release.seeders !== undefined || release.leechers !== undefined;
		if (!hasSeederData) return null;
		return {
			seeders: release.seeders !== undefined ? String(release.seeders) : '—',
			leechers: release.leechers !== undefined ? String(release.leechers) : '—'
		};
	}
</script>

<div
	class="rounded-lg border bg-base-200 transition-all duration-200 {expanded
		? 'border-primary/50'
		: 'border-base-300'} {release.rejected ? 'opacity-50' : ''}"
>
	<!-- Main row - always visible -->
	<div class="flex items-center gap-3 p-3">
		<!-- Score - inline with title -->
		{#if release.totalScore !== undefined}
			<span
				class="shrink-0 rounded px-1.5 py-0.5 text-sm font-semibold {getScoreColor(
					release.totalScore
				)}"
				title="Quality score"
			>
				{release.totalScore}
			</span>
		{/if}

		<!-- Title and tags -->
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium" title={release.title}>
				{release.title}
			</p>
			<div class="mt-1 flex flex-wrap items-center gap-1.5">
				{#each getQualityTags() as tag (tag)}
					<span class="badge badge-sm badge-primary">{tag}</span>
				{/each}
				{#if release.parsed?.releaseGroup && isKnownBadge(release.parsed.releaseGroup)}
					<span class="badge badge-ghost badge-sm">{release.parsed.releaseGroup}</span>
				{/if}
				{#if release.torrent?.freeleech || release.torrent?.downloadFactor === 0}
					<span class="badge badge-sm badge-success">Freeleech</span>
				{/if}
			</div>
		</div>

		<!-- Quick stats -->
		<div class="hidden shrink-0 items-center gap-4 text-xs sm:flex">
			<!-- Indexer -->
			<div class="flex items-center gap-1.5">
				<span class="h-2 w-2 rounded-full {getProtocolColor()}"></span>
				<span class="text-base-content/60">{release.indexerName}</span>
			</div>

			<!-- Size -->
			{#if release.size > 0}
				<div class="flex items-center gap-1 text-base-content/60">
					<HardDrive size={12} />
					<span>{formatBytes(release.size)}</span>
				</div>
			{/if}

			<!-- Seeders/Leechers -->
			{#if release.protocol === 'torrent'}
				{@const availability = getTorrentAvailabilityText()}
				{#if availability}
					<div class="flex items-center gap-1">
						<ArrowUpCircle size={12} class="text-green-500" />
						<span class="text-green-500">{availability.seeders}</span>
						<span class="text-base-content/30">/</span>
						<ArrowDownCircle size={12} class="text-red-500" />
						<span class="text-red-500">{availability.leechers}</span>
					</div>
				{/if}
			{/if}

			<!-- Age -->
			<div class="flex items-center gap-1 text-base-content/60">
				<Calendar size={12} />
				<span>{formatAge(release.publishDate)}</span>
			</div>
		</div>

		<!-- Actions -->
		<div class="flex shrink-0 items-center gap-1">
			{#if grabbed}
				<span class="badge gap-1 badge-success">
					<Check size={12} />
					Grabbed
				</span>
			{:else if error}
				<span class="badge gap-1 badge-error" title={error}>
					<X size={12} />
					Failed
				</span>
			{:else}
				{#if release.protocol === 'usenet' && showUsenetStreamButton}
					<button
						class="btn btn-sm btn-accent"
						onclick={handleStream}
						disabled={grabbing || streaming || !canUsenetStream}
						title={canUsenetStream ? 'Stream' : (usenetStreamUnavailableReason ?? 'Unavailable')}
					>
						{#if streaming}
							<Loader2 size={14} class="animate-spin" />
						{:else}
							<Play size={14} />
						{/if}
					</button>
				{/if}
				<button
					class="btn btn-sm btn-primary"
					onclick={handleGrab}
					disabled={grabbing || streaming}
				>
					{#if grabbing}
						<Loader2 size={14} class="animate-spin" />
					{:else}
						<Download size={14} />
					{/if}
				</button>
			{/if}

			{#if release.commentsUrl}
				<a
					href={release.commentsUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-ghost btn-sm"
					title="View comments"
				>
					<ExternalLink size={14} />
				</a>
			{/if}

			<!-- Expand toggle -->
			<button
				class="btn btn-ghost btn-sm"
				onclick={() => (expanded = !expanded)}
				title={expanded ? 'Collapse details' : 'Expand details'}
			>
				{#if expanded}
					<ChevronUp size={14} />
				{:else}
					<ChevronDown size={14} />
				{/if}
			</button>
		</div>
	</div>

	<!-- Expanded content -->
	{#if expanded}
		<div class="border-t border-base-300 bg-base-100 p-4">
			<!-- Score breakdown section -->
			{#if release.scoringResult?.breakdown}
				<div class="mb-4">
					<h4 class="mb-2 text-xs font-medium tracking-wide text-base-content/50 uppercase">
						Score Breakdown
					</h4>
					<div class="flex flex-wrap gap-2">
						{#each Object.entries(release.scoringResult.breakdown) as [key, cat] (key)}
							{#if cat && cat.score !== 0}
								{@const label =
									key === 'releaseGroupTier' ? 'Group' : key.charAt(0).toUpperCase() + key.slice(1)}
								{@const scoreClass =
									cat.score > 0 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}
								{@const prefix = cat.score > 0 ? '+' : ''}
								<span class="rounded-full px-2 py-1 text-xs {scoreClass}">
									{prefix}{cat.score}
									{label}
								</span>
							{/if}
						{/each}
						{#if release.scoreComponents}
							{#if release.scoreComponents.enhancementBonus > 0}
								<span class="rounded-full bg-green-500/10 px-2 py-1 text-xs text-green-600">
									+{release.scoreComponents.enhancementBonus} Enhancement
								</span>
							{/if}
							{#if release.scoreComponents.packBonus > 0}
								<span class="rounded-full bg-green-500/10 px-2 py-1 text-xs text-green-600">
									+{release.scoreComponents.packBonus} Pack
								</span>
							{/if}
							{#if release.scoreComponents.hardcodedSubsPenalty < 0}
								<span class="rounded-full bg-red-500/10 px-2 py-1 text-xs text-red-600">
									{release.scoreComponents.hardcodedSubsPenalty} Hardcoded Subs
								</span>
							{/if}
						{/if}
					</div>
				</div>
			{/if}

			<!-- Release details section -->
			<div class="grid gap-4 sm:grid-cols-2">
				<!-- Left: technical details -->
				<div>
					<h4 class="mb-2 text-xs font-medium tracking-wide text-base-content/50 uppercase">
						Technical Details
					</h4>
					<dl class="space-y-1.5 text-sm">
						{#if release.parsed?.resolution}
							<div class="flex justify-between">
								<dt class="text-base-content/60">Resolution</dt>
								<dd class="font-medium">{release.parsed.resolution}</dd>
							</div>
						{/if}
						{#if release.parsed?.source}
							<div class="flex justify-between">
								<dt class="text-base-content/60">Source</dt>
								<dd class="font-medium">{release.parsed.source}</dd>
							</div>
						{/if}
						{#if release.parsed?.codec}
							<div class="flex justify-between">
								<dt class="text-base-content/60">Codec</dt>
								<dd class="font-medium">{release.parsed.codec}</dd>
							</div>
						{/if}
						{#if release.parsed?.hdr}
							<div class="flex justify-between">
								<dt class="text-base-content/60">HDR</dt>
								<dd class="font-medium">{release.parsed.hdr}</dd>
							</div>
						{/if}
						<div class="flex justify-between">
							<dt class="text-base-content/60">Protocol</dt>
							<dd class="font-medium capitalize">{release.protocol}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-base-content/60">Size</dt>
							<dd class="font-medium">{formatBytes(release.size)}</dd>
						</div>
					</dl>
				</div>

				<!-- Right: torrent/indexer info -->
				<div>
					<h4 class="mb-2 text-xs font-medium tracking-wide text-base-content/50 uppercase">
						Indexer & Torrent
					</h4>
					<dl class="space-y-1.5 text-sm">
						<div class="flex justify-between">
							<dt class="text-base-content/60">Indexer</dt>
							<dd class="font-medium">{release.indexerName}</dd>
						</div>
						{#if release.infoHash}
							<div class="flex justify-between">
								<dt class="text-base-content/60">Hash</dt>
								<dd class="truncate font-mono text-xs">{release.infoHash}</dd>
							</div>
						{/if}
						{#if release.torrent?.freeleech || release.torrent?.downloadFactor === 0}
							<div class="flex justify-between">
								<dt class="text-base-content/60">Ratio</dt>
								<dd class="font-medium text-green-500">Freeleech</dd>
							</div>
						{/if}
						{#if release.torrent?.uploadFactor && release.torrent.uploadFactor > 1}
							<div class="flex justify-between">
								<dt class="text-base-content/60">Upload</dt>
								<dd class="font-medium text-blue-500">{release.torrent.uploadFactor}x</dd>
							</div>
						{/if}
						{#if release.seeders !== undefined}
							<div class="flex justify-between">
								<dt class="text-base-content/60">Seeders</dt>
								<dd class="font-medium text-green-500">{release.seeders}</dd>
							</div>
						{/if}
						{#if release.leechers !== undefined}
							<div class="flex justify-between">
								<dt class="text-base-content/60">Leechers</dt>
								<dd class="font-medium text-red-500">{release.leechers}</dd>
							</div>
						{/if}
						<div class="flex justify-between">
							<dt class="text-base-content/60">Published</dt>
							<dd class="font-medium">{formatAge(release.publishDate)} ago</dd>
						</div>
					</dl>
				</div>
			</div>

			<!-- Action buttons in expanded view -->
			<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-base-300 pt-4">
				{#if release.downloadUrl}
					<a
						href={release.downloadUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-outline btn-sm"
					>
						<Download size={14} />
						Direct Download
					</a>
				{/if}
				{#if release.magnetUrl}
					<a
						href={release.magnetUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-outline btn-sm"
					>
						Magnet Link
					</a>
				{/if}
				{#if release.commentsUrl}
					<a
						href={release.commentsUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-ghost btn-sm"
					>
						<ExternalLink size={14} />
						Comments
					</a>
				{/if}
			</div>
		</div>
	{/if}
</div>
