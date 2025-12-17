<script lang="ts">
	import type { FormatCategory } from '$lib/types/format';
	import {
		FORMAT_CATEGORY_LABELS,
		FORMAT_CATEGORY_ORDER,
		type FormatScoreEntry,
		filterFormatScores,
		countNonZeroScores
	} from '$lib/types/format';
	import {
		Search,
		ChevronDown,
		ChevronRight,
		Monitor,
		Users,
		Volume2,
		Sun,
		Tv,
		Minimize2,
		AlertTriangle,
		Ban,
		Sparkles,
		FileCode,
		MoreHorizontal
	} from 'lucide-svelte';

	interface Props {
		formatScores: Map<FormatCategory, FormatScoreEntry[]>;
		readonly?: boolean;
		onScoreChange: (formatId: string, score: number) => void;
	}

	let { formatScores, readonly = false, onScoreChange }: Props = $props();

	// UI state
	let searchQuery = $state('');
	let expandedCategories = $state<Set<FormatCategory>>(new Set());

	// Filter scores by search
	const filteredScores = $derived(() => {
		const result = new Map<FormatCategory, FormatScoreEntry[]>();
		for (const [category, scores] of formatScores) {
			const filtered = filterFormatScores(scores, searchQuery);
			if (filtered.length > 0) {
				result.set(category, filtered);
			}
		}
		return result;
	});

	function toggleCategory(category: FormatCategory) {
		const newSet = new Set(expandedCategories);
		if (newSet.has(category)) {
			newSet.delete(category);
		} else {
			newSet.add(category);
		}
		expandedCategories = newSet;
	}

	function expandAll() {
		expandedCategories = new Set(FORMAT_CATEGORY_ORDER);
	}

	function collapseAll() {
		expandedCategories = new Set();
	}

	function handleScoreInput(formatId: string, value: string) {
		const score = parseInt(value, 10);
		if (!isNaN(score)) {
			onScoreChange(formatId, score);
		}
	}
</script>

<div class="space-y-4">
	<!-- Search and expand/collapse -->
	<div class="flex items-center gap-3">
		<div class="relative flex-1">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-base-content/50" />
			<input
				type="text"
				class="input-bordered input input-sm w-full pl-9"
				placeholder="Search formats..."
				bind:value={searchQuery}
			/>
		</div>

		<div class="flex gap-1">
			<button type="button" class="btn btn-ghost btn-xs" onclick={expandAll}>Expand All</button>
			<button type="button" class="btn btn-ghost btn-xs" onclick={collapseAll}>Collapse All</button>
		</div>
	</div>

	<!-- Category accordions -->
	<div class="space-y-2">
		{#each FORMAT_CATEGORY_ORDER as category}
			{@const scores = filteredScores().get(category) || []}
			{#if scores.length > 0}
				{@const nonZeroCount = countNonZeroScores(scores)}
				<div class="rounded-lg border border-base-300 bg-base-100">
					<!-- Category header -->
					<button
						type="button"
						class="flex w-full items-center gap-2 p-3 text-left hover:bg-base-200"
						onclick={() => toggleCategory(category)}
					>
						{#if expandedCategories.has(category)}
							<ChevronDown class="h-4 w-4" />
						{:else}
							<ChevronRight class="h-4 w-4" />
						{/if}

						{#if category === 'resolution'}
							<Monitor class="h-4 w-4 text-primary" />
						{:else if category === 'release_group_tier'}
							<Users class="h-4 w-4 text-primary" />
						{:else if category === 'audio'}
							<Volume2 class="h-4 w-4 text-primary" />
						{:else if category === 'hdr'}
							<Sun class="h-4 w-4 text-primary" />
						{:else if category === 'streaming'}
							<Tv class="h-4 w-4 text-primary" />
						{:else if category === 'micro'}
							<Minimize2 class="h-4 w-4 text-primary" />
						{:else if category === 'low_quality'}
							<AlertTriangle class="h-4 w-4 text-primary" />
						{:else if category === 'banned'}
							<Ban class="h-4 w-4 text-primary" />
						{:else if category === 'enhancement'}
							<Sparkles class="h-4 w-4 text-primary" />
						{:else if category === 'codec'}
							<FileCode class="h-4 w-4 text-primary" />
						{:else}
							<MoreHorizontal class="h-4 w-4 text-primary" />
						{/if}

						<span class="flex-1 font-medium">{FORMAT_CATEGORY_LABELS[category]}</span>

						{#if nonZeroCount > 0}
							<span class="badge badge-sm badge-primary">{nonZeroCount} scored</span>
						{/if}
						<span class="badge badge-sm">{scores.length}</span>
					</button>

					<!-- Category content -->
					{#if expandedCategories.has(category)}
						<div class="border-t border-base-300">
							<div class="max-h-80 divide-y divide-base-200 overflow-y-auto">
								{#each scores as entry (entry.formatId)}
									<div class="hover:bg-base-50 flex items-center gap-3 px-4 py-2">
										<!-- Format name -->
										<span class="min-w-0 flex-1 truncate" class:font-medium={entry.score !== 0}>
											{entry.formatName}
										</span>

										<!-- Score input -->
										<input
											type="number"
											class="input-bordered input input-xs w-20 text-right font-mono"
											class:input-primary={entry.score !== 0}
											value={entry.score}
											disabled={readonly}
											oninput={(e) => handleScoreInput(entry.formatId, e.currentTarget.value)}
										/>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		{/each}

		{#if filteredScores().size === 0}
			<div class="rounded-lg bg-base-200 p-8 text-center">
				<Search class="mx-auto mb-2 h-8 w-8 text-base-content/40" />
				<p class="text-base-content/60">No formats match your search</p>
			</div>
		{/if}
	</div>
</div>
