import { describe, it, expect } from 'vitest';
import {
	parseSrtCues,
	parseSrtToSpans,
	applySrtDeltas,
	msToSrtTime,
	parseAssCues,
	parseAssToSpans,
	applyAssDeltas,
	msToAssTime,
	parseVttCues,
	parseVttToSpans,
	applyVttDeltas,
	msToVttTime,
	detectFormat,
	parseSubtitleToSpans,
	applyDeltas
} from './parsers.js';
import type { SubtitleFormat } from '../types.js';

describe('parsers', () => {
	// =========================================================================
	// SRT
	// =========================================================================
	describe('SRT', () => {
		const sampleSrt = [
			'1',
			'00:01:00,000 --> 00:01:05,000',
			'Hello world',
			'',
			'2',
			'00:02:00,500 --> 00:02:03,200',
			'Second line',
			'with continuation'
		].join('\n');

		it('should parse SRT cues', () => {
			const cues = parseSrtCues(sampleSrt);
			expect(cues).toHaveLength(2);
			expect(cues[0].index).toBe(1);
			expect(cues[0].startTime).toBe(60000);
			expect(cues[0].endTime).toBe(65000);
			expect(cues[0].text).toBe('Hello world');
			expect(cues[1].startTime).toBe(120500);
			expect(cues[1].endTime).toBe(123200);
			expect(cues[1].text).toBe('Second line\nwith continuation');
		});

		it('should extract time spans from SRT', () => {
			const spans = parseSrtToSpans(sampleSrt);
			expect(spans).toHaveLength(2);
			expect(spans[0]).toEqual({ start: 60000, end: 65000 });
			expect(spans[1]).toEqual({ start: 120500, end: 123200 });
		});

		it('should apply deltas to SRT', () => {
			const shifted = applySrtDeltas(sampleSrt, [1000, -500]);
			const cues = parseSrtCues(shifted);
			expect(cues[0].startTime).toBe(61000);
			expect(cues[0].endTime).toBe(66000);
			expect(cues[1].startTime).toBe(120000);
			expect(cues[1].endTime).toBe(122700);
		});

		it('should throw if delta count mismatches', () => {
			expect(() => applySrtDeltas(sampleSrt, [1000])).toThrow();
		});

		it('should format ms to SRT time', () => {
			expect(msToSrtTime(0)).toBe('00:00:00,000');
			expect(msToSrtTime(3723456)).toBe('01:02:03,456');
			expect(msToSrtTime(60000)).toBe('00:01:00,000');
		});
	});

	// =========================================================================
	// ASS/SSA
	// =========================================================================
	describe('ASS/SSA', () => {
		const sampleAss = [
			'[Script Info]',
			'ScriptType: v4.00+',
			'',
			'[Events]',
			'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
			'Dialogue: 0,0:01:00.00,0:01:05.00,Default,,0,0,0,,Hello world',
			'Dialogue: 0,0:02:00.50,0:02:03.20,Default,,0,0,0,,Second, with comma'
		].join('\n');

		it('should parse ASS dialogue cues', () => {
			const cues = parseAssCues(sampleAss);
			expect(cues).toHaveLength(2);
			expect(cues[0].startTime).toBe(60000);
			expect(cues[0].endTime).toBe(65000);
			expect(cues[0].text).toBe('Hello world');
			expect(cues[1].startTime).toBe(120500);
			expect(cues[1].endTime).toBe(123200);
			expect(cues[1].text).toBe('Second, with comma');
		});

		it('should extract time spans from ASS', () => {
			const spans = parseAssToSpans(sampleAss);
			expect(spans).toHaveLength(2);
			expect(spans[0]).toEqual({ start: 60000, end: 65000 });
		});

		it('should apply deltas to ASS content', () => {
			const shifted = applyAssDeltas(sampleAss, [1000, -500]);
			const cues = parseAssCues(shifted);
			expect(cues[0].startTime).toBe(61000);
			expect(cues[0].endTime).toBe(66000);
			expect(cues[1].startTime).toBe(120000);
			expect(cues[1].endTime).toBe(122700);
		});

		it('should format ms to ASS time', () => {
			expect(msToAssTime(0)).toBe('0:00:00.00');
			expect(msToAssTime(3723450)).toBe('1:02:03.45');
		});
	});

	// =========================================================================
	// VTT
	// =========================================================================
	describe('VTT', () => {
		const sampleVtt = [
			'WEBVTT',
			'',
			'1',
			'00:01:00.000 --> 00:01:05.000',
			'Hello world',
			'',
			'2',
			'00:02:00.500 --> 00:02:03.200',
			'Second line'
		].join('\n');

		it('should parse VTT cues', () => {
			const cues = parseVttCues(sampleVtt);
			expect(cues).toHaveLength(2);
			expect(cues[0].startTime).toBe(60000);
			expect(cues[0].endTime).toBe(65000);
			expect(cues[0].text).toBe('Hello world');
		});

		it('should extract time spans from VTT', () => {
			const spans = parseVttToSpans(sampleVtt);
			expect(spans).toHaveLength(2);
			expect(spans[0]).toEqual({ start: 60000, end: 65000 });
		});

		it('should apply deltas to VTT content', () => {
			const shifted = applyVttDeltas(sampleVtt, [1000, -500]);
			const cues = parseVttCues(shifted);
			expect(cues[0].startTime).toBe(61000);
			expect(cues[0].endTime).toBe(66000);
			expect(cues[1].startTime).toBe(120000);
			expect(cues[1].endTime).toBe(122700);
		});

		it('should format ms to VTT time', () => {
			expect(msToVttTime(0)).toBe('00:00:00.000');
			expect(msToVttTime(3723456)).toBe('01:02:03.456');
		});
	});

	// =========================================================================
	// Format Detection
	// =========================================================================
	describe('detectFormat', () => {
		it('should detect SRT', () => {
			expect(detectFormat('1\n00:01:00,000 --> 00:01:05,000\nHello')).toBe('srt');
		});

		it('should detect VTT', () => {
			expect(detectFormat('WEBVTT\n\n1\n00:01:00.000 --> 00:01:05.000\nHello')).toBe('vtt');
		});

		it('should detect ASS', () => {
			expect(detectFormat('[Script Info]\nScriptType: v4.00+\n[Events]')).toBe('ass');
		});

		it('should detect SSA', () => {
			expect(detectFormat('[Script Info]\nScriptType: v4.00\n[Events]')).toBe('ssa');
		});

		it('should return unknown for unrecognized format', () => {
			expect(detectFormat('just some random text')).toBe('unknown');
		});
	});

	// =========================================================================
	// Generic dispatch
	// =========================================================================
	describe('parseSubtitleToSpans', () => {
		it('should auto-detect and parse SRT', () => {
			const content =
				'1\n00:00:01,000 --> 00:00:02,000\nHi\n\n2\n00:00:03,000 --> 00:00:04,000\nBye';
			const spans = parseSubtitleToSpans(content);
			expect(spans).toHaveLength(2);
			expect(spans[0]).toEqual({ start: 1000, end: 2000 });
		});

		it('should throw for unsupported format', () => {
			expect(() => parseSubtitleToSpans('gibberish', 'unknown' as SubtitleFormat)).toThrow();
		});
	});

	describe('applyDeltas', () => {
		it('should apply to SRT via dispatch', () => {
			const content =
				'1\n00:00:01,000 --> 00:00:02,000\nHi\n\n2\n00:00:03,000 --> 00:00:04,000\nBye';
			const shifted = applyDeltas(content, [500, -500]);
			const spans = parseSubtitleToSpans(shifted);
			expect(spans[0]).toEqual({ start: 1500, end: 2500 });
			expect(spans[1]).toEqual({ start: 2500, end: 3500 });
		});
	});
});
