<script lang="ts" module>
	import * as m from '$lib/paraglide/messages.js';

	const fallbackMessage = m.error_fallbackMessage();
</script>

<script lang="ts">
	import { page } from '$app/state';

	let { error }: { error: App.Error | undefined } = $props();
	const status = $derived(page.status);
	const message = $derived(error?.message || fallbackMessage);
	const errorId = $derived(error?.supportId ?? m.error_supportIdUnavailable());
</script>

<svelte:head>
	<title>{m.error_pageTitle({ status: String(status) })}</title>
</svelte:head>

<div
	class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(185,28,28,0.16),_transparent_38%),linear-gradient(180deg,_#120f10_0%,_#191516_48%,_#0b0a0a_100%)] text-zinc-100"
>
	<div class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
		<div
			class="mb-8 inline-flex w-fit items-center gap-3 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium tracking-[0.18em] text-red-200 uppercase"
		>
			<span class="h-2 w-2 rounded-full bg-red-300"></span>
			{m.error_playbackInterrupted()}
		</div>

		<h1 class="max-w-2xl font-serif text-5xl leading-tight font-semibold text-white sm:text-6xl">
			{message}
		</h1>

		<p class="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
			{m.error_description()}
		</p>

		<div
			class="mt-10 grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:grid-cols-3"
		>
			<div>
				<p class="text-xs font-medium tracking-[0.18em] text-zinc-400 uppercase">
					{m.error_statusLabel()}
				</p>
				<p class="mt-2 text-2xl font-semibold text-white">{status}</p>
			</div>
			<div class="sm:col-span-2">
				<p class="text-xs font-medium tracking-[0.18em] text-zinc-400 uppercase">
					{m.error_supportIdLabel()}
				</p>
				<p class="mt-2 font-mono text-sm break-all text-red-100">
					{errorId}
				</p>
			</div>
		</div>

		<div class="mt-10 flex flex-col gap-3 sm:flex-row">
			<a
				href="/"
				class="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-red-100"
			>
				{m.error_returnHome()}
			</a>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-red-300/60 hover:bg-white/8"
				onclick={() => history.back()}
			>
				{m.error_goBack()}
			</button>
		</div>
	</div>
</div>
