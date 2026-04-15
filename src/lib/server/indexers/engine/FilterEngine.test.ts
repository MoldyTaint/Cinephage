import { describe, it, expect } from 'vitest';
import { createTemplateEngine } from './TemplateEngine';
import { createFilterEngine } from './FilterEngine';
import type { FilterBlock } from '../schema/yamlDefinition';

const RUTRACKER_STRIP_FILTERS: FilterBlock[] = [
	{
		name: 're_replace',
		args: ['[А-Яа-яЁё]+', '{{ if .Config.stripcyrillic }}{{ else }}$&{{ end }}']
	},
	{ name: 're_replace', args: ['^\\s*/\\s*', ''] },
	{ name: 're_replace', args: ['\\(\\s*/\\s*', '('] },
	{ name: 're_replace', args: ['(?:\\s*,\\s*){2,}', ', '] },
	{ name: 're_replace', args: ['\\[\\s*,\\s*', '['] },
	{ name: 're_replace', args: ['\\s*,\\s*\\]', ']'] },
	{ name: 're_replace', args: ['\\(\\s*,\\s*', '('] },
	{ name: 're_replace', args: ['\\s*,\\s*\\)', ')'] },
	{ name: 're_replace', args: ['\\(\\s*\\)', ''] },
	{ name: 're_replace', args: ['\\s{2,}', ' '] },
	{ name: 'trim' }
];

describe('FilterEngine RuTracker strip pipeline', () => {
	it('strips Cyrillic cleanly when stripcyrillic is enabled', () => {
		const templateEngine = createTemplateEngine();
		templateEngine.setConfig({ stripcyrillic: true });
		const filterEngine = createFilterEngine(templateEngine);

		const input =
			'Военная машина / War Machine (Патрик Хьюз / Patrick Hughes) [2026, Великобритания, Австралия, WEB-DL 2160p, HDR, Dolby Vision]';
		const output = filterEngine.applyFilters(input, RUTRACKER_STRIP_FILTERS);

		expect(output).toContain('War Machine');
		expect(output).toContain('Patrick Hughes');
		expect(output).toContain('WEB-DL 2160p');
		expect(output.startsWith('/')).toBe(false);
		expect(output).not.toMatch(/[А-Яа-яЁё]/);
		expect(output).not.toContain(', ,');
	});

	it('preserves Cyrillic when stripcyrillic is disabled', () => {
		const templateEngine = createTemplateEngine();
		templateEngine.setConfig({ stripcyrillic: false });
		const filterEngine = createFilterEngine(templateEngine);

		const input = 'Военная машина / War Machine';
		const output = filterEngine.applyFilters(input, RUTRACKER_STRIP_FILTERS);

		expect(output).toContain('Военная');
		expect(output).toContain('War Machine');
	});
});
