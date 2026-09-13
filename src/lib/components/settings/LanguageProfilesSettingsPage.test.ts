// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import LanguageProfilesPage from '../../../routes/settings/integrations/language-profiles/+page.svelte';
import type { PageData } from '../../../routes/settings/integrations/language-profiles/$types';

const { updateLanguageSettings, createLanguageProfile, invalidateAll } = vi.hoisted(() => ({
	updateLanguageSettings: vi.fn().mockResolvedValue({}),
	createLanguageProfile: vi.fn().mockResolvedValue({ success: true }),
	invalidateAll: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$app/navigation', () => ({ invalidateAll }));

vi.mock('$lib/api', () => ({
	createLanguageProfile,
	updateLanguageProfile: vi.fn().mockResolvedValue({ success: true }),
	deleteLanguageProfile: vi.fn().mockResolvedValue({ success: true }),
	updateLanguageSettings,
	ApiError: class ApiError extends Error {}
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toasts: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
}));

const profiles = [
	{
		id: 'p1',
		name: 'English',
		audio: { preferOriginal: true, languages: [] },
		subtitles: [{ tag: 'en', variant: 'regular' as const, accessibility: 'any' as const }],
		cutoffRank: null,
		minimumScore: 70,
		upgradesAllowed: true
	},
	{
		id: 'p2',
		name: 'French',
		audio: { preferOriginal: true, languages: ['fr'] },
		subtitles: [{ tag: 'fr', variant: 'forced' as const, accessibility: 'require-hi' as const }],
		cutoffRank: 0,
		minimumScore: 80,
		upgradesAllowed: false
	}
];

function renderPage(defaultProfileId: string | null) {
	const data = { profiles, defaultProfileId } as unknown as PageData;
	return render(LanguageProfilesPage, { props: { data } });
}

describe('language profiles settings page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('writes the selected default profile via the language-settings endpoint', async () => {
		renderPage('p1');

		const select = screen.getByRole('combobox', {
			name: /default profile/i
		}) as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: 'p2' } });
		await fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

		expect(updateLanguageSettings).toHaveBeenCalledTimes(1);
		expect(updateLanguageSettings).toHaveBeenCalledWith({ defaultProfileId: 'p2' });
		expect(invalidateAll).toHaveBeenCalled();
	});

	it('writes a null default profile when none is selected', async () => {
		renderPage('p1');

		const select = screen.getByRole('combobox', {
			name: /default profile/i
		}) as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

		expect(updateLanguageSettings).toHaveBeenCalledWith({ defaultProfileId: null });
	});
});

describe('language profile editor payload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('creates a profile with the v2 audio/subtitles shape', async () => {
		renderPage(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));
		await fireEvent.input(screen.getByLabelText(/profile name/i), {
			target: { value: 'Test Profile' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /create/i }));

		expect(createLanguageProfile).toHaveBeenCalledTimes(1);
		expect(createLanguageProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Test Profile',
				audio: { preferOriginal: true, languages: [] },
				subtitles: [{ tag: 'en', variant: 'regular', accessibility: 'any' }],
				cutoffRank: null,
				minimumScore: 70,
				upgradesAllowed: true
			})
		);
	});
});
