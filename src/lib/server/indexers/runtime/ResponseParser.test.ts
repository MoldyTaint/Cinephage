import { describe, it, expect } from 'vitest';
import { ResponseParser, type ParseContext } from './ResponseParser';
import { TemplateEngine } from '../engine/TemplateEngine';
import { FilterEngine } from '../engine/FilterEngine';
import { SelectorEngine } from '../engine/SelectorEngine';
import type { YamlDefinition } from '../schema/yamlDefinition';
import { Category } from '../types';

describe('ResponseParser', () => {
	const mockDefinition: YamlDefinition = {
		id: 'test-indexer',
		name: 'Test Indexer',
		type: 'private',
		protocol: 'torrent',
		caps: {
			categorymappings: [],
			categories: {}
		},
		search: {
			paths: [],
			response: {
				type: 'json'
			},
			fields: {
				title: { selector: 'title' },
				download: { selector: 'downloadUrl' },
				category: { selector: 'category', optional: true },
				protocol: { selector: 'protocol', optional: true }
			}
		}
	} as unknown as YamlDefinition;

	const templateEngine = new TemplateEngine();
	const filterEngine = new FilterEngine();
	const selectorEngine = new SelectorEngine(templateEngine, filterEngine);

	const parser = new ResponseParser(mockDefinition, templateEngine, filterEngine, selectorEngine);

	const context: ParseContext = {
		indexerId: 'test-indexer',
		indexerName: 'Test Indexer',
		protocol: 'torrent',
		baseUrl: 'http://localhost'
	};

	describe('parseCategories', () => {
		it('should parse single category ID', () => {
			const json = {
				title: 'Release Title',
				downloadUrl: 'http://example.com/file.torrent',
				category: 2000
			};
			const results = parser.parse(JSON.stringify([json]), undefined, context);
			expect(results.releases).toHaveLength(1);
			expect(results.releases[0].categories).toEqual([Category.MOVIES]);
		});

		it('should parse comma-separated category IDs from stringified JSON array', () => {
			const json = {
				title: 'Release Title',
				downloadUrl: 'http://example.com/file.torrent',
				category: [5000, 5030]
			};
			const results = parser.parse(JSON.stringify([json]), undefined, context);
			expect(results.releases).toHaveLength(1);
			expect(results.releases[0].categories).toEqual([Category.TV, Category.TV_SD]);
		});
	});

	describe('dynamic protocol selection', () => {
		it('should default to indexer protocol if none specified', () => {
			const json = {
				title: 'Release Title',
				downloadUrl: 'http://example.com/file.torrent'
			};
			const results = parser.parse(JSON.stringify([json]), undefined, context);
			expect(results.releases).toHaveLength(1);
			expect(results.releases[0].protocol).toBe('torrent');
		});

		it('should override default protocol if protocol field is present in response', () => {
			const jsonUsenet = {
				title: 'Release Title 1',
				downloadUrl: 'http://example.com/file.nzb',
				protocol: 'usenet'
			};
			const jsonTorrent = {
				title: 'Release Title 2',
				downloadUrl: 'http://example.com/file.torrent',
				protocol: 'torrent'
			};
			const results = parser.parse(JSON.stringify([jsonUsenet, jsonTorrent]), undefined, context);
			expect(results.releases).toHaveLength(2);
			expect(results.releases[0].protocol).toBe('usenet');
			expect(results.releases[1].protocol).toBe('torrent');
		});
	});
});
