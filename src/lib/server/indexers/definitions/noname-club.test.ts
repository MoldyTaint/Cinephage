import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FilterEngine } from '../engine/FilterEngine.js';
import { SelectorEngine } from '../engine/SelectorEngine.js';
import { TemplateEngine } from '../engine/TemplateEngine.js';
import { RequestBuilder } from '../runtime/RequestBuilder.js';
import { ResponseParser } from '../runtime/ResponseParser.js';
import { YamlDefinitionLoader } from '../loader/YamlDefinitionLoader.js';
import { Category } from '../types/category.js';

const definitionPath = resolve('data/indexers/definitions/noname-club.yaml');

async function loadDefinition() {
	const loader = new YamlDefinitionLoader(dirname(definitionPath));
	const result = await loader.loadOne(definitionPath);
	expect(result).not.toBeNull();
	return result!.definition;
}

describe('NoNaMe Club definition', () => {
	it('loads the upstream identity and media category mappings', async () => {
		const definition = await loadDefinition();

		expect(definition.id).toBe('noname-club');
		expect(definition.replaces).toEqual(['nnm-club']);
		expect(definition.name).toBe('NoNaMe Club');
		expect(definition.encoding).toBe('windows-1251');

		const mapping = new Map(
			definition.caps.categorymappings?.map((entry) => [String(entry.id), entry.cat])
		);
		expect(mapping.get('224')).toBe('Movies');
		expect(mapping.get('768')).toBe('TV');
		expect(mapping.get('615')).toBe('TV/Anime');
	});

	it('maps full-length cartoon sections to Movies', async () => {
		const definition = await loadDefinition();
		const mapping = new Map(
			definition.caps.categorymappings?.map((entry) => [String(entry.id), entry.cat])
		);

		for (const id of [
			'890',
			'1329',
			'1330',
			'1331',
			'1332',
			'1336',
			'1337',
			'1338',
			'1339',
			'1340',
			'660'
		]) {
			expect(mapping.get(id), `NNMClub category ${id}`).toBe('Movies');
		}
	});

	it('builds a category-filtered POST request for movie searches', async () => {
		const definition = await loadDefinition();
		const templateEngine = new TemplateEngine();
		templateEngine.setConfigWithDefaults({}, definition.settings ?? []);
		const requestBuilder = new RequestBuilder(definition, templateEngine, new FilterEngine());

		const [request] = requestBuilder.buildSearchRequests({
			searchType: 'movie',
			query: 'Despicable Me',
			year: 2024,
			categories: [Category.MOVIES]
		});

		expect(request).toBeDefined();
		expect(request.method).toBe('POST');
		expect(request.url).toBe('https://nnmclub.to/forum/tracker.php');
		expect(request.body).toContain('%66%5B%5D=%32%31%36');
		expect(request.body).toContain('%66%5B%5D=%31%33%33%39');
		expect(request.body).toContain('%6E%6D=%44%65%73%70%69%63%61%62%6C%65%20%4D%65%20%32%30%32%34');
	});

	it('parses a movie row with its tracker category', async () => {
		const definition = await loadDefinition();
		const templateEngine = new TemplateEngine();
		templateEngine.setConfigWithDefaults({}, definition.settings ?? []);
		const filterEngine = new FilterEngine(templateEngine);
		const parser = new ResponseParser(
			definition,
			templateEngine,
			filterEngine,
			new SelectorEngine(templateEngine, filterEngine)
		);

		const result = parser.parse(
			`<table class="forumline tablesorter"><tbody><tr>
				<td><a href="tracker.php?f=1339">Зарубежные Мультфильмы 21-го века (HD, FHD, UHD)</a></td>
				<td><a href="viewtopic.php?t=42"><b>Despicable Me 4 (2024)</b></a><a href="download.php?id=42">download</a></td>
				<td></td><td></td><td></td><td><u>1.2 GB</u></td>
				<td class="seedmed"><b>12</b></td><td class="leechmed"><b>3</b></td>
				<td>7</td><td><u>1720000000</u></td>
			</tr></tbody></table>`,
			definition.search.paths?.[0],
			{
				indexerId: 'noname-club',
				indexerName: 'NoNaMe Club',
				protocol: 'torrent',
				baseUrl: 'https://nnmclub.to/'
			}
		);

		expect(result.errors).toEqual([]);
		expect(result.releases).toHaveLength(1);
		expect(result.releases[0].title).toBe('Despicable Me 4 (2024)');
		expect(result.releases[0].categories).toContain(Category.MOVIES);
		expect(result.releases[0].downloadUrl).toBe('https://nnmclub.to/download.php?id=42');
	});
});
