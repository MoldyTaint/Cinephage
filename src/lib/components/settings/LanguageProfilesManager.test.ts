// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
import LanguageProfilesManager from './languages/LanguageProfilesManager.svelte';

const { createLanguageProfile, invalidateAll } = vi.hoisted(() => ({
	createLanguageProfile: vi.fn().mockResolvedValue({ success: true }),
	invalidateAll: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$app/navigation', () => ({ invalidateAll }));

vi.mock('$lib/api', () => ({
	createLanguageProfile,
	updateLanguageProfile: vi.fn().mockResolvedValue({ success: true }),
	deleteLanguageProfile: vi.fn().mockResolvedValue({ success: true }),
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

function renderManager(defaultProfileId: string | null) {
	return render(LanguageProfilesManager, { props: { profiles, defaultProfileId } });
}

describe('language profiles manager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('marks the default profile via the defaultProfileId prop', () => {
		renderManager('p2');

		const badge = screen.getByText('Default');
		expect(badge.closest('h3')?.textContent).toContain('French');
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
		renderManager(null);

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
		renderManager(null);

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
		renderManager(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

		expect(screen.getByRole('combobox', { name: 'Subtitle language' })).not.toBeNull();
		expect(screen.getByRole('combobox', { name: 'Subtitle variant' })).not.toBeNull();
		expect(screen.getByRole('combobox', { name: 'Subtitle accessibility' })).not.toBeNull();
	});

	it('renders the cutoff strings from message keys', async () => {
		renderManager(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

		expect(
			screen.getByRole('radio', { name: 'No cutoff (acquire all requirements)' })
		).not.toBeNull();
		expect(screen.getByRole('radio', { name: 'Stop after this' })).not.toBeNull();
	});

	it('labels the reorder buttons via aria-label keys', async () => {
		renderManager(null);

		await fireEvent.click(screen.getByRole('button', { name: /add profile/i }));

		expect(screen.getByRole('button', { name: 'Move subtitle requirement up' })).not.toBeNull();
		expect(screen.getByRole('button', { name: 'Move subtitle requirement down' })).not.toBeNull();
	});

	it('renders the audio section strings from message keys', async () => {
		renderManager(null);

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
		renderManager('p2');

		// p2 has fallback audio languages, so the summary line renders:
		// "<Audio:> <prefer original> · French".
		const summary = screen.getByText(/prefer original/);
		expect(summary.textContent).toContain('Audio:');
	});
});
