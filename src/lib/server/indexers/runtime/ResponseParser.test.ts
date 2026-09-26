import { describe, it, expect } from 'vitest';
import { ResponseParser } from './ResponseParser';
import { createTemplateEngine } from '../engine/TemplateEngine';
import { createFilterEngine } from '../engine/FilterEngine';
import { createSelectorEngine } from '../engine/SelectorEngine';
import type { YamlDefinition } from '../schema/yamlDefinition';

function createParser(): ResponseParser {
	const definition = {
		id: 'test-json-indexer',
		name: 'Test JSON Indexer',
		type: 'private',
		protocol: 'torrent',
		links: ['https://example.test'],
		caps: {},
		search: {
			paths: [{ path: '/api', method: 'get', inputs: {} }],
			response: { type: 'json' },
			rows: { selector: '$' },
			fields: { title: { selector: 'title' } }
		}
	} as unknown as YamlDefinition;

	const templateEngine = createTemplateEngine();
	const filterEngine = createFilterEngine(templateEngine);
	const selectorEngine = createSelectorEngine(templateEngine, filterEngine);

	return new ResponseParser(definition, templateEngine, filterEngine, selectorEngine);
}

const context = {
	indexerId: 'test-json-indexer',
	indexerName: 'Test JSON Indexer',
	protocol: 'torrent' as const,
	baseUrl: 'https://example.test'
};

describe('ResponseParser — empty JSON body', () => {
	it('reports a clear "empty response body" error instead of the raw JSON.parse message', () => {
		const parser = createParser();

		const result = parser.parse('', undefined, context);

		expect(result.releases).toHaveLength(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain('Indexer returned an empty response body');
		expect(result.errors[0]).not.toContain('Unexpected end of JSON input');
	});

	it('also treats a whitespace-only body as empty', () => {
		const parser = createParser();

		const result = parser.parse('   \n  ', undefined, context);

		expect(result.errors[0]).toContain('Indexer returned an empty response body');
	});

	it('still parses a genuinely empty JSON array as zero results with no error', () => {
		const parser = createParser();

		const result = parser.parse('[]', undefined, context);

		expect(result.releases).toHaveLength(0);
		expect(result.errors).toHaveLength(0);
	});
});
