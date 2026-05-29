import type {
	MetadataDetails,
	MetadataMediaType,
	MetadataProvider,
	MetadataSearchResult
} from './types.js';

interface AniListTitle {
	romaji?: string | null;
	english?: string | null;
	native?: string | null;
}

interface AniListMedia {
	id: number;
	description?: string | null;
	coverImage?: { large?: string | null } | null;
	bannerImage?: string | null;
	title?: AniListTitle | null;
	startDate?: { year?: number | null } | null;
	genres?: string[] | null;
	status?: string | null;
	studios?: { nodes?: Array<{ name?: string | null } | null> | null } | null;
}

function pickTitle(title?: AniListTitle | null): string {
	return title?.english ?? title?.romaji ?? title?.native ?? 'Unknown';
}

function mediaTypeToAniListType(type: MetadataMediaType): 'ANIME' | 'MANGA' {
	return type === 'anime' || type === 'tv' ? 'ANIME' : 'MANGA';
}

function mapAniListStatus(status?: string | null): string | undefined {
	switch (status) {
		case 'FINISHED':
			return 'Ended';
		case 'RELEASING':
			return 'Returning Series';
		case 'NOT_YET_RELEASED':
			return 'Planned';
		case 'CANCELLED':
			return 'Canceled';
		case 'HIATUS':
			return 'Hiatus';
		default:
			return undefined;
	}
}

export class AniListProvider implements MetadataProvider {
	readonly id = 'anilist' as const;
	readonly name = 'AniList';
	readonly description = 'AniList GraphQL metadata API for anime titles.';

	constructor(private readonly enabled: boolean) {}

	isConfigured(): boolean {
		return this.enabled;
	}

	async searchTitle(query: string, type: MetadataMediaType): Promise<MetadataSearchResult[]> {
		if (!this.enabled || !query.trim()) return [];

		const res = await fetch('https://graphql.anilist.co', {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({
				query: `
          query ($search: String, $type: MediaType) {
            Page(page: 1, perPage: 10) {
              media(search: $search, type: $type) {
                id
                title { romaji english native }
                description(asHtml: false)
                startDate { year }
                coverImage { large }
                status
                studios(isMain: true) { nodes { name } }
              }
            }
          }
        `,
				variables: { search: query.trim(), type: mediaTypeToAniListType(type) }
			})
		});

		if (!res.ok) return [];
		const data = (await res.json()) as { data?: { Page?: { media?: AniListMedia[] } } };
		const media = data.data?.Page?.media ?? [];

		return media.map((item) => ({
			id: String(item.id),
			title: pickTitle(item.title),
			originalTitle: item.title?.native ?? undefined,
			overview: item.description ?? undefined,
			year: item.startDate?.year ?? null,
			posterUrl: item.coverImage?.large ?? null,
			mediaType: 'anime',
			provider: this.id
		}));
	}

	async getDetails(id: string): Promise<MetadataDetails | null> {
		if (!this.enabled) return null;
		const parsedId = Number.parseInt(id, 10);
		if (!Number.isFinite(parsedId) || parsedId <= 0) return null;

		const res = await fetch('https://graphql.anilist.co', {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({
				query: `
          query ($id: Int) {
            Media(id: $id, type: ANIME) {
              id
              title { romaji english native }
              description(asHtml: false)
              startDate { year }
              coverImage { large }
              bannerImage
              genres
              status
              studios(isMain: true) { nodes { name } }
            }
          }
        `,
				variables: { id: parsedId }
			})
		});

		if (!res.ok) return null;
		const data = (await res.json()) as { data?: { Media?: AniListMedia | null } };
		const media = data.data?.Media;
		if (!media) return null;

		return {
			id: String(media.id),
			title: pickTitle(media.title),
			originalTitle: media.title?.native ?? undefined,
			overview: media.description ?? undefined,
			year: media.startDate?.year ?? null,
			posterUrl: media.coverImage?.large ?? null,
			backdropUrl: media.bannerImage ?? null,
			genres: media.genres ?? undefined,
			status: mapAniListStatus(media.status),
			studios:
				media.studios?.nodes
					?.map((node) => node?.name?.trim())
					.filter((name): name is string => Boolean(name)) ?? undefined,
			mediaType: 'anime',
			provider: this.id
		};
	}
}
