import type { TokenDefinition } from '../types';

function generateCleanCollectionTitle(name: string): string {
	return name
		.replace(/[/\\?*"<>|:]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export const collectionTokens: TokenDefinition[] = [
	{
		name: 'Collection',
		category: 'collection',
		description: 'TMDB collection name',
		example: 'Star Wars Collection',
		applicability: ['movie'],
		render: (info) => info.collectionName || ''
	},
	{
		name: 'CleanCollectionTitle',
		category: 'collection',
		description: 'Collection name with special characters removed',
		applicability: ['movie'],
		render: (info) => (info.collectionName ? generateCleanCollectionTitle(info.collectionName) : '')
	}
];
