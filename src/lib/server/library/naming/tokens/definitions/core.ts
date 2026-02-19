/**
 * Core tokens - Title, Year, CleanTitle
 */

import type { TokenDefinition } from '../types';

/**
 * Generate a clean title by removing special characters for filesystem compatibility.
 *
 * Note: Colons (:) are NOT removed here - they are handled separately by
 * NamingService.cleanName() → replaceColons() which respects the user's
 * colonReplacement preference (delete, dash, spaceDash, spaceDashSpace, smart).
 */
function generateCleanTitle(title: string): string {
	return title
		.replace(/[/\\?*"<>|]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export const coreTokens: TokenDefinition[] = [
	{
		name: 'Title',
		aliases: ['SeriesTitle'],
		category: 'core',
		description: 'Title as-is',
		applicability: ['movie', 'series', 'episode'],
		render: (info) => info.title || ''
	},
	{
		name: 'CleanTitle',
		aliases: ['MovieCleanTitle', 'SeriesCleanTitle'],
		category: 'core',
		description: 'Title with special characters removed',
		applicability: ['movie', 'series', 'episode'],
		render: (info) => (info.title ? generateCleanTitle(info.title) : '')
	},
	{
		name: 'Year',
		category: 'core',
		description: 'Release year',
		applicability: ['movie', 'series', 'episode'],
		render: (info) => (info.year ? String(info.year) : '')
	}
];
