import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FilterEngine } from '../engine/FilterEngine.js';
import { SelectorEngine } from '../engine/SelectorEngine.js';
import { TemplateEngine } from '../engine/TemplateEngine.js';
import { ResponseParser } from '../runtime/ResponseParser.js';
import { YamlDefinitionLoader } from '../loader/YamlDefinitionLoader.js';

const definitionPath = resolve('data/indexers/definitions/digitalcore.yaml');

async function loadDefinition() {
	const loader = new YamlDefinitionLoader(dirname(definitionPath));
	const result = await loader.loadOne(definitionPath);
	expect(result).not.toBeNull();
	return result!.definition;
}

function buildParser(definition: Awaited<ReturnType<typeof loadDefinition>>) {
	const templateEngine = new TemplateEngine();
	const filterEngine = new FilterEngine();
	const selectorEngine = new SelectorEngine(templateEngine);
	return new ResponseParser(definition, templateEngine, filterEngine, selectorEngine);
}

const context = {
	indexerId: 'digitalcore',
	indexerName: 'DigitalCore',
	protocol: 'torrent' as const,
	baseUrl: 'https://digitalcore.club/'
};

describe('DigitalCore definition', () => {
	it('binds search.response.type through the schema instead of dropping it', async () => {
		const definition = await loadDefinition();
		expect(definition.search.response?.type).toBe('json');
	});

	it('parses a real JSON payload using the search-block-level response type', async () => {
		const definition = await loadDefinition();
		const parser = buildParser(definition);

		const payload = JSON.stringify([
			{
				id: 123,
				name: 'Some.Movie.2024.1080p.WEB-DL-GROUP',
				category: 6,
				added: '2024-01-01 00:00:00',
				size: 1073741824,
				seeders: 10,
				leechers: 1,
				times_completed: 5,
				numfiles: 1,
				frileech: '0'
			}
		]);

		const result = parser.parse(payload, definition.search.paths?.[0], context);

		expect(result.errors).toEqual([]);
		expect(result.releases).toHaveLength(1);
		expect(result.releases[0].title).toBe('Some.Movie.2024.1080p.WEB-DL-GROUP');
	});

	it('reports a clean parse error instead of crashing when the tracker returns HTML', async () => {
		const definition = await loadDefinition();
		const parser = buildParser(definition);

		const htmlChallengePage = '<html><body>Just a moment...</body></html>';

		const result = parser.parse(htmlChallengePage, definition.search.paths?.[0], context);

		expect(result.releases).toEqual([]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain('Parse error');
		expect(result.errors[0]).not.toContain('sub-selector');
	});
});
