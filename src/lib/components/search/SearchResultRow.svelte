<script lang="ts">
	import { Download, ExternalLink, Loader2, Check, X, Play } from 'lucide-svelte';
	import { formatBytes } from '$lib/utils/format';

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
		// Torrent ratio fields
		torrent?: {
			freeleech?: boolean;
			downloadFactor?: number;
			uploadFactor?: number;
		};
		// Enhanced fields
		parsed?: {
			resolution?: string;
			source?: string;
			codec?: string;
			hdr?: string;
			releaseGroup?: string;
		};
		quality?: {
			score: number;
			meetsMinimum: boolean;
		};
		totalScore?: number;
		rejected?: boolean;
	}

	interface Props {
		release: Release;
		onGrab: (release: Release, streaming?: boolean) => Promise<void>;
		grabbing?: boolean;
		grabbed?: boolean;
		error?: string | null;
		streaming?: boolean;
		onClick?: () => void;
		clickable?: boolean;
	}

	let {
		release,
		onGrab,
		grabbing = false,
		grabbed = false,
		error = null,
		streaming = false,
		onClick = undefined,
		clickable = false
	}: Props = $props();

	function formatAge(date: string | Date): string {
		const publishDate = typeof date === 'string' ? new Date(date) : date;
		const now = new Date();
		const diffMs = now.getTime() - publishDate.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return '1 day';
		if (diffDays < 7) return `${diffDays} days`;
		if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`;
		if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
		return `${Math.floor(diffDays / 365)} years`;
	}

	function isKnownBadge(value?: string): value is string {
		return Boolean(value && value.trim() && value.trim().toLowerCase() !== 'unknown');
	}

	function getQualityBadges(release: Release): string[] {
		const badges: string[] = [];
		const seen: string[] = [];
		const addBadge = (value?: string) => {
			if (!isKnownBadge(value)) return;
			const label = value.trim();
			const normalized = label.toLowerCase();
			if (seen.includes(normalized)) return;
			seen.push(normalized);
			badges.push(label);
		};

		if (release.protocol === 'streaming') {
			if (isKnownBadge(release.parsed?.resolution)) {
				addBadge(release.parsed.resolution);
			} else {
				addBadge('Auto');
			}
			addBadge(release.parsed?.codec);
			addBadge(release.parsed?.hdr);
			return badges;
		}

		addBadge(release.parsed?.resolution);
		addBadge(release.parsed?.source);
		addBadge(release.parsed?.codec);
		addBadge(release.parsed?.hdr);
		return badges;
	}

	function getReleaseGroupBadge(release: Release): string | null {
		if (isKnownBadge(release.parsed?.releaseGroup)) {
			return release.parsed.releaseGroup.trim();
		}
		if (release.protocol === 'streaming') {
			return 'Streaming';
		}
		return null;
	}

	function getRatioBadges(release: Release): { text: string; class: string }[] {
		const badges: { text: string; class: string }[] = [];

		// Freeleech badge
		if (release.torrent?.freeleech || release.torrent?.downloadFactor === 0) {
			badges.push({ text: 'Freeleech', class: 'badge-success' });
		} else if (
			release.torrent?.downloadFactor !== undefined &&
			release.torrent.downloadFactor < 1
		) {
			// Partial freeleech (e.g., 50% = 0.5)
			const percentage = Math.round((1 - release.torrent.downloadFactor) * 100);
			badges.push({ text: `${percentage}% Freeleech`, class: 'badge-success badge-outline' });
		}

		// Upload multiplier badge (if > 1x)
		if (release.torrent?.uploadFactor !== undefined && release.torrent.uploadFactor > 1) {
			badges.push({ text: `${release.torrent.uploadFactor}x Upload`, class: 'badge-info' });
		}

		return badges;
	}

	async function handleGrab() {
		await onGrab(release, false);
	}

	async function handleStream() {
		await onGrab(release, true);
	}
</script>

<tr
	class="hover"
	class:opacity-50={release.rejected}
	class:cursor-pointer={clickable}
	onclick={onClick}
>
	<!-- Title -->
	<td class="max-w-md">
		<div class="flex flex-col gap-1">
			<span class="truncate font-medium" title={release.title}>
				{release.title}
			</span>
			<div class="flex flex-wrap gap-1">
				{#each getQualityBadges(release) as badge, i (`${badge}-${i}`)}
					<span class="badge badge-xs badge-primary">{badge}</span>
				{/each}
				{#if getReleaseGroupBadge(release)}
					<span class="badge badge-ghost badge-xs">{getReleaseGroupBadge(release)}</span>
				{/if}
				{#each getRatioBadges(release) as badge (badge.text)}
					<span class="badge badge-xs {badge.class}">{badge.text}</span>
				{/each}
			</div>
		</div>
	</td>

	<!-- Indexer -->
	<td>
		<div class="flex items-center gap-2">
			<span
				class="badge badge-sm {release.protocol === 'torrent'
					? 'badge-info'
					: release.protocol === 'streaming'
						? 'badge-success'
						: 'badge-warning'}"
			>
				{release.protocol === 'torrent'
					? 'Torrent'
					: release.protocol === 'streaming'
						? 'Stream'
						: 'Usenet'}
			</span>
			{#if release.sourceIndexers && release.sourceIndexers.length > 1}
				<span class="text-sm" title="Available from: {release.sourceIndexers.join(', ')}">
					{release.sourceIndexers.join(', ')}
				</span>
			{:else}
				<span class="text-sm">{release.indexerName}</span>
			{/if}
		</div>
	</td>

	<!-- Size -->
	<td class="text-sm">{formatBytes(release.size)}</td>

	<!-- Seeders (torrent only) -->
	<td class="text-sm">
		{#if release.protocol === 'torrent'}
			<span class="text-success">{release.seeders ?? 0}</span>
			<span class="text-base-content/50">/</span>
			<span class="text-error">{release.leechers ?? 0}</span>
		{:else}
			<span class="text-base-content/50">—</span>
		{/if}
	</td>

	<!-- Age -->
	<td class="text-sm text-base-content/70">
		{formatAge(release.publishDate)}
	</td>

	<!-- Score -->
	<td class="text-sm">
		{#if release.totalScore !== undefined}
			<span
				class="font-medium {release.totalScore >= 700
					? 'text-success'
					: release.totalScore >= 400
						? 'text-warning'
						: 'text-error'}"
			>
				{release.totalScore}
			</span>
		{:else}
			<span class="text-base-content/50">—</span>
		{/if}
	</td>

	<!-- Actions -->
	<td>
		<div class="flex items-center gap-1">
			{#if grabbed}
				<span class="btn text-success btn-ghost btn-sm">
					<Check size={16} />
				</span>
			{:else if error}
				<span class="btn text-error btn-ghost btn-sm" title={error}>
					<X size={16} />
				</span>
			{:else}
				{#if release.protocol === 'usenet'}
					<!-- Stream button for usenet releases -->
					<button
						class="btn btn-sm btn-accent"
						onclick={handleStream}
						disabled={grabbing || streaming}
						title="Stream (NNTP)"
					>
						{#if streaming}
							<Loader2 size={16} class="animate-spin" />
						{:else}
							<Play size={16} />
						{/if}
					</button>
				{/if}
				<button
					class="btn btn-sm btn-primary"
					onclick={handleGrab}
					disabled={grabbing || streaming}
					title="Download"
				>
					{#if grabbing}
						<Loader2 size={16} class="animate-spin" />
					{:else}
						<Download size={16} />
					{/if}
				</button>
			{/if}

			{#if release.commentsUrl}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- External URL -->
				<a
					href={release.commentsUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-ghost btn-sm"
					title="View details"
				>
					<ExternalLink size={16} />
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	</td>
</tr>
