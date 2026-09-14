// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import LanguagesPage from '../../../routes/settings/languages/+page.svelte';
import type { PageData } from '../../../routes/settings/languages/$types';

const { updateLanguageSettings } = vi.hoisted(() => ({
	updateLanguageSettings: vi.fn().mockResolvedValue({})
}));

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));

vi.mock('$lib/api', () => ({
	updateLanguageSettings,
	ApiError: class ApiError extends Error {}
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toasts: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));

interface HubSettings {
	defaultProfileId: string | null;
	metadataLocale: string;
	region: string;
	discoverOriginalFilter: string | null;
	unknownSubtitlePolicy: 'und' | 'assume-language';
	assumedLanguage: string | null;
	autoSyncSubtitles: boolean;
	preferOriginalTitle: boolean;
}

const baseSettings: HubSettings = {
	defaultProfileId: 'p1',
	metadataLocale: 'en-US',
	region: 'US',
	discoverOriginalFilter: null,
	unknownSubtitlePolicy: 'und',
	assumedLanguage: null,
	autoSyncSubtitles: true,
	preferOriginalTitle: false
};

const profiles = [
	{ id: 'p1', name: 'English' },
	{ id: 'p2', name: 'French' }
];

function renderPage(overrides: Partial<HubSettings> = {}) {
	const data = {
		settings: { ...baseSettings, ...overrides },
		profiles,
		countries: [
			{ code: 'US', name: 'United States' },
			{ code: 'DE', name: 'Germany' }
		],
		languages: [
			{ code: 'de', name: 'German' },
			{ code: 'en', name: 'English' },
			{ code: 'pt-BR', name: 'Portuguese (Brazil)' }
		],
		tmdbConfigured: true
	} as unknown as PageData;
	return render(LanguagesPage, { props: { data } });
}

describe('languages & localization hub', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders all sections with the loaded settings values', async () => {
		const { container } = renderPage({ preferOriginalTitle: true });

		// Interface section embeds the per-user LanguageSelector
		expect(container.querySelector('.language-selector')).toBeTruthy();

		// Metadata section values
		const metadataLocale = screen.getByRole('combobox', {
			name: /metadata language/i
		}) as HTMLSelectElement;
		expect(metadataLocale.value).toBe('en-US');

		const region = screen.getByRole('combobox', { name: /^region$/i }) as HTMLSelectElement;
		expect(region.value).toBe('US');

		const discoverFilter = screen.getByRole('combobox', {
			name: /original-language filter/i
		}) as HTMLSelectElement;
		expect(discoverFilter.value).toBe('');

		const preferOriginal = screen.getByRole('checkbox', {
			name: /show original titles by default/i
		}) as HTMLInputElement;
		expect(preferOriginal.checked).toBe(true);

		// Audio & subtitles section values
		const defaultProfile = screen.getByRole('combobox', {
			name: /default profile/i
		}) as HTMLSelectElement;
		expect(defaultProfile.value).toBe('p1');

		const autoSync = screen.getByRole('checkbox', {
			name: /auto-sync subtitles/i
		}) as HTMLInputElement;
		expect(autoSync.checked).toBe(true);
	});

	it('only sends the changed fields on save', async () => {
		renderPage();

		const region = screen.getByRole('combobox', { name: /^region$/i }) as HTMLSelectElement;
		await fireEvent.change(region, { target: { value: 'DE' } });
		await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

		expect(updateLanguageSettings).toHaveBeenCalledTimes(1);
		expect(updateLanguageSettings).toHaveBeenCalledWith({ region: 'DE' });
	});

	it('sends an empty patch when nothing changed', async () => {
		renderPage();

		await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

		expect(updateLanguageSettings).toHaveBeenCalledWith({});
	});

	it('shows the assumed-language select only for the assume-language policy', async () => {
		const { container } = renderPage();

		expect(
			screen.queryByRole('combobox', { name: /assumed language/i })
		).toBeNull();

		const policy = screen.getByRole('combobox', {
			name: /unknown subtitle language/i
		}) as HTMLSelectElement;
		await fireEvent.change(policy, { target: { value: 'assume-language' } });

		const assumed = screen.getByRole('combobox', {
			name: /assumed language/i
		}) as HTMLSelectElement;
		expect(assumed).toBeTruthy();

		// Changing the policy alone must not write the assumed language
		await fireEvent.change(assumed, { target: { value: 'de' } });
		await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
		expect(updateLanguageSettings).toHaveBeenCalledTimes(1);
		expect(updateLanguageSettings).toHaveBeenCalledWith({
			unknownSubtitlePolicy: 'assume-language',
			assumedLanguage: 'de'
		});
		expect(container).toBeTruthy();
	});

	it('clears the stored assumed language when switching back to the und policy', async () => {
		renderPage({ unknownSubtitlePolicy: 'assume-language', assumedLanguage: 'fr' });

		const policy = screen.getByRole('combobox', {
			name: /unknown subtitle language/i
		}) as HTMLSelectElement;
		await fireEvent.change(policy, { target: { value: 'und' } });

		// The select is hidden again and the stored language is cleared on save
		expect(screen.queryByRole('combobox', { name: /assumed language/i })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
		expect(updateLanguageSettings).toHaveBeenCalledWith({
			unknownSubtitlePolicy: 'und',
			assumedLanguage: null
		});
	});

	it('links to language profiles, subtitle providers and naming settings', () => {
		renderPage();

		expect(
			screen.getByRole('link', { name: /language profiles/i }).getAttribute('href')
		).toBe('/settings/integrations/language-profiles');
		expect(
			screen.getByRole('link', { name: /subtitle providers/i }).getAttribute('href')
		).toBe('/settings/integrations/subtitle-providers');
		expect(screen.getByRole('link', { name: /^naming$/i }).getAttribute('href')).toBe(
			'/settings/library/naming'
		);
	});
});
