import { describe, it, expect } from 'vitest';
import { isVideoFile } from './constants.js';

describe('isVideoFile', () => {
	it('returns true for common video extensions', () => {
		expect(isVideoFile('movie.mkv')).toBe(true);
		expect(isVideoFile('movie.mp4')).toBe(true);
		expect(isVideoFile('movie.avi')).toBe(true);
		expect(isVideoFile('movie.m4v')).toBe(true);
		expect(isVideoFile('movie.mov')).toBe(true);
		expect(isVideoFile('movie.wmv')).toBe(true);
		expect(isVideoFile('movie.webm')).toBe(true);
		expect(isVideoFile('movie.flv')).toBe(true);
		expect(isVideoFile('movie.ts')).toBe(true);
	});

	it('returns false for non-video extensions', () => {
		expect(isVideoFile('movie.txt')).toBe(false);
		expect(isVideoFile('movie.nfo')).toBe(false);
		expect(isVideoFile('movie.srt')).toBe(false);
		expect(isVideoFile('movie.jpg')).toBe(false);
	});

	it('handles uppercase extensions', () => {
		expect(isVideoFile('MOVIE.MKV')).toBe(true);
		expect(isVideoFile('MOVIE.MP4')).toBe(true);
	});

	it('accepts extra extensions', () => {
		expect(isVideoFile('movie.strm', ['.strm'])).toBe(true);
		expect(isVideoFile('movie.ogv', ['.ogv', '.3gp', '.strm'])).toBe(true);
	});

	it('rejects extra extension when not passed', () => {
		expect(isVideoFile('movie.strm')).toBe(false);
		expect(isVideoFile('movie.ogv')).toBe(false);
	});

	it('handles paths with dots', () => {
		expect(isVideoFile('/path/to/Movie.2024.1080p.mkv')).toBe(true);
		expect(isVideoFile('Show.S01E02.mp4')).toBe(true);
	});
});
