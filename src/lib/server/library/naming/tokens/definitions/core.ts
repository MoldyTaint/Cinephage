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

function isLanguageCode(spec: string | undefined): boolean {
	if (!spec) return false;
	return /^[a-z]{2,3}$/i.test(spec);
}

export const coreTokens: TokenDefinition[] = [
	{
		name: 'Title',
		aliases: ['SeriesTitle'],
		category: 'core',
		description: 'Title as-is. Use {Title:ES} for localized title.',
		example: '{Title:ES}',
		applicability: ['movie', 'series', 'episode'],
		supportsFormatSpec: true,
		render: (info, _config, formatSpec) => {
			if (formatSpec && isLanguageCode(formatSpec)) {
				return info.localizedTitles?.[formatSpec.toLowerCase()] || info.title || '';
			}
			return info.title || '';
		}
	},
	{
		name: 'CleanTitle',
		aliases: ['MovieCleanTitle', 'SeriesCleanTitle'],
		category: 'core',
		description: 'Title with special characters removed. Use {CleanTitle:ES} for localized.',
		applicability: ['movie', 'series', 'episode'],
		supportsFormatSpec: true,
		render: (info, _config, formatSpec) => {
			const title =
				formatSpec && isLanguageCode(formatSpec)
					? info.localizedTitles?.[formatSpec.toLowerCase()] || info.title
					: info.title;
			return title ? generateCleanTitle(title) : '';
		}
	},
	{
		name: 'Year',
		category: 'core',
		description: 'Release year',
		applicability: ['movie', 'series', 'episode'],
		render: (info) => (info.year ? String(info.year) : '')
	}
];
