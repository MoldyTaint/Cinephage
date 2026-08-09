import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { YamlDefinitionLoader } from '../loader/YamlDefinitionLoader.js';

const definitionPath = resolve('data/indexers/definitions/kinozal-magnet.yaml');

async function loadDefinition() {
	const loader = new YamlDefinitionLoader(resolve('data/indexers/definitions'));
	const result = await loader.loadOne(definitionPath);
	expect(result).not.toBeNull();
	return result!.definition;
}

describe('Kinozal magnet category mappings', () => {
	it('maps cartoon sections to both TV and movie categories', async () => {
		const definition = await loadDefinition();
		const mappings = new Map<string, string[]>();

		for (const entry of definition.caps.categorymappings ?? []) {
			const id = String(entry.id);
			const categories = mappings.get(id) ?? [];
			if (entry.cat) categories.push(entry.cat);
			mappings.set(id, categories);
		}

		expect(mappings.get('1003')).toEqual(expect.arrayContaining(['TV', 'Movies']));
		expect(mappings.get('21')).toEqual(expect.arrayContaining(['TV', 'Movies']));
		expect(mappings.get('22')).toEqual(expect.arrayContaining(['TV', 'Movies']));
		expect(mappings.get('20')).toEqual(expect.arrayContaining(['TV/Anime', 'Movies/Other']));
	});
});
