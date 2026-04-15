import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { LOGOS_DIR } from './constants.js';

const CACHE_TTL_MS = 15_000;

export interface LogoInfo {
	path: string;
	country: string;
	name: string;
	filename: string;
	url: string;
}

export interface CountryInfo {
	code: string;
	name: string;
	logoCount: number;
}

interface LogoLibrarySnapshot {
	logos: LogoInfo[];
	countries: CountryInfo[];
	totalCount: number;
}

interface LogoLibraryCache extends LogoLibrarySnapshot {
	expiresAt: number;
}

interface ListLogosOptions {
	search?: string;
	country?: string;
	limit?: number;
	offset?: number;
}

let cache: LogoLibraryCache | null = null;

function formatDisplayName(value: string): string {
	return value
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function scanLogoLibrary(): Promise<LogoLibrarySnapshot> {
	const entries = await readdir(LOGOS_DIR);
	const logos: LogoInfo[] = [];
	const countries: CountryInfo[] = [];

	for (const entry of entries) {
		const fullPath = join(LOGOS_DIR, entry);
		const entryStats = await stat(fullPath);
		if (!entryStats.isDirectory()) {
			continue;
		}

		const files = await readdir(fullPath);
		let logoCount = 0;

		for (const filename of files) {
			const ext = extname(filename).toLowerCase();
			if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
				continue;
			}

			logoCount += 1;
			const nameWithoutExtension = basename(filename, ext);

			logos.push({
				path: `${entry}/${filename}`,
				country: entry,
				name: formatDisplayName(nameWithoutExtension),
				filename,
				url: `/api/logos/file/${entry}/${filename}`
			});
		}

		countries.push({
			code: entry,
			name: formatDisplayName(entry),
			logoCount
		});
	}

	logos.sort((a, b) => a.name.localeCompare(b.name) || a.country.localeCompare(b.country));
	countries.sort((a, b) => a.name.localeCompare(b.name));

	return {
		logos,
		countries,
		totalCount: logos.length
	};
}

async function getLogoLibrarySnapshot(): Promise<LogoLibrarySnapshot> {
	if (cache && cache.expiresAt > Date.now()) {
		return cache;
	}

	const snapshot = await scanLogoLibrary();
	cache = {
		...snapshot,
		expiresAt: Date.now() + CACHE_TTL_MS
	};

	return snapshot;
}

export function invalidateLogoLibraryCache(): void {
	cache = null;
}

export async function listLogoCountries(): Promise<CountryInfo[]> {
	const snapshot = await getLogoLibrarySnapshot();
	return snapshot.countries;
}

export async function listLogos({
	search = '',
	country = '',
	limit = 50,
	offset = 0
}: ListLogosOptions) {
	const snapshot = await getLogoLibrarySnapshot();
	const normalizedSearch = search.trim().toLowerCase();
	const normalizedCountry = country.trim();

	const filtered = snapshot.logos.filter((logo) => {
		if (normalizedCountry && logo.country !== normalizedCountry) {
			return false;
		}

		if (!normalizedSearch) {
			return true;
		}

		return (
			logo.name.toLowerCase().includes(normalizedSearch) ||
			logo.filename.toLowerCase().includes(normalizedSearch)
		);
	});

	const safeOffset = Math.max(0, offset);
	const safeLimit = Math.max(1, Math.min(limit, 200));
	const data = filtered.slice(safeOffset, safeOffset + safeLimit);

	return {
		data,
		pagination: {
			total: filtered.length,
			limit: safeLimit,
			offset: safeOffset,
			hasMore: safeOffset + safeLimit < filtered.length
		},
		library: {
			totalCount: snapshot.totalCount
		}
	};
}
