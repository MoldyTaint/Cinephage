<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Calendar, ChevronLeft, ChevronRight, X, Film, Tv, Loader2 } from 'lucide-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import TmdbImage from '$lib/components/tmdb/TmdbImage.svelte';
	import type { CalendarDay } from '$lib/server/calendar/queries.js';

	let { data } = $props();

	let currentMonth = $state(data.currentMonth);
	let days = $state<CalendarDay[]>(data.days as CalendarDay[]);
	let loading = $state(false);
	let selectedDay = $state<CalendarDay | null>(null);
	let abortController = $state<AbortController | null>(null);

	const currentLocale = getLocale();
	const dayNames = [...Array(7)].map((_, i) => {
		const d = new Date(2024, 0, i);
		return d.toLocaleDateString(currentLocale, { weekday: 'short' });
	});

	interface GridCell {
		date: string;
		dayOfMonth: number;
		isCurrentMonth: boolean;
		isToday: boolean;
		items: CalendarDay | null;
	}

	const monthGrid = $derived.by(() => {
		const [year, month] = currentMonth.split('-').map(Number);
		const firstDay = new Date(year, month - 1, 1);
		const lastDay = new Date(year, month, 0);
		const startDow = firstDay.getDay();
		const daysInMonth = lastDay.getDate();

		const today = new Date();
		const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

		const dayMap = new SvelteMap<string, CalendarDay>();
		for (const d of days) {
			dayMap.set(d.date, d);
		}

		const prevMonthLast = new Date(year, month - 1, 0).getDate();

		const weeks: GridCell[][] = [];
		let week: GridCell[] = [];

		for (let i = startDow - 1; i >= 0; i--) {
			const dom = prevMonthLast - i;
			const mo = month - 1 < 1 ? 12 : month - 1;
			const y = month - 1 < 1 ? year - 1 : year;
			const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
			week.push({
				date: dateStr,
				dayOfMonth: dom,
				isCurrentMonth: false,
				isToday: dateStr === todayStr,
				items: dayMap.get(dateStr) ?? null
			});
		}

		for (let dom = 1; dom <= daysInMonth; dom++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
			week.push({
				date: dateStr,
				dayOfMonth: dom,
				isCurrentMonth: true,
				isToday: dateStr === todayStr,
				items: dayMap.get(dateStr) ?? null
			});
			if (week.length === 7) {
				weeks.push(week);
				week = [];
			}
		}

		let nextDom = 1;
		while (week.length < 7) {
			const mo = month + 1 > 12 ? 1 : month + 1;
			const y = month + 1 > 12 ? year + 1 : year;
			const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(nextDom).padStart(2, '0')}`;
			week.push({
				date: dateStr,
				dayOfMonth: nextDom,
				isCurrentMonth: false,
				isToday: dateStr === todayStr,
				items: dayMap.get(dateStr) ?? null
			});
			nextDom++;
		}
		weeks.push(week);

		while (weeks.length < 6) {
			const lastWeek = weeks[weeks.length - 1];
			const nextWeek: GridCell[] = [];
			let d = lastWeek[6].dayOfMonth + 1;
			for (let i = 0; i < 7; i++) {
				const mo = month + 1 > 12 ? 1 : month + 1;
				const y = month + 1 > 12 ? year + 1 : year;
				const dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				nextWeek.push({
					date: dateStr,
					dayOfMonth: d,
					isCurrentMonth: false,
					isToday: false,
					items: dayMap.get(dateStr) ?? null
				});
				d++;
			}
			weeks.push(nextWeek);
		}

		return weeks;
	});

	const monthLabel = $derived.by(() => {
		const [year, month] = currentMonth.split('-').map(Number);
		const d = new Date(year, month - 1, 1);
		return d.toLocaleDateString(currentLocale, { month: 'long', year: 'numeric' });
	});

	function goToMonth(offset: number) {
		const [y, mo] = currentMonth.split('-').map(Number);
		const d = new Date(y, mo - 1 + offset, 1);
		const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		currentMonth = newMonth;
		loading = true;
		selectedDay = null;
		if (abortController) abortController.abort();
		const controller = new AbortController();
		abortController = controller;
		fetch(`/api/calendar?month=${newMonth}`, { signal: controller.signal })
			.then((r) => r.json())
			.then((result: CalendarDay[]) => {
				if (controller.signal.aborted) return;
				days = result;
				loading = false;
			})
			.catch((err) => {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				loading = false;
			});
	}

	function openDay(cell: GridCell) {
		if (!cell.items) return;
		if (cell.items.movies.length === 0 && cell.items.episodes.length === 0) return;
		selectedDay = cell.items;
	}

	function closePanel() {
		selectedDay = null;
	}

	function formatPanelDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString(currentLocale, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{m.nav_calendar()}</title>
</svelte:head>

<div class="min-h-screen bg-base-100">
	<div class="space-y-6 px-4 py-6 lg:px-8">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="flex items-center gap-2 text-2xl font-bold">
					<Calendar class="h-8 w-8" />
					{m.nav_calendar()}
				</h1>
			</div>

			<div class="flex items-center gap-2">
				<button class="btn btn-circle btn-ghost btn-sm" onclick={() => goToMonth(-1)}>
					<ChevronLeft class="h-5 w-5" />
				</button>
				<span class="min-w-[180px] text-center text-lg font-semibold">{monthLabel}</span>
				<button class="btn btn-circle btn-ghost btn-sm" onclick={() => goToMonth(1)}>
					<ChevronRight class="h-5 w-5" />
				</button>
			</div>
		</div>

		{#if loading}
			<div class="flex items-center justify-center py-12">
				<Loader2 class="h-8 w-8 animate-spin" />
			</div>
		{:else}
			<div class="overflow-x-auto">
				<div class="grid grid-cols-7 gap-px rounded-lg bg-base-300">
					{#each dayNames as name, i (i)}
						<div
							class="bg-base-200 p-2 text-center text-xs font-bold tracking-wide text-base-content/70 uppercase"
						>
							{name}
						</div>
					{/each}

					{#each monthGrid as week, _wi (_wi)}
						{#each week as cell (cell.date)}
							{@const movieCount = cell.items?.movies.length ?? 0}
							{@const episodeCount = cell.items?.episodes.length ?? 0}
							{@const totalItems = movieCount + episodeCount}
							{@const hasItems = totalItems > 0}
							<button
								class="min-h-[80px] bg-base-100 p-1.5 text-left transition-colors hover:bg-base-200 sm:min-h-[110px] sm:p-2 {cell.isToday
									? 'ring-2 ring-primary ring-inset'
									: ''}"
								onclick={() => openDay(cell)}
								disabled={!hasItems}
							>
								<div
									class="mb-1 text-xs font-medium sm:text-sm {cell.isCurrentMonth
										? cell.isToday
											? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-content'
											: 'text-base-content'
										: 'text-base-content/30'}"
								>
									{cell.dayOfMonth}
								</div>

								<div class="space-y-0.5">
									{#each (cell.items?.movies ?? []).slice(0, 2) as movie (movie.tmdbId)}
										<div
											class="truncate rounded bg-primary/20 px-1 py-0.5 text-[10px] font-medium text-primary sm:text-xs"
										>
											{movie.title}
										</div>
									{/each}
									{#each (cell.items?.episodes ?? []).slice(0, 2 - Math.min(movieCount, 2)) as ep (ep.episodeId)}
										<div
											class="truncate rounded bg-secondary/20 px-1 py-0.5 text-[10px] font-medium text-secondary sm:text-xs"
										>
											S{String(ep.seasonNumber).padStart(2, '0')}E{String(
												ep.episodeNumber
											).padStart(2, '0')}
											{ep.seriesTitle}
										</div>
									{/each}
									{#if totalItems > Math.min(movieCount, 2) + Math.min(episodeCount, 2 - Math.min(movieCount, 2))}
										<div class="text-[10px] text-base-content/50">
											{m.calendar_more({
												count:
													totalItems -
													(Math.min(movieCount, 2) +
														Math.min(episodeCount, 2 - Math.min(movieCount, 2)))
											})}
										</div>
									{/if}
								</div>
							</button>
						{/each}
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

{#if selectedDay}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-black/40"
		onclick={closePanel}
		onkeydown={(e) => e.key === 'Escape' && closePanel()}
	></div>

	<div
		class="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto bg-base-100 shadow-2xl transition-transform duration-300"
	>
		<div
			class="sticky top-0 z-10 flex items-center justify-between border-b border-base-200 bg-base-100 px-4 py-3"
		>
			<h2 class="text-lg font-bold">{formatPanelDate(selectedDay.date)}</h2>
			<button class="btn btn-circle btn-ghost btn-sm" onclick={closePanel}>
				<X class="h-5 w-5" />
			</button>
		</div>

		<div class="space-y-4 p-4">
			{#if selectedDay.movies.length > 0}
				<div>
					<h3
						class="mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-base-content/70 uppercase"
					>
						<Film class="h-4 w-4" />
						{m.common_movies()}
					</h3>
					<div class="space-y-2">
						{#each selectedDay.movies as movie (movie.tmdbId)}
							<a
								href={movie.inLibrary && movie.movieId
									? `/library/movie/${movie.movieId}`
									: `/discover/movie/${movie.tmdbId}`}
								class="flex items-center gap-3 rounded-lg bg-base-200 p-3 transition-colors hover:bg-base-300"
							>
								<div class="h-16 w-10 shrink-0 overflow-hidden rounded">
									<TmdbImage
										path={movie.posterPath}
										size="w92"
										alt={movie.title}
										class="h-16 w-10"
									/>
								</div>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium">{movie.title}</div>
									<div class="mt-1">
										{#if movie.inLibrary}
											<span class="badge badge-sm badge-primary">
												{m.calendar_inLibrary()}
											</span>
										{:else}
											<span class="badge badge-outline badge-sm">
												{m.calendar_inTheaters()}
											</span>
										{/if}
									</div>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			{#if selectedDay.episodes.length > 0}
				<div>
					<h3
						class="mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-base-content/70 uppercase"
					>
						<Tv class="h-4 w-4" />
						{m.common_episodes()}
					</h3>
					<div class="space-y-2">
						{#each selectedDay.episodes as ep (ep.episodeId)}
							<a
								href="/library/tv/{ep.seriesId}"
								class="flex items-center gap-3 rounded-lg bg-base-200 p-3 transition-colors hover:bg-base-300"
							>
								<div class="h-16 w-10 shrink-0 overflow-hidden rounded">
									<TmdbImage
										path={ep.seriesPosterPath}
										size="w92"
										alt={ep.seriesTitle}
										class="h-16 w-10"
									/>
								</div>
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium">{ep.seriesTitle}</div>
									<div class="text-xs text-base-content/60">
										S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(
											2,
											'0'
										)}
										{#if ep.title}
											- {ep.title}
										{/if}
									</div>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			{#if selectedDay.movies.length === 0 && selectedDay.episodes.length === 0}
				<div class="py-8 text-center text-base-content/50">
					{m.calendar_noUpcoming()}
				</div>
			{/if}
		</div>
	</div>
{/if}
