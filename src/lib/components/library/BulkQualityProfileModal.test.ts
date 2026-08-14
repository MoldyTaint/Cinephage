// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import BulkQualityProfileModal from './BulkQualityProfileModal.svelte';

const qualityProfiles = [
	{ id: 'balanced', name: 'Balanced', description: '', isBuiltIn: true, isDefault: true },
	{ id: 'hq', name: 'HQ', description: '', isBuiltIn: false, isDefault: false }
];

describe('BulkQualityProfileModal default profile persistence (issue #493)', () => {
	let onSave: (profileId: string | null) => void;

	beforeEach(() => {
		onSave = vi.fn<(profileId: string | null) => void>();
	});

	afterEach(() => {
		cleanup();
	});

	function renderModal() {
		return render(BulkQualityProfileModal, {
			props: {
				open: true,
				selectedCount: 3,
				qualityProfiles,
				saving: false,
				mediaType: 'movie',
				onSave,
				onCancel: vi.fn()
			}
		});
	}

	it('persists the default scoring profile id when explicitly selected', async () => {
		renderModal();

		const select = screen.getByRole('combobox', { name: /quality profile/i }) as HTMLSelectElement;
		fireEvent.change(select, { target: { value: 'balanced' } });
		expect(select.value).toBe('balanced');

		await fireEvent.click(screen.getByRole('button', { name: /apply/i }));

		expect(onSave).toHaveBeenCalledWith('balanced');
	});

	it('keeps null when the default profile was not explicitly selected', async () => {
		renderModal();

		await fireEvent.click(screen.getByRole('button', { name: /apply/i }));

		expect(onSave).toHaveBeenCalledWith(null);
	});
});
