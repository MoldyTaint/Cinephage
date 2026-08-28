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

/**
 * ':First' format spec - first-letter folder organization (A/, B/, ...)
 */
function isFirstSpec(spec: string | undefined): boolean {
	return !!spec && spec.toLowerCase() === 'first';
}

/**
 * First ASCII alphanumeric character of the value, uppercased ('' if none)
 */
function firstLetter(value: string | undefined): string {
	if (!value) return '';
	const match = value.match(/[a-z0-9]/i);
	return match ? match[0].toUpperCase() : '';
}

export const coreTokens: TokenDefinition[] = [
	{
		name: 'Title',
		aliases: ['SeriesTitle', 'Movie Title', 'Series Title'],
		category: 'core',
		description:
			'Title as-is. Use {Title:ES} for localized title. Use {Title:First} for first-letter organization (A/, B/, ...).',
		example: '{Title:ES}',
		applicability: ['movie', 'series', 'episode'],
		supportsFormatSpec: true,
		render: (info, _config, formatSpec) => {
			if (isFirstSpec(formatSpec)) return firstLetter(info.title);
			if (formatSpec && isLanguageCode(formatSpec)) {
				return info.localizedTitles?.[formatSpec.toLowerCase()] || info.title || '';
			}
			return info.title || '';
		}
	},
	{
		name: 'CleanTitle',
		aliases: ['MovieCleanTitle', 'SeriesCleanTitle', 'Movie CleanTitle', 'Series CleanTitle'],
		category: 'core',
		description:
			'Title with special characters removed. Use {CleanTitle:ES} for localized. Use {CleanTitle:First} for first-letter organization (A/, B/, ...).',
		applicability: ['movie', 'series', 'episode'],
		supportsFormatSpec: true,
		render: (info, _config, formatSpec) => {
			if (isFirstSpec(formatSpec)) {
				return info.title ? firstLetter(generateCleanTitle(info.title)) : '';
			}
			const title =
				formatSpec && isLanguageCode(formatSpec)
					? info.localizedTitles?.[formatSpec.toLowerCase()] || info.title
					: info.title;
			return title ? generateCleanTitle(title) : '';
		}
	},
	{
		name: 'OriginalTitle',
		aliases: [
			'SeriesOriginalTitle',
			'MovieOriginalTitle',
			'Movie OriginalTitle',
			'Series OriginalTitle'
		],
		category: 'core',
		description:
			'Original title as-is. Use {OriginalTitle:First} for first-letter organization (A/, B/, ...).',
		applicability: ['movie', 'series'],
		supportsFormatSpec: false,
		render: (info, _config, formatSpec) => {
			const title = info.originalTitle || info.title || '';
			if (isFirstSpec(formatSpec)) return firstLetter(title);
			return title;
		}
	},
	{
		name: 'OriginalCleanTitle',
		aliases: ['SeriesOriginalCleanTitle', 'MovieOriginalCleanTitle'],
		category: 'core',
		description:
			'Original title with special characters removed. Use {OriginalCleanTitle:First} for first-letter organization (A/, B/, ...).',
		applicability: ['movie', 'series'],
		supportsFormatSpec: false,
		render: (info, _config, formatSpec) => {
			const title = info.originalTitle || info.title || '';
			if (isFirstSpec(formatSpec)) return title ? firstLetter(generateCleanTitle(title)) : '';
			return title ? generateCleanTitle(title) : '';
		}
	},
	{
		name: 'Year',
		aliases: ['Release Year', 'Series Year'],
		category: 'core',
		description: 'Release year',
		applicability: ['movie', 'series', 'episode'],
		render: (info) => (info.year ? String(info.year) : '')
	}
];
