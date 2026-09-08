/**
 * Super Subtitles (feliratok.eu) provider.
 *
 * The public request flow is based on Bazarr's SuperSubtitles provider. The
 * parsers intentionally support both the legacy object-shaped XBMC response
 * and the array response currently returned by feliratok.eu.
 */

import * as cheerio from 'cheerio';
import { basename, extname } from 'node:path';
import { BaseSubtitleProvider } from '../BaseProvider';
import { extractAllFromZip, type ExtractedFile } from '../mixins';
import type { ProviderTestResult } from '../interfaces';
import type {
	LanguageCode,
	ProviderSearchOptions,
	SubtitleFormat,
	SubtitleProviderConfig,
	SubtitleSearchCriteria,
	SubtitleSearchResult
} from '../../types';
import {
	ParseResponseError,
	ServiceUnavailable,
	TooManyRequests
} from '../../errors/ProviderErrors';
import {
	SUPERSUBTITLES_BASE_URL,
	SUPERSUBTITLES_LANGUAGES,
	type SuperSubtitlesAutocompleteEntry,
	type SuperSubtitlesCandidate,
	type SuperSubtitlesDownloadContext,
	type SuperSubtitlesEpisodeEntry
} from './types';

const USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.ass', '.ssa', '.sub', '.vtt']);

function asString(value: unknown): string {
	return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function asNumber(value: unknown): number | undefined {
	const parsed = Number.parseInt(asString(value), 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function normalize(value: string | undefined): string {
	return (value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

function unique(values: Array<string | undefined>): string[] {
	return [
		...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))
	];
}

function languageFromLabel(value: unknown): LanguageCode | undefined {
	const label = normalize(asString(value));
	if (label === 'magyar') return 'hu';
	if (label === 'angol') return 'en';
	return undefined;
}

function isForcedText(value: string): boolean {
	const text = normalize(value);
	return text.includes('szinkronoshoz') || text.includes('forced');
}

function parseMovieTitle(value: string): { title: string; year?: number; releases: string[] } {
	const text = value.trim();
	const match = text.match(/^(.*?)\s*\(((?:19|20)\d{2})\)\s*(?:\((.*)\))?\s*$/s);
	if (!match) return { title: text, releases: [] };
	return {
		title: match[1].trim(),
		year: Number.parseInt(match[2], 10),
		releases: unique((match[3] ?? '').split(',').map((part) => part.trim()))
	};
}

function parseEpisodeName(value: string): { title: string; release?: string } {
	const text = value.trim();
	const match = text.match(/^(.*?)\s*(?:-\s*\d+x\d+|\(Season\s+\d+\))?\s*\((.*)\)\s*$/i);
	if (match) return { title: match[1].trim(), release: match[2].trim() };
	return { title: text.split(/\s+\(Season\s+/i)[0].trim() };
}

function detailUrl(id: string): string {
	return `${SUPERSUBTITLES_BASE_URL}/index.php?tipus=adatlap&azon=a_${encodeURIComponent(id)}`;
}

export function parseMovieRows(html: string): SuperSubtitlesCandidate[] {
	const $ = cheerio.load(html);
	const results: SuperSubtitlesCandidate[] = [];
	const seen = new Set<string>();

	$('tr#vilagit, tr[id="vilagit"]').each((_, element) => {
		const row = $(element);
		const link = row.find('a[href*="action=letolt"][href*="felirat="]').last();
		const href = link.attr('href');
		if (!href) return;

		const url = new URL(href, `${SUPERSUBTITLES_BASE_URL}/`);
		const id = url.searchParams.get('felirat')?.trim();
		const language = languageFromLabel(row.find('small').first().text());
		if (!id || !language || seen.has(`${id}:${language}`)) return;

		const originalText = row.find('.eredeti').first().text().trim();
		const localTitle = row
			.find('.magyar')
			.first()
			.text()
			.replace(/\s*\([^)]*SubRip[^)]*\)\s*$/i, '')
			.trim();
		const parsed = parseMovieTitle(originalText);
		if (!parsed.title) return;

		const cells = row.children('td');
		const uploader = cells.eq(3).text().trim() || undefined;
		const fileName = url.searchParams.get('fnev')?.trim() || undefined;
		seen.add(`${id}:${language}`);
		results.push({
			id,
			language,
			title: parsed.title,
			year: parsed.year,
			isPack: false,
			isForced: isForcedText(`${row.text()} ${href} ${fileName ?? ''}`),
			releases: parsed.releases,
			fileName,
			uploader,
			downloadUrl: url.toString(),
			pageLink: detailUrl(id)
		});

		// Preserve the localized title as a matching alias without expanding the public type.
		(results.at(-1) as SuperSubtitlesCandidate & { localTitle?: string }).localTitle = localTitle;
	});

	return results;
}

function episodeEntries(payload: unknown): SuperSubtitlesEpisodeEntry[] {
	if (Array.isArray(payload)) return payload.filter((entry) => entry && typeof entry === 'object');
	if (payload && typeof payload === 'object') {
		return Object.values(payload).filter((entry) => entry && typeof entry === 'object');
	}
	return [];
}

export function parseEpisodeRows(
	payload: unknown,
	criteria: Pick<SubtitleSearchCriteria, 'seriesTitle' | 'title' | 'season' | 'episode'>
): SuperSubtitlesCandidate[] {
	const grouped = new Map<string, SuperSubtitlesCandidate>();

	for (const entry of episodeEntries(payload)) {
		const id = asString(entry.felirat);
		const language = languageFromLabel(entry.language);
		if (!id || !language) continue;

		const parsedName = parseEpisodeName(asString(entry.nev));
		const isPack = (asNumber(entry.evadpakk) ?? 0) !== 0;
		const season = asNumber(entry.evad);
		const rawEpisode = asNumber(entry.ep);
		const episode = isPack
			? criteria.episode
			: rawEpisode !== undefined && rawEpisode >= 0
				? rawEpisode
				: undefined;
		const fileName = asString(entry.fnev) || undefined;
		const key = `${id}:${language}`;
		const existing = grouped.get(key);

		if (existing) {
			if (parsedName.release && !existing.releases.includes(parsedName.release)) {
				existing.releases.push(parsedName.release);
			}
			continue;
		}

		const downloadParams = new URLSearchParams({ action: 'letolt' });
		if (fileName) downloadParams.set('fnev', fileName);
		downloadParams.set('felirat', id);
		grouped.set(key, {
			id,
			language,
			title: parsedName.title || criteria.seriesTitle || criteria.title,
			season: isPack ? criteria.season : season,
			episode,
			isPack,
			isForced: isForcedText(`${asString(entry.nev)} ${fileName ?? ''}`),
			releases: parsedName.release ? [parsedName.release] : [],
			fileName,
			uploader: asString(entry.feltolto) || undefined,
			downloadUrl: `${SUPERSUBTITLES_BASE_URL}/index.php?${downloadParams.toString()}`,
			pageLink: detailUrl(id)
		});
	}

	return [...grouped.values()];
}

export function parseAutocomplete(
	payload: unknown
): Array<{ id: string; title: string; year?: number }> {
	const entries = Array.isArray(payload)
		? payload
		: payload && typeof payload === 'object'
			? [payload]
			: [];
	const results: Array<{ id: string; title: string; year?: number }> = [];
	for (const raw of entries as SuperSubtitlesAutocompleteEntry[]) {
		const id = asString(raw.ID) || asString(raw.id);
		const name = asString(raw.name);
		if (!id || !name) continue;
		const parsed = parseMovieTitle(name);
		results.push({ id, title: parsed.title || name, year: parsed.year });
	}
	return results;
}

export function selectSeriesId(
	entries: Array<{ id: string; title: string; year?: number }>,
	title: string,
	year?: number
): string | undefined {
	const matches = entries.filter((entry) => normalize(entry.title) === normalize(title));
	return (
		matches.find((entry) => year === undefined || entry.year === year)?.id ??
		(year === undefined ? matches[0]?.id : undefined)
	);
}

function sourceToken(value: string): string | undefined {
	const text = normalize(value);
	if (text.includes('web')) return 'web';
	if (/(?:bluray|blu ray|bdrip|brrip)/.test(text)) return 'bluray';
	if (text.includes('hdtv')) return 'hdtv';
	if (text.includes('dvd')) return 'dvd';
	return undefined;
}

function resolutionToken(value: string): string | undefined {
	return value.toLowerCase().match(/\b(?:480p|576p|720p|1080p|2160p|4k)\b/)?.[0];
}

function releaseGroup(value: string): string | undefined {
	const withoutExtension = value.replace(/\.[a-z0-9]{2,4}$/i, '');
	return [...withoutExtension.matchAll(/-([a-z0-9][a-z0-9._]+)\b/gi)].at(-1)?.[1];
}

function releaseScore(release: string, videoName: string): number {
	const normalizedRelease = normalize(release);
	const normalizedVideo = normalize(videoName);
	let score = 0;
	const group = releaseGroup(videoName);
	if (
		group &&
		new RegExp(`\\b${group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(release)
	)
		score += 50;
	const resolution = resolutionToken(videoName);
	if (resolution && normalizedRelease.includes(resolution)) score += 15;
	const source = sourceToken(videoName);
	if (source && sourceToken(release) === source) score += 10;
	const videoTokens = new Set(normalizedVideo.split(' ').filter((token) => token.length >= 3));
	score += normalizedRelease.split(' ').filter((token) => videoTokens.has(token)).length;
	return score;
}

export function selectBestRelease(releases: string[], filePath?: string): string | undefined {
	if (releases.length === 0) return undefined;
	if (!filePath) return releases[0];
	const videoName = basename(filePath);
	return [...releases].sort((a, b) => releaseScore(b, videoName) - releaseScore(a, videoName))[0];
}

function encodeDownloadContext(candidate: SuperSubtitlesCandidate): string {
	if (candidate.season === undefined || candidate.episode === undefined) return candidate.id;
	return `${candidate.id}|${candidate.season}|${candidate.episode}|${candidate.isPack ? 1 : 0}`;
}

export function decodeDownloadContext(value: string): SuperSubtitlesDownloadContext {
	const [id, season, episode, isPack] = value.split('|');
	return {
		id,
		season: asNumber(season),
		episode: asNumber(episode),
		isPack: isPack === '1'
	};
}

function memberHasEpisode(name: string, season: number, episode: number): boolean {
	const text = normalize(basename(name));
	return (
		new RegExp(`\\bs0*${season}[\\s._-]*e0*${episode}(?!\\d)`, 'i').test(text) ||
		new RegExp(`(?<!\\d)${season}x0*${episode}(?!\\d)`, 'i').test(text)
	);
}

function memberHasSeasonEpisode(name: string): boolean {
	const text = normalize(basename(name));
	return /\bs0*\d+[\s._-]*e0*\d+(?!\d)/i.test(text) || /(?<!\d)\d+x0*\d+(?!\d)/i.test(text);
}

function memberHasBareEpisode(name: string, episode: number): boolean {
	return new RegExp(`\\be0*${episode}(?!\\d)`, 'i').test(normalize(basename(name)));
}

function isUsableSubtitleEntry(file: ExtractedFile): boolean {
	const name = basename(file.filename);
	return (
		!!name &&
		!name.startsWith('.') &&
		!file.filename.split(/[\\/]/).includes('__MACOSX') &&
		SUBTITLE_EXTENSIONS.has(extname(name).toLowerCase()) &&
		file.content.length > 0
	);
}

function languageMemberScore(name: string, language: LanguageCode): number {
	const text = normalize(basename(name));
	const tokens =
		language === 'hu' ? ['hu', 'hun', 'hungarian', 'magyar'] : ['en', 'eng', 'english', 'angol'];
	return tokens.some((token) => new RegExp(`(?:^| )${token}(?: |$)`, 'i').test(text)) ? 20 : 0;
}

function memberScore(file: ExtractedFile, result: SubtitleSearchResult): number {
	let score = releaseScore(file.filename, result.releaseName ?? result.fileName ?? '');
	score += languageMemberScore(file.filename, result.language);
	if (extname(file.filename).toLowerCase() === '.srt') score += 5;
	if (!result.isForced && /(?:^|[. _-])forced(?:[. _-]|$)/i.test(basename(file.filename)))
		score -= 100;
	if (result.isForced && /(?:^|[. _-])forced(?:[. _-]|$)/i.test(basename(file.filename)))
		score += 25;
	return score;
}

export function extractSuperSubtitlesArchive(
	data: Buffer,
	result: SubtitleSearchResult,
	context: SuperSubtitlesDownloadContext
): Buffer {
	let files = extractAllFromZip(data).filter(isUsableSubtitleEntry);
	if (files.length === 0)
		throw new Error('Super Subtitles archive contains no supported subtitle files');

	if (context.season !== undefined && context.episode !== undefined) {
		let episodeFiles = files.filter((file) =>
			memberHasEpisode(file.filename, context.season!, context.episode!)
		);
		if (episodeFiles.length === 0 && !files.some((file) => memberHasSeasonEpisode(file.filename))) {
			episodeFiles = files.filter((file) => memberHasBareEpisode(file.filename, context.episode!));
		}
		if (episodeFiles.length === 0) {
			throw new Error(
				`Super Subtitles archive has no subtitle for S${String(context.season).padStart(2, '0')}E${String(context.episode).padStart(2, '0')}`
			);
		}
		files = episodeFiles;
	} else if (context.isPack) {
		throw new Error('Super Subtitles season pack is missing episode context');
	}

	files.sort(
		(a, b) => memberScore(b, result) - memberScore(a, result) || b.content.length - a.content.length
	);
	return files[0].content;
}

function isZip(data: Buffer): boolean {
	return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
}

function isRar(data: Buffer): boolean {
	return data.subarray(0, 7).toString('binary').startsWith('Rar!\x1a\x07');
}

function isHtml(data: Buffer): boolean {
	const head = data.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
	return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<body');
}

function subtitleFormat(fileName?: string): SubtitleFormat {
	const extension = extname(fileName ?? '')
		.toLowerCase()
		.slice(1);
	return ['srt', 'ass', 'ssa', 'sub', 'vtt'].includes(extension)
		? (extension as SubtitleFormat)
		: 'srt';
}

export class SuperSubtitlesProvider extends BaseSubtitleProvider {
	constructor(config: SubtitleProviderConfig) {
		super(config);
		this._capabilities = {
			hashVerifiable: false,
			hearingImpairedVerifiable: false,
			skipWrongFps: false,
			supportsTvShows: true,
			supportsMovies: true,
			supportsAnime: false
		};
	}

	get implementation(): string {
		return 'supersubtitles';
	}

	get supportedLanguages(): LanguageCode[] {
		return SUPERSUBTITLES_LANGUAGES;
	}

	get supportsHashSearch(): boolean {
		return false;
	}

	private async request(url: string, timeout: number, accept = 'text/html,*/*'): Promise<Response> {
		const response = await this.fetchWithTimeout(url, {
			timeout,
			headers: {
				Accept: accept,
				'Accept-Language': 'hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7',
				Referer: `${SUPERSUBTITLES_BASE_URL}/index.php`,
				'User-Agent': USER_AGENT
			}
		});
		if (response.status === 429) {
			const retryAfter = response.headers.get('retry-after');
			throw new TooManyRequests(
				this.implementation,
				retryAfter ? Number.parseInt(retryAfter, 10) : undefined
			);
		}
		if (response.status >= 500) throw new ServiceUnavailable(this.implementation);
		if (!response.ok) throw new Error(`Super Subtitles request failed: HTTP ${response.status}`);
		return response;
	}

	async search(
		criteria: SubtitleSearchCriteria,
		options?: ProviderSearchOptions
	): Promise<SubtitleSearchResult[]> {
		const languages = new Set(
			criteria.languages.filter((language) => SUPERSUBTITLES_LANGUAGES.includes(language))
		);
		if (languages.size === 0) return [];

		try {
			const timeout = options?.timeout ?? 30000;
			const candidates =
				criteria.season !== undefined && criteria.episode !== undefined
					? await this.searchEpisode(criteria, timeout)
					: await this.searchMovie(criteria, timeout);
			const results = candidates
				.filter((candidate) => languages.has(candidate.language))
				.map((candidate) => this.toResult(candidate, criteria));
			const limited = results.slice(0, options?.maxResults ?? 25);
			this.logSearch(criteria, limited.length);
			this.recordSuccess();
			return limited;
		} catch (error) {
			this.recordFailure(error instanceof Error ? error : new Error(String(error)));
			this.logError('search', error);
			throw error;
		}
	}

	private async searchMovie(
		criteria: SubtitleSearchCriteria,
		timeout: number
	): Promise<SuperSubtitlesCandidate[]> {
		const wantedTitles = unique([criteria.originalTitle, criteria.title]);
		for (const query of wantedTitles) {
			const params = new URLSearchParams({
				search: query,
				soriSorszam: '',
				nyelv: '',
				tab: 'film'
			});
			const response = await this.request(
				`${SUPERSUBTITLES_BASE_URL}/index.php?${params}`,
				timeout
			);
			const rows = parseMovieRows(await response.text()).filter((row) => {
				if (criteria.year !== undefined && row.year !== undefined && criteria.year !== row.year)
					return false;
				const localTitle = (row as SuperSubtitlesCandidate & { localTitle?: string }).localTitle;
				return wantedTitles.some((title) =>
					[normalize(row.title), normalize(localTitle)].includes(normalize(title))
				);
			});
			if (rows.length > 0) return rows;
		}
		return [];
	}

	private async searchEpisode(
		criteria: SubtitleSearchCriteria,
		timeout: number
	): Promise<SuperSubtitlesCandidate[]> {
		const titles = unique([criteria.originalTitle, criteria.seriesTitle, criteria.title]);
		let seriesId: string | undefined;
		for (const title of titles) {
			const params = new URLSearchParams({ term: title, nyelv: '0', action: 'autoname' });
			const response = await this.request(
				`${SUPERSUBTITLES_BASE_URL}/index.php?${params}`,
				timeout,
				'application/json,*/*'
			);
			let payload: unknown;
			try {
				payload = JSON.parse(await response.text());
			} catch {
				throw new ParseResponseError(this.implementation, 'invalid series autocomplete JSON');
			}
			seriesId = selectSeriesId(parseAutocomplete(payload), title, criteria.year);
			if (seriesId) break;
		}
		if (!seriesId) return [];

		const exactRows = await this.fetchEpisodeRows(seriesId, criteria, timeout, true);
		const seasonRows = await this.fetchEpisodeRows(seriesId, criteria, timeout, false);
		const merged = new Map<string, SuperSubtitlesCandidate>();
		for (const row of [...exactRows, ...seasonRows]) {
			const matchesEpisode = row.isPack || row.episode === criteria.episode;
			if (row.season !== criteria.season || !matchesEpisode) continue;
			const key = `${row.id}:${row.language}`;
			const existing = merged.get(key);
			if (!existing) {
				merged.set(key, row);
			} else {
				existing.releases = unique([...existing.releases, ...row.releases]);
			}
		}
		return [...merged.values()];
	}

	private async fetchEpisodeRows(
		seriesId: string,
		criteria: SubtitleSearchCriteria,
		timeout: number,
		exactEpisode: boolean
	): Promise<SuperSubtitlesCandidate[]> {
		const params = new URLSearchParams({
			action: 'xbmc',
			sid: seriesId,
			ev: String(criteria.season)
		});
		if (exactEpisode) params.set('rtol', String(criteria.episode));
		const response = await this.request(
			`${SUPERSUBTITLES_BASE_URL}/index.php?${params}`,
			timeout,
			'application/json,*/*'
		);
		try {
			return parseEpisodeRows(JSON.parse(await response.text()), criteria);
		} catch {
			throw new ParseResponseError(this.implementation, 'invalid episode JSON');
		}
	}

	private toResult(
		candidate: SuperSubtitlesCandidate,
		criteria: SubtitleSearchCriteria
	): SubtitleSearchResult {
		const releaseName =
			selectBestRelease(candidate.releases, criteria.filePath) ?? candidate.fileName;
		const isEpisode = candidate.season !== undefined && candidate.episode !== undefined;
		return {
			providerId: this.id,
			providerName: this.name,
			providerSubtitleId: encodeDownloadContext(candidate),
			language: candidate.language,
			title: isEpisode
				? `${candidate.title} S${String(candidate.season).padStart(2, '0')}E${String(candidate.episode).padStart(2, '0')}`
				: `${candidate.title}${candidate.year ? ` (${candidate.year})` : ''}`,
			releaseName,
			fileName: candidate.fileName,
			isForced: candidate.isForced,
			isHearingImpaired: false,
			format: subtitleFormat(candidate.fileName),
			isHashMatch: false,
			matchScore: isEpisode ? 210 : 70,
			scoreBreakdown: {
				hashMatch: 0,
				titleMatch: isEpisode ? 150 : 50,
				yearMatch: !isEpisode && candidate.year === criteria.year ? 20 : 0,
				releaseGroupMatch: releaseName ? 15 : 0,
				sourceMatch: releaseName && sourceToken(releaseName) ? 10 : 0,
				codecMatch: 0,
				hiPenalty: 0,
				forcedBonus: candidate.isForced && criteria.includeForced ? 10 : 0
			},
			downloadUrl: candidate.downloadUrl,
			uploader: candidate.uploader,
			pageLink: candidate.pageLink
		};
	}

	async download(result: SubtitleSearchResult): Promise<Buffer> {
		try {
			const context = decodeDownloadContext(result.providerSubtitleId);
			const fallbackParams = new URLSearchParams({ action: 'letolt', felirat: context.id });
			const url = result.downloadUrl ?? `${SUPERSUBTITLES_BASE_URL}/index.php?${fallbackParams}`;
			const response = await this.request(url, 30000, 'application/zip,text/plain,*/*');
			const data = Buffer.from(await response.arrayBuffer());
			if (data.length === 0) throw new Error('Super Subtitles returned an empty download');
			if (isHtml(data)) throw new Error('Super Subtitles returned an HTML error page');
			if (isRar(data)) throw new Error('RAR archives from Super Subtitles are not supported');
			return isZip(data) ? extractSuperSubtitlesArchive(data, result, context) : data;
		} catch (error) {
			this.logError('download', error);
			throw error;
		}
	}

	async test(): Promise<ProviderTestResult> {
		const start = Date.now();
		try {
			const params = new URLSearchParams({
				term: 'The Last of Us',
				nyelv: '0',
				action: 'autoname'
			});
			const response = await this.request(
				`${SUPERSUBTITLES_BASE_URL}/index.php?${params}`,
				10000,
				'application/json,*/*'
			);
			const payload = JSON.parse(await response.text());
			if (parseAutocomplete(payload).length === 0)
				throw new Error('Unexpected autocomplete response');
			return {
				success: true,
				message: 'Connected to Super Subtitles',
				responseTime: Date.now() - start
			};
		} catch (error) {
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Connection failed',
				responseTime: Date.now() - start
			};
		}
	}
}
