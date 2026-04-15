/**
 * Language Profile Service
 *
 * Manages language profiles that define subtitle preferences.
 * Each movie/series can have a profile that specifies which languages
 * to search for and in what priority order.
 */

import { db } from '$lib/server/db';
import {
	languageProfiles,
	movies,
	series,
	episodes,
	subtitles,
	type LanguagePreference
} from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { createChildLogger } from '$lib/logging';

const logger = createChildLogger({ logDomain: 'subtitles' as const });
import type { SubtitleStatus, LanguageCode } from '../types';
import { normalizeLanguageCode } from '$lib/shared/languages';

/** Language profile with all fields */
export interface LanguageProfile {
	id: string;
	name: string;
	languages: LanguagePreference[];
	cutoffIndex: number;
	upgradesAllowed: boolean;
	minimumScore: number;
	isDefault: boolean;
	createdAt?: string;
	updatedAt?: string;
}

/** Create profile input */
export type CreateLanguageProfile = Omit<LanguageProfile, 'id' | 'createdAt' | 'updatedAt'>;

/** Update profile input */
export type UpdateLanguageProfile = Partial<
	Omit<LanguageProfile, 'id' | 'createdAt' | 'updatedAt'>
>;

/**
 * Service for managing language profiles
 */
export class LanguageProfileService {
	private static instance: LanguageProfileService | null = null;

	private constructor() {}

	static getInstance(): LanguageProfileService {
		if (!LanguageProfileService.instance) {
			LanguageProfileService.instance = new LanguageProfileService();
		}
		return LanguageProfileService.instance;
	}

	// =========================================================================
	// Profile CRUD
	// =========================================================================

	/**
	 * Get all language profiles
	 */
	async getProfiles(): Promise<LanguageProfile[]> {
		const rows = await db.select().from(languageProfiles);
		return rows.map((row) => this.rowToProfile(row));
	}

	/**
	 * Get a specific profile by ID
	 */
	async getProfile(id: string): Promise<LanguageProfile | undefined> {
		const rows = await db.select().from(languageProfiles).where(eq(languageProfiles.id, id));
		return rows[0] ? this.rowToProfile(rows[0]) : undefined;
	}

	/**
	 * Get the default profile
	 */
	async getDefaultProfile(): Promise<LanguageProfile | undefined> {
		const rows = await db
			.select()
			.from(languageProfiles)
			.where(eq(languageProfiles.isDefault, true))
			.limit(1);
		return rows[0] ? this.rowToProfile(rows[0]) : undefined;
	}

	/**
	 * Create a new profile
	 */
	async createProfile(profile: CreateLanguageProfile): Promise<LanguageProfile> {
		// Validate languages
		if (!profile.languages || profile.languages.length === 0) {
			throw new Error('At least one language is required');
		}

		const id = randomUUID();

		// If this is the first profile or marked as default, clear other defaults
		if (profile.isDefault) {
			await db
				.update(languageProfiles)
				.set({ isDefault: false, updatedAt: new Date().toISOString() })
				.where(eq(languageProfiles.isDefault, true));
		}

		await db.insert(languageProfiles).values({
			id,
			name: profile.name,
			languages: profile.languages,
			cutoffIndex: profile.cutoffIndex,
			upgradesAllowed: profile.upgradesAllowed,
			minimumScore: profile.minimumScore,
			isDefault: profile.isDefault
		});

		const created = await this.getProfile(id);
		if (!created) {
			throw new Error('Failed to create profile');
		}

		logger.info({ id, name: profile.name }, 'Created language profile');
		return created;
	}

	/**
	 * Update a profile
	 */
	async updateProfile(id: string, updates: UpdateLanguageProfile): Promise<LanguageProfile> {
		const existing = await this.getProfile(id);
		if (!existing) {
			throw new Error(`Profile not found: ${id}`);
		}

		const updateData: Record<string, unknown> = {
			updatedAt: new Date().toISOString()
		};

		if (updates.name !== undefined) updateData.name = updates.name;
		if (updates.languages !== undefined) updateData.languages = updates.languages;
		if (updates.cutoffIndex !== undefined) updateData.cutoffIndex = updates.cutoffIndex;
		if (updates.upgradesAllowed !== undefined) updateData.upgradesAllowed = updates.upgradesAllowed;
		if (updates.minimumScore !== undefined) updateData.minimumScore = updates.minimumScore;

		// Handle default flag
		if (updates.isDefault === true) {
			// Clear other defaults first
			await db
				.update(languageProfiles)
				.set({ isDefault: false, updatedAt: new Date().toISOString() })
				.where(eq(languageProfiles.isDefault, true));
			updateData.isDefault = true;
		} else if (updates.isDefault === false) {
			updateData.isDefault = false;
		}

		await db.update(languageProfiles).set(updateData).where(eq(languageProfiles.id, id));

		const updated = await this.getProfile(id);
		if (!updated) {
			throw new Error('Failed to update profile');
		}

		logger.info({ id, name: updated.name }, 'Updated language profile');
		return updated;
	}

	/**
	 * Delete a profile
	 */
	async deleteProfile(id: string): Promise<void> {
		const existing = await this.getProfile(id);
		if (!existing) {
			throw new Error(`Profile not found: ${id}`);
		}

		// Remove profile from any movies/series using it
		await db
			.update(movies)
			.set({ languageProfileId: null })
			.where(eq(movies.languageProfileId, id));
		await db
			.update(series)
			.set({ languageProfileId: null })
			.where(eq(series.languageProfileId, id));

		// Delete the profile
		await db.delete(languageProfiles).where(eq(languageProfiles.id, id));

		logger.info({ id }, 'Deleted language profile');
	}

	// =========================================================================
	// Profile Assignment
	// =========================================================================

	/**
	 * Get profile for a movie (or default)
	 */
	async getProfileForMovie(movieId: string): Promise<LanguageProfile | undefined> {
		const movie = await db.select().from(movies).where(eq(movies.id, movieId)).limit(1);
		if (!movie[0]) return undefined;

		if (movie[0].languageProfileId) {
			return this.getProfile(movie[0].languageProfileId);
		}

		return this.getDefaultProfile();
	}

	/**
	 * Get profile for a series (or default)
	 */
	async getProfileForSeries(seriesId: string): Promise<LanguageProfile | undefined> {
		const show = await db.select().from(series).where(eq(series.id, seriesId)).limit(1);
		if (!show[0]) return undefined;

		if (show[0].languageProfileId) {
			return this.getProfile(show[0].languageProfileId);
		}

		return this.getDefaultProfile();
	}

	/**
	 * Assign a profile to a movie
	 */
	async assignToMovie(movieId: string, profileId: string | null): Promise<void> {
		await db.update(movies).set({ languageProfileId: profileId }).where(eq(movies.id, movieId));
	}

	/**
	 * Assign a profile to a series
	 */
	async assignToSeries(seriesId: string, profileId: string | null): Promise<void> {
		await db.update(series).set({ languageProfileId: profileId }).where(eq(series.id, seriesId));
	}

	// =========================================================================
	// Subtitle Status
	// =========================================================================

	/**
	 * Get subtitle status for a movie
	 */
	async getMovieSubtitleStatus(movieId: string): Promise<SubtitleStatus> {
		const profile = await this.getProfileForMovie(movieId);
		if (!profile) {
			return { satisfied: true, missing: [], existing: [] };
		}

		// Get external subtitles
		const existingSubtitles = await db
			.select()
			.from(subtitles)
			.where(eq(subtitles.movieId, movieId));

		return this.calculateStatus(profile, existingSubtitles);
	}

	/**
	 * Get subtitle status for an episode
	 */
	async getEpisodeSubtitleStatus(episodeId: string): Promise<SubtitleStatus> {
		// Get episode and series to find the profile
		const episode = await db.query.episodes.findFirst({
			where: eq(episodes.id, episodeId)
		});

		if (!episode) {
			return { satisfied: true, missing: [], existing: [] };
		}

		const profile = await this.getProfileForSeries(episode.seriesId);
		if (!profile) {
			return { satisfied: true, missing: [], existing: [] };
		}

		// Get external subtitles
		const existingSubtitles = await db
			.select()
			.from(subtitles)
			.where(eq(subtitles.episodeId, episodeId));

		return this.calculateStatus(profile, existingSubtitles);
	}

	/**
	 * Get languages needed for a movie based on profile
	 */
	async getLanguagesNeeded(movieId: string): Promise<LanguageCode[]> {
		const status = await this.getMovieSubtitleStatus(movieId);
		return status.missing.map((m) => m.code);
	}

	/**
	 * Get list of episode IDs missing subtitles for a series
	 */
	async getSeriesEpisodesMissingSubtitles(seriesId: string): Promise<string[]> {
		const profile = await this.getProfileForSeries(seriesId);
		if (!profile) {
			return [];
		}

		// Get all episodes for this series
		const seriesEpisodes = await db.select().from(episodes).where(eq(episodes.seriesId, seriesId));

		const missing: string[] = [];

		for (const episode of seriesEpisodes) {
			const existingSubtitles = await db
				.select()
				.from(subtitles)
				.where(eq(subtitles.episodeId, episode.id));

			const status = this.calculateStatus(profile, existingSubtitles);
			if (!status.satisfied && status.missing.length > 0) {
				missing.push(episode.id);
			}
		}

		return missing;
	}

	/**
	 * Check if cutoff is satisfied for a movie
	 */
	async isCutoffSatisfied(movieId: string): Promise<boolean> {
		const profile = await this.getProfileForMovie(movieId);
		if (!profile) return true;

		// Get external subtitles
		const existingSubtitles = await db
			.select()
			.from(subtitles)
			.where(eq(subtitles.movieId, movieId));

		return this.checkCutoffSatisfied(profile, existingSubtitles);
	}

	// =========================================================================
	// Helpers
	// =========================================================================

	/**
	 * Calculate subtitle status against a profile
	 * @param profile - The language profile to check against
	 * @param existingSubtitles - External subtitle files from the subtitles table
	 */
	private calculateStatus(
		profile: LanguageProfile,
		existingSubtitles: Array<typeof subtitles.$inferSelect>
	): SubtitleStatus {
		const normalizedExisting = existingSubtitles
			.filter((sub) => this.isExternalSubtitleRecord(sub))
			.map((sub) => ({
				...sub,
				normalizedLanguage: normalizeLanguageCode(sub.language)
			}));

		const existing: SubtitleStatus['existing'] = normalizedExisting.map((sub) => ({
			language: sub.normalizedLanguage,
			subtitleId: sub.id,
			isForced: sub.isForced ?? false,
			isHearingImpaired: sub.isHearingImpaired ?? false,
			matchScore: sub.matchScore ?? undefined
		}));

		const missing: SubtitleStatus['missing'] = [];
		let cutoffReached = false;

		for (let i = 0; i < profile.languages.length; i++) {
			const langPref = profile.languages[i];

			// Check if we have this language in external subtitle files
			const hasExternal = normalizedExisting.some(
				(sub) =>
					sub.normalizedLanguage === langPref.code &&
					(sub.isForced ?? false) === langPref.forced &&
					(!langPref.excludeHi || !(sub.isHearingImpaired ?? false))
			);

			const hasLanguage = hasExternal;

			if (!hasLanguage) {
				missing.push({
					code: langPref.code,
					forced: langPref.forced,
					hearingImpaired: langPref.hearingImpaired
				});
			}

			// Check cutoff
			if (langPref.isCutoff && hasLanguage) {
				cutoffReached = true;
			}

			// Also check profile cutoff index
			if (i === profile.cutoffIndex && hasLanguage) {
				cutoffReached = true;
			}
		}

		// If cutoff is reached, clear remaining missing languages
		const satisfied = cutoffReached || missing.length === 0;

		return {
			satisfied,
			missing: cutoffReached ? [] : missing,
			existing
		};
	}

	/**
	 * Check if cutoff is satisfied
	 */
	private checkCutoffSatisfied(
		profile: LanguageProfile,
		existingSubtitles: Array<typeof subtitles.$inferSelect>
	): boolean {
		const normalizedExisting = existingSubtitles
			.filter((sub) => this.isExternalSubtitleRecord(sub))
			.map((sub) => ({
				...sub,
				normalizedLanguage: normalizeLanguageCode(sub.language)
			}));

		for (let i = 0; i <= Math.min(profile.cutoffIndex, profile.languages.length - 1); i++) {
			const langPref = profile.languages[i];

			// Check external subtitles
			const hasExternal = normalizedExisting.some(
				(sub) =>
					sub.normalizedLanguage === langPref.code &&
					(sub.isForced ?? false) === langPref.forced &&
					(!langPref.excludeHi || !(sub.isHearingImpaired ?? false))
			);

			const hasLanguage = hasExternal;

			if (langPref.isCutoff && hasLanguage) {
				return true;
			}
		}

		// Check if cutoff index language is satisfied
		if (profile.languages[profile.cutoffIndex]) {
			const cutoffLang = profile.languages[profile.cutoffIndex];
			return normalizedExisting.some(
				(sub) =>
					sub.normalizedLanguage === cutoffLang.code &&
					(sub.isForced ?? false) === cutoffLang.forced
			);
		}

		return false;
	}

	/**
	 * Convert database row to profile object
	 */
	private rowToProfile(row: typeof languageProfiles.$inferSelect): LanguageProfile {
		return {
			id: row.id,
			name: row.name,
			languages: row.languages as LanguagePreference[],
			cutoffIndex: row.cutoffIndex ?? 0,
			upgradesAllowed: row.upgradesAllowed ?? true,
			minimumScore: row.minimumScore ?? 60,
			isDefault: row.isDefault ?? false,
			createdAt: row.createdAt ?? undefined,
			updatedAt: row.updatedAt ?? undefined
		};
	}

	private isExternalSubtitleRecord(subtitle: typeof subtitles.$inferSelect): boolean {
		const format = (subtitle.format ?? '').trim().toLowerCase();
		if (format === 'embedded') {
			return false;
		}

		// Guard against legacy placeholder records that may have been stored with non-file paths.
		const extension = extname(subtitle.relativePath ?? '').toLowerCase();
		const knownExternalExtensions = new Set(['.srt', '.ass', '.ssa', '.sub', '.vtt', '.idx']);
		return knownExternalExtensions.has(extension);
	}
}

/**
 * Get the singleton LanguageProfileService
 */
export function getLanguageProfileService(): LanguageProfileService {
	return LanguageProfileService.getInstance();
}
