/**
 * Custom Formats API Tests
 *
 * Tests for GET, POST, PUT, DELETE handlers at /api/custom-formats
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { initTestDb, closeTestDb, clearTestDb, getTestDb } from '../../../test/db-helper';
import {
	api,
	type ErrorResponse,
	type DeleteResponse,
	type FormatResponse,
	type FormatsListResponse
} from '../../../test/api-helper';
import { customFormats } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Initialize the test database FIRST before any mocks
initTestDb();

// Must mock before importing the handlers
vi.mock('$lib/server/db', async () => {
	const { getTestDb } = await import('../../../test/db-helper');
	return {
		get db() {
			return getTestDb().db;
		},
		get sqlite() {
			return getTestDb().sqlite;
		},
		initializeDatabase: vi.fn().mockResolvedValue(undefined)
	};
});

vi.mock('$lib/logging', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn()
	}
}));

// Import handlers after mocks are set up
const { GET, POST, PUT, DELETE } = await import('./+server');

// Valid condition for tests
const validCondition = {
	name: 'Test Condition',
	type: 'release_title' as const,
	required: true,
	negate: false,
	pattern: 'TEST'
};

describe('Custom Formats API', () => {
	beforeAll(() => {
		initTestDb();
	});

	afterAll(() => {
		closeTestDb();
	});

	beforeEach(() => {
		clearTestDb();
	});

	// =========================================================================
	// GET Tests
	// =========================================================================
	describe('GET /api/custom-formats', () => {
		it('returns built-in formats when database is empty', async () => {
			const { status, data } = await api.get<FormatsListResponse>(GET);

			expect(status).toBe(200);
			expect(data.formats.length).toBeGreaterThan(0);
			expect(data.builtInCount).toBeGreaterThan(0);
			expect(data.customCount).toBe(0);

			// All formats should be built-in
			data.formats.forEach((f) => {
				expect(f.isBuiltIn).toBe(true);
			});
		});

		it('returns custom formats along with built-in formats', async () => {
			const { db } = getTestDb();

			// Insert a custom format
			await db.insert(customFormats).values({
				id: 'my-custom-format',
				name: 'My Custom Format',
				description: 'Test format',
				category: 'other',
				tags: ['test'],
				conditions: [validCondition],
				enabled: true
			});

			const { data } = await api.get<FormatsListResponse>(GET);

			expect(data.customCount).toBe(1);
			const customFormat = data.formats.find((f) => f.id === 'my-custom-format');
			expect(customFormat).toBeDefined();
			expect(customFormat?.name).toBe('My Custom Format');
			expect(customFormat?.isBuiltIn).toBe(false);
		});

		it('filters by type=builtin', async () => {
			const { db } = getTestDb();

			await db.insert(customFormats).values({
				id: 'test-custom',
				name: 'Test Custom',
				category: 'other',
				conditions: [validCondition]
			});

			const { data } = await api.get<FormatsListResponse>(GET, {
				url: 'http://localhost/api/custom-formats?type=builtin'
			});

			data.formats.forEach((f) => {
				expect(f.isBuiltIn).toBe(true);
			});
		});

		it('filters by type=custom', async () => {
			const { db } = getTestDb();

			await db.insert(customFormats).values({
				id: 'test-custom',
				name: 'Test Custom',
				category: 'other',
				conditions: [validCondition]
			});

			const { data } = await api.get<FormatsListResponse>(GET, {
				url: 'http://localhost/api/custom-formats?type=custom'
			});

			expect(data.formats.length).toBe(1);
			data.formats.forEach((f) => {
				expect(f.isBuiltIn).toBe(false);
			});
		});

		it('filters by category', async () => {
			const { data } = await api.get<FormatsListResponse>(GET, {
				url: 'http://localhost/api/custom-formats?category=audio'
			});

			data.formats.forEach((f) => {
				expect(f.category).toBe('audio');
			});
		});

		it('searches by name', async () => {
			const { data } = await api.get<FormatsListResponse>(GET, {
				url: 'http://localhost/api/custom-formats?search=truehd'
			});

			expect(data.formats.length).toBeGreaterThan(0);
			data.formats.forEach((f) => {
				const matches =
					f.name.toLowerCase().includes('truehd') ||
					f.description?.toLowerCase().includes('truehd') ||
					f.tags?.some((t) => t.toLowerCase().includes('truehd'));
				expect(matches).toBe(true);
			});
		});
	});

	// =========================================================================
	// POST Tests (Create Format)
	// =========================================================================
	describe('POST /api/custom-formats', () => {
		it('creates format with required fields only', async () => {
			const { status, data } = await api.post<FormatResponse>(POST, {
				name: 'Test Format',
				category: 'other',
				conditions: [validCondition]
			});

			expect(status).toBe(201);
			expect(data.name).toBe('Test Format');
			expect(data.id).toBeDefined();
			expect(data.category).toBe('other');
			expect(data.enabled).toBe(true);
		});

		it('creates format with custom ID', async () => {
			const { status, data } = await api.post<FormatResponse>(POST, {
				id: 'custom-id-format',
				name: 'Custom ID Format',
				category: 'other',
				conditions: [validCondition]
			});

			expect(status).toBe(201);
			expect(data.id).toBe('custom-id-format');
		});

		it('creates format with all optional fields', async () => {
			const { status, data } = await api.post<FormatResponse>(POST, {
				id: 'full-format',
				name: 'Full Format',
				description: 'A complete format',
				category: 'release_group_tier',
				tags: ['tier1', 'hdr'],
				conditions: [
					validCondition,
					{
						name: 'HDR Check',
						type: 'hdr',
						required: false,
						negate: false,
						hdr: 'HDR10'
					}
				],
				enabled: false
			});

			expect(status).toBe(201);
			expect(data.description).toBe('A complete format');
			expect(data.tags).toEqual(['tier1', 'hdr']);
			expect(data.conditions!.length).toBe(2);
			expect(data.enabled).toBe(false);
		});

		it('validates condition types', async () => {
			const { status, data } = await api.post<FormatResponse>(POST, {
				name: 'Resolution Format',
				category: 'resolution',
				conditions: [
					{
						name: 'Resolution Check',
						type: 'resolution',
						required: true,
						negate: false,
						resolution: '2160p'
					}
				]
			});

			expect(status).toBe(201);
			expect(data.name).toBe('Resolution Format');
		});

		it('rejects reserved format IDs', async () => {
			// Using a known built-in format ID
			const { status, data } = await api.post<ErrorResponse>(POST, {
				id: 'audio-truehd',
				name: 'Fake TrueHD',
				category: 'audio',
				conditions: [validCondition]
			});

			expect(status).toBe(400);
			expect(data.error).toContain('reserved');
		});

		it('rejects duplicate format IDs', async () => {
			// Create first format
			await api.post<FormatResponse>(POST, {
				id: 'duplicate-test',
				name: 'First',
				category: 'other',
				conditions: [validCondition]
			});

			// Try to create second with same ID
			const { status, data } = await api.post<ErrorResponse>(POST, {
				id: 'duplicate-test',
				name: 'Second',
				category: 'other',
				conditions: [validCondition]
			});

			expect(status).toBe(409);
			expect(data.error).toContain('already exists');
		});

		it('requires at least one condition', async () => {
			const { status, data } = await api.post<ErrorResponse>(POST, {
				name: 'No Conditions',
				category: 'other',
				conditions: []
			});

			expect(status).toBe(400);
			expect(data.error).toContain('Invalid');
		});

		it('validates required name field', async () => {
			const { status, data } = await api.post<ErrorResponse>(POST, {
				category: 'other',
				conditions: [validCondition]
			});

			expect(status).toBe(400);
			expect(data.error).toContain('Invalid');
		});

		it('validates category enum', async () => {
			const { status, data } = await api.post<ErrorResponse>(POST, {
				name: 'Bad Category',
				category: 'invalid_category',
				conditions: [validCondition]
			});

			expect(status).toBe(400);
			expect(data.error).toContain('Invalid');
		});
	});

	// =========================================================================
	// PUT Tests (Update Format)
	// =========================================================================
	describe('PUT /api/custom-formats', () => {
		it('updates custom format fields', async () => {
			// Create a format
			await api.post<FormatResponse>(POST, {
				id: 'update-test',
				name: 'Original Name',
				category: 'other',
				conditions: [validCondition]
			});

			// Update it
			const { status, data } = await api.put<FormatResponse>(PUT, {
				id: 'update-test',
				name: 'Updated Name',
				description: 'New description',
				category: 'other',
				conditions: [validCondition]
			});

			expect(status).toBe(200);
			expect(data.name).toBe('Updated Name');
			expect(data.description).toBe('New description');
		});

		it('updates conditions', async () => {
			await api.post<FormatResponse>(POST, {
				id: 'conditions-test',
				name: 'Conditions Test',
				category: 'other',
				conditions: [validCondition]
			});

			const newCondition = {
				name: 'New Condition',
				type: 'release_group' as const,
				required: true,
				negate: false,
				pattern: '^SPARKS$'
			};

			const { status, data } = await api.put<FormatResponse>(PUT, {
				id: 'conditions-test',
				name: 'Conditions Test',
				category: 'other',
				conditions: [newCondition]
			});

			expect(status).toBe(200);
			expect(data.conditions!.length).toBe(1);
		});

		it('rejects updates to built-in formats', async () => {
			const { status, data } = await api.put<ErrorResponse>(PUT, {
				id: 'audio-truehd',
				name: 'Modified TrueHD',
				category: 'audio',
				conditions: [validCondition]
			});

			expect(status).toBe(400);
			expect(data.error).toContain('built-in');
		});

		it('returns 404 for non-existent format', async () => {
			const { status, data } = await api.put<ErrorResponse>(PUT, {
				id: 'does-not-exist',
				name: 'New Name',
				category: 'other',
				conditions: [validCondition]
			});

			expect(status).toBe(404);
			expect(data.error).toContain('not found');
		});

		it('requires format ID', async () => {
			const { status, data } = await api.put<ErrorResponse>(PUT, {
				name: 'No ID',
				category: 'other',
				conditions: [validCondition]
			});

			expect(status).toBe(400);
			expect(data.error).toContain('ID is required');
		});
	});

	// =========================================================================
	// DELETE Tests
	// =========================================================================
	describe('DELETE /api/custom-formats', () => {
		it('deletes custom format', async () => {
			await api.post<FormatResponse>(POST, {
				id: 'delete-me',
				name: 'Delete Me',
				category: 'other',
				conditions: [validCondition]
			});

			const { status, data } = await api.delete<DeleteResponse>(DELETE, { id: 'delete-me' });

			expect(status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.deleted.id).toBe('delete-me');

			// Verify it's gone
			const { db } = getTestDb();
			const remaining = await db
				.select()
				.from(customFormats)
				.where(eq(customFormats.id, 'delete-me'));
			expect(remaining.length).toBe(0);
		});

		it('rejects deletion of built-in format', async () => {
			const { status, data } = await api.delete<ErrorResponse>(DELETE, { id: 'audio-truehd' });

			expect(status).toBe(400);
			expect(data.error).toContain('built-in');
		});

		it('returns 404 for non-existent format', async () => {
			const { status, data } = await api.delete<ErrorResponse>(DELETE, { id: 'ghost' });

			expect(status).toBe(404);
			expect(data.error).toContain('not found');
		});

		it('requires format ID', async () => {
			const { status, data } = await api.delete<ErrorResponse>(DELETE, {});

			expect(status).toBe(400);
			expect(data.error).toContain('ID is required');
		});
	});
});
