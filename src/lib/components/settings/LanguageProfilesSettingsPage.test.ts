// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
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

describe('language profile editor labels via paraglide keys', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders variant/accessibility select options from message keys', async () => {
		renderPage(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

		const variantSelect = screen.getByRole('combobox', {
			name: 'Subtitle variant'
		}) as HTMLSelectElement;
		const variantOptions = within(variantSelect)
			.getAllByRole('option')
			.map((o) => o.textContent);
		expect(variantOptions).toEqual(['Regular', 'Forced', 'Both (regular + forced)']);

		const accessibilitySelect = screen.getByRole('combobox', {
			name: 'Subtitle accessibility'
		}) as HTMLSelectElement;
		const accessibilityOptions = within(accessibilitySelect)
			.getAllByRole('option')
			.map((o) => o.textContent);
		expect(accessibilityOptions).toEqual(['Any', 'Prefer HI', 'Require HI', 'Exclude HI']);
	});

	it('labels the requirement selects via aria-label keys', async () => {
		renderPage(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

		expect(screen.getByRole('combobox', { name: 'Subtitle language' })).not.toBeNull();
		expect(screen.getByRole('combobox', { name: 'Subtitle variant' })).not.toBeNull();
		expect(screen.getByRole('combobox', { name: 'Subtitle accessibility' })).not.toBeNull();
	});

	it('renders the cutoff strings from message keys', async () => {
		renderPage(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

		expect(
			screen.getByRole('radio', { name: 'No cutoff (acquire all requirements)' })
		).not.toBeNull();
		expect(screen.getByRole('radio', { name: 'Stop after this' })).not.toBeNull();
	});

	it('labels the reorder buttons via aria-label keys', async () => {
		renderPage(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

		expect(screen.getByRole('button', { name: 'Move subtitle requirement up' })).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Move subtitle requirement down' })).not.toBeNull();
	});

	it('renders the audio section strings from message keys', async () => {
		renderPage(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

		expect(screen.getByText('Audio')).not.toBeNull();
		expect(screen.getByText('Prefer original audio track')).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Add fallback language' })).not.toBeNull();
		// No fallback rows yet: the per-row controls appear only after adding one.
		await fireEvent.click(screen.getByRole('button', { name: 'Add fallback language' }));
		expect(screen.getByRole('combobox', { name: 'Fallback audio language' })).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Move audio language up' })).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Move audio language down' })).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Remove fallback audio language' })).not.toBeNull();
	});

	it('renders the profile card summary from message keys', () => {
		renderPage('p2');

		// p2 has fallback audio languages, so the summary line renders:
		// "<Audio:> <prefer original> · French".
		const summary = screen.getByText(/prefer original/);
		expect(summary.textContent).toContain('Audio:');
	});
});
