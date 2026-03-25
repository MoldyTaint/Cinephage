<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		language: string;
		isForced?: boolean;
		isHearingImpaired?: boolean;
		format?: string;
		showTooltip?: boolean;
		size?: 'xs' | 'sm' | 'md';
	}

	let {
		language,
		isForced = false,
		isHearingImpaired = false,
		format,
		showTooltip = true,
		size = 'sm'
	}: Props = $props();

	// Map common language codes to display names
	const languageNames: Record<string, string> = {
		en: 'English',
		es: 'Spanish',
		fr: 'French',
		de: 'German',
		it: 'Italian',
		pt: 'Portuguese',
		ru: 'Russian',
		ja: 'Japanese',
		ko: 'Korean',
		zh: 'Chinese',
		ar: 'Arabic',
		hi: 'Hindi',
		nl: 'Dutch',
		pl: 'Polish',
		sv: 'Swedish',
		da: 'Danish',
		no: 'Norwegian',
		fi: 'Finnish',
		tr: 'Turkish',
		el: 'Greek',
		he: 'Hebrew',
		th: 'Thai',
		vi: 'Vietnamese',
		id: 'Indonesian',
		cs: 'Czech',
		hu: 'Hungarian',
		ro: 'Romanian',
		bg: 'Bulgarian',
		uk: 'Ukrainian'
	};

	// Use $derived for reactive computed values from props
	const displayCode = $derived(language.toUpperCase().slice(0, 2));
	const fullName = $derived(languageNames[language.toLowerCase()] || language);

	// Build tooltip reactively
	const tooltip = $derived.by(() => {
		const parts = [fullName];
		if (isForced) parts.push('Forced');
		if (isHearingImpaired) parts.push('SDH/HI');
		if (format) parts.push(format.toUpperCase());
		return parts.join(' - ');
	});

	// Size classes
	const sizeClasses = {
		xs: 'badge-xs text-[10px]',
		sm: 'badge-sm text-xs',
		md: 'text-sm'
	};
</script>

<span
	class="badge gap-0.5 badge-outline {sizeClasses[size]}"
	class:badge-secondary={isForced}
	class:badge-info={isHearingImpaired && !isForced}
	title={showTooltip ? tooltip : undefined}
>
	{displayCode}
	{#if isForced}
		<span class="ml-0.5 text-[8px] opacity-70">F</span>
	{/if}
	{#if isHearingImpaired}
		<span class="ml-0.5 text-[8px] opacity-70">HI</span>
	{/if}
</span>
