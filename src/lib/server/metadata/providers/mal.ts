import type {
	MetadataDetails,
	MetadataMediaType,
	MetadataProvider,
	MetadataSearchResult
} from './types.js';

interface MalNode {
	id: number;
	title: string;
	main_picture?: { large?: string; medium?: string };
	synopsis?: string;
	start_date?: string;
	genres?: Array<{ name: string }>;
	status?: string;
	studios?: Array<{ name: string }>;
}

interface MalSearchItem {
	node: MalNode;
}

export class MalProvider implements MetadataProvider {
	readonly id = 'mal' as const;
	readonly name = 'MyAnimeList';
	readonly description = 'MyAnimeList official API using client-id header.';

	constructor(private readonly clientId: string) {}

	isConfigured(): boolean {
		return this.clientId.length > 0;
	}

	private getHeaders(): HeadersInit {
		return {
			'content-type': 'application/json',
			'X-MAL-CLIENT-ID': this.clientId
		};
	}

	private mapStatus(status?: string): string | undefined {
		switch (status) {
			case 'finished_airing':
				return 'Ended';
			case 'currently_airing':
				return 'Returning Series';
			case 'not_yet_aired':
				return 'Planned';
			default:
				return undefined;
		}
	}

	async searchTitle(query: string, _type: MetadataMediaType): Promise<MetadataSearchResult[]> {
		if (!this.isConfigured() || !query.trim()) return [];

		const url = new URL('https://api.myanimelist.net/v2/anime');
		url.searchParams.set('q', query.trim());
		url.searchParams.set('limit', '10');
		url.searchParams.set('fields', 'id,title,main_picture,synopsis,start_date');

		const res = await fetch(url.toString(), { headers: this.getHeaders() });
		if (!res.ok) return [];
		const data = (await res.json()) as { data?: MalSearchItem[] };
		const items = data.data ?? [];

		return items.map((item) => ({
			id: String(item.node.id),
			title: item.node.title,
			overview: item.node.synopsis ?? undefined,
			year: item.node.start_date ? Number.parseInt(item.node.start_date.slice(0, 4), 10) : null,
			posterUrl: item.node.main_picture?.large ?? item.node.main_picture?.medium ?? null,
			mediaType: 'anime',
			provider: this.id
		}));
	}

	async getDetails(id: string): Promise<MetadataDetails | null> {
		if (!this.isConfigured()) return null;
		const parsedId = Number.parseInt(id, 10);
		if (!Number.isFinite(parsedId) || parsedId <= 0) return null;

		const url = new URL(`https://api.myanimelist.net/v2/anime/${parsedId}`);
		url.searchParams.set(
			'fields',
			'id,title,main_picture,synopsis,start_date,genres,status,studios,alternative_titles'
		);

		const res = await fetch(url.toString(), { headers: this.getHeaders() });
		if (!res.ok) return null;
		const item = (await res.json()) as MalNode;

		return {
			id: String(item.id),
			title: item.title,
			overview: item.synopsis ?? undefined,
			year: item.start_date ? Number.parseInt(item.start_date.slice(0, 4), 10) : null,
			posterUrl: item.main_picture?.large ?? item.main_picture?.medium ?? null,
			genres: item.genres?.map((genre) => genre.name) ?? undefined,
			status: this.mapStatus(item.status),
			studios: item.studios?.map((studio) => studio.name) ?? undefined,
			mediaType: 'anime',
			provider: this.id
		};
	}
}
