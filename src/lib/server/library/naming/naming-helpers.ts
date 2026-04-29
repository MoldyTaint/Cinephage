import { NamingService } from './NamingService.js';
import { namingSettingsService } from './NamingSettingsService.js';

export function buildMovieFolderName(
	title: string,
	year?: number,
	tmdbId?: number,
	collectionName?: string,
	localizedTitles?: Record<string, string>
): string {
	const config = namingSettingsService.getConfigSync();
	const service = new NamingService(config);
	return service.generateMovieFolderName({
		title,
		year,
		tmdbId,
		collectionName,
		localizedTitles
	});
}
