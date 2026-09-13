import { describe, it, expect } from 'vitest';
import { audioTokens } from './audio';

const audioLanguagesToken = audioTokens.find((t) => t.name === 'AudioLanguages')!;
const enabledConfig = { includeMediaInfo: true } as any;
const gatedConfig = { includeMediaInfo: false } as any;

describe('AudioLanguages token', () => {
	it('canonicalizes ffprobe ISO 639-2 codes to base tags joined by spaces', () => {
		expect(
			audioLanguagesToken.render({ title: 't', audioLanguages: ['eng', 'jpn'] }, enabledConfig)
		).toBe('en ja');
	});

	it('renders already-canonical tags unchanged (deduplicated order preserved)', () => {
		expect(
			audioLanguagesToken.render({ title: 't', audioLanguages: ['en', 'ja'] }, enabledConfig)
		).toBe('en ja');
	});

	it('renders und when the track set is empty or missing', () => {
		expect(audioLanguagesToken.render({ title: 't', audioLanguages: [] }, enabledConfig)).toBe(
			'und'
		);
		expect(audioLanguagesToken.render({ title: 't' }, enabledConfig)).toBe('und');
	});

	it('renders und when every track is unknown', () => {
		expect(audioLanguagesToken.render({ title: 't', audioLanguages: ['und'] }, enabledConfig)).toBe(
			'und'
		);
		expect(
			audioLanguagesToken.render({ title: 't', audioLanguages: ['unknown'] }, enabledConfig)
		).toBe('und');
	});

	it('never renders the multi marker as a language', () => {
		expect(
			audioLanguagesToken.render({ title: 't', audioLanguages: ['multi'] }, enabledConfig)
		).toBe('und');
	});

	it('drops unknown entries from mixed sets instead of rendering them', () => {
		expect(
			audioLanguagesToken.render({ title: 't', audioLanguages: ['eng', 'und', 'xx'] }, enabledConfig)
		).toBe('en');
	});

	it('renders an empty string when the includeMediaInfo gate is off', () => {
		expect(
			audioLanguagesToken.render({ title: 't', audioLanguages: ['eng'] }, gatedConfig)
		).toBe('');
	});
});
