/**
 * Subtitle Modifications System
 *
 * Based on Bazarr's subtitle modification patterns:
 * - Remove hearing impaired annotations
 * - Fix OCR errors
 * - Shift timing
 * - Convert formats
 */

/**
 * Modification types
 */
export type ModificationType =
	| 'remove_hi'
	| 'remove_sdh'
	| 'fix_ocr'
	| 'shift_timing'
	| 'sync_timing'
	| 'remove_ads'
	| 'fix_punctuation'
	| 'remove_styling'
	| 'fps_convert';

/**
 * Modification options
 */
export interface ModificationOptions {
	/** Remove hearing impaired annotations */
	removeHi?: boolean;
	/** Remove SDH annotations (more aggressive than HI) */
	removeSdh?: boolean;
	/** Fix common OCR errors */
	fixOcr?: boolean;
	/** Shift timing by milliseconds (positive = later, negative = earlier) */
	shiftMs?: number;
	/** Remove common subtitle ads/watermarks */
	removeAds?: boolean;
	/** Fix punctuation spacing */
	fixPunctuation?: boolean;
	/** Remove ASS/SSA styling tags for plain text */
	removeStyling?: boolean;
	/** Convert FPS (source fps, target fps) */
	fpsConvert?: { source: number; target: number };
}

/**
 * SRT cue/entry
 */
export interface SrtCue {
	index: number;
	startTime: number; // milliseconds
	endTime: number; // milliseconds
	text: string;
}

/**
 * Parse SRT content to cues
 */
export function parseSrt(content: string): SrtCue[] {
	const cues: SrtCue[] = [];
	const blocks = content.trim().split(/\r?\n\r?\n/);

	for (const block of blocks) {
		const lines = block.split(/\r?\n/);
		if (lines.length < 3) continue;

		// Parse index
		const index = parseInt(lines[0], 10);
		if (isNaN(index)) continue;

		// Parse timing
		const timingMatch = lines[1].match(
			/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
		);
		if (!timingMatch) continue;

		const startTime =
			parseInt(timingMatch[1]) * 3600000 +
			parseInt(timingMatch[2]) * 60000 +
			parseInt(timingMatch[3]) * 1000 +
			parseInt(timingMatch[4]);

		const endTime =
			parseInt(timingMatch[5]) * 3600000 +
			parseInt(timingMatch[6]) * 60000 +
			parseInt(timingMatch[7]) * 1000 +
			parseInt(timingMatch[8]);

		// Parse text (remaining lines)
		const text = lines.slice(2).join('\n');

		cues.push({ index, startTime, endTime, text });
	}

	return cues;
}

/**
 * Serialize cues back to SRT format
 */
export function serializeSrt(cues: SrtCue[]): string {
	return cues
		.map((cue, i) => {
			const startFormatted = formatSrtTime(cue.startTime);
			const endFormatted = formatSrtTime(cue.endTime);
			return `${i + 1}\n${startFormatted} --> ${endFormatted}\n${cue.text}`;
		})
		.join('\n\n');
}

/**
 * Format milliseconds to SRT timestamp
 */
function formatSrtTime(ms: number): string {
	const hours = Math.floor(ms / 3600000);
	const minutes = Math.floor((ms % 3600000) / 60000);
	const seconds = Math.floor((ms % 60000) / 1000);
	const millis = ms % 1000;

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * Apply modifications to subtitle content
 */
export function applyModifications(
	content: string,
	options: ModificationOptions
): ModificationResult {
	let modified = content;
	const appliedMods: ModificationType[] = [];

	// Detect format
	const isSrt = /^\d+\s*\r?\n\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/m.test(content);
	const isAss = content.includes('[Script Info]') || content.includes('[Events]');

	if (options.removeStyling && isAss) {
		modified = removeAssStyling(modified);
		appliedMods.push('remove_styling');
	}

	if (options.removeHi) {
		modified = removeHearingImpaired(modified);
		appliedMods.push('remove_hi');
	}

	if (options.removeSdh) {
		modified = removeSdh(modified);
		appliedMods.push('remove_sdh');
	}

	if (options.fixOcr) {
		modified = fixOcrErrors(modified);
		appliedMods.push('fix_ocr');
	}

	if (options.removeAds) {
		modified = removeAdvertisements(modified);
		appliedMods.push('remove_ads');
	}

	if (options.fixPunctuation) {
		modified = fixPunctuationSpacing(modified);
		appliedMods.push('fix_punctuation');
	}

	if (options.shiftMs && isSrt) {
		modified = shiftTiming(modified, options.shiftMs);
		appliedMods.push('shift_timing');
	}

	if (options.fpsConvert && isSrt) {
		modified = convertFps(modified, options.fpsConvert.source, options.fpsConvert.target);
		appliedMods.push('fps_convert');
	}

	// Clean up empty cues
	if (isSrt) {
		modified = removeEmptyCues(modified);
	}

	return {
		content: modified,
		appliedModifications: appliedMods,
		originalLength: content.length,
		modifiedLength: modified.length
	};
}

/**
 * Modification result
 */
export interface ModificationResult {
	content: string;
	appliedModifications: ModificationType[];
	originalLength: number;
	modifiedLength: number;
}

/**
 * Remove hearing impaired annotations
 *
 * Removes:
 * - [text in brackets]
 * - (text in parentheses) that looks like sound descriptions
 * - ♪ music notes ♪
 * - Speaker labels like "JOHN:"
 */
export function removeHearingImpaired(content: string): string {
	let result = content;

	// Remove content in brackets [like this]
	result = result.replace(/\[[^\]]*\]/g, '');

	// Remove sound descriptions in parentheses (MUSIC PLAYING)
	// But keep regular dialogue in parentheses
	result = result.replace(/\([A-Z][A-Z\s]*\)/g, '');
	result = result.replace(
		/\([^)]*(?:MUSIC|SINGING|LAUGHING|CRYING|SIGHING|GASPING|GROANING|SCREAMING|APPLAUSE|CHEERING|THUNDER|RINGING|BUZZING|BEEPING|CLICKING|KNOCKING|DOOR|PHONE)[^)]*\)/gi,
		''
	);

	// Remove music notes
	result = result.replace(/♪[^♪]*♪/g, '');
	result = result.replace(/♫[^♫]*♫/g, '');
	result = result.replace(/[♪♫]/g, '');

	// Remove speaker labels at start of lines (but not mid-sentence)
	result = result.replace(/^[A-Z][A-Z\s]*:\s*/gm, '');

	// Clean up multiple newlines
	result = result.replace(/\n{3,}/g, '\n\n');

	// Clean up lines that are now empty except whitespace
	result = result
		.split('\n')
		.map((line) => line.trim())
		.join('\n');

	return result.trim();
}

/**
 * Remove SDH annotations (more aggressive)
 */
export function removeSdh(content: string): string {
	let result = removeHearingImpaired(content);

	// Remove all parenthetical content (more aggressive)
	result = result.replace(/\([^)]+\)/g, '');

	// Remove dashes for speaker changes
	result = result.replace(/^-\s*/gm, '');

	return result.trim();
}

/**
 * Fix common OCR errors
 */
export function fixOcrErrors(content: string): string {
	const fixes: Array<[RegExp, string]> = [
		// Common OCR mistakes
		[/\bl\b/g, 'I'], // lowercase L to I when standalone
		[/\b0\b(?=[a-zA-Z])/g, 'O'], // zero to O before letters
		[/(?<=[a-zA-Z])0\b/g, 'O'], // zero to O after letters
		[/rn/g, 'm'], // rn to m
		[/vv/g, 'w'], // vv to w
		[/\bI'II\b/g, "I'll"], // I'II to I'll
		[/\bI'rn\b/g, "I'm"], // I'rn to I'm
		[/\bdon'l\b/gi, "don't"],
		[/\bcan'l\b/gi, "can't"],
		[/\bwon'l\b/gi, "won't"],
		[/\bdidn'l\b/gi, "didn't"],
		[/\bcouldn'l\b/gi, "couldn't"],
		[/\bwouldn'l\b/gi, "wouldn't"],
		[/\bisn'l\b/gi, "isn't"],
		[/\baren'l\b/gi, "aren't"],
		[/\bweren'l\b/gi, "weren't"],
		// Common typos
		[/\bteh\b/gi, 'the'],
		[/\byuo\b/gi, 'you'],
		[/\bthat;s\b/gi, "that's"],
		// Spacing issues
		[/\s{2,}/g, ' '],
		[/\s+([.,!?;:])/g, '$1'],
		[/([.,!?;:])(?=[A-Za-z])/g, '$1 ']
	];

	let result = content;
	for (const [pattern, replacement] of fixes) {
		result = result.replace(pattern, replacement);
	}

	return result;
}

/**
 * Remove common subtitle advertisements/watermarks
 */
export function removeAdvertisements(content: string): string {
	const adPatterns = [
		/sync\s*(and|&)\s*corrections?\s*by\s*.*/gi,
		/subtitles?\s*by\s*.*/gi,
		/www\.[a-z0-9.-]+\.[a-z]{2,}/gi,
		/http[s]?:\/\/[^\s<>]+/gi,
		/(?:sub(?:title)?s?\s*)?(?:ripped|synced|downloaded)\s*(?:by|from)\s*.*/gi,
		/support\s*us\s*and\s*become\s*.*/gi,
		/\bopensub(?:titles?)?\b/gi,
		/\bsubscene\b/gi,
		/\baddic7ed\b/gi,
		/(?:encoded|ripped)\s*by\s*.*/gi,
		/\[.*(?:subs|team|group|release).*\]/gi
	];

	let result = content;
	for (const pattern of adPatterns) {
		result = result.replace(pattern, '');
	}

	return result.trim();
}

/**
 * Fix punctuation spacing
 */
export function fixPunctuationSpacing(content: string): string {
	let result = content;

	// Remove space before punctuation
	result = result.replace(/\s+([.,!?;:'])/g, '$1');

	// Add space after punctuation (if not already there)
	result = result.replace(/([.,!?;:])(?=[A-Za-z])/g, '$1 ');

	// Fix multiple punctuation
	result = result.replace(/\.{4,}/g, '...');
	result = result.replace(/\?{2,}/g, '?');
	result = result.replace(/!{2,}/g, '!');

	// Fix smart quotes
	result = result.replace(/[""]/g, '"');
	result = result.replace(/['']/g, "'");

	return result;
}

/**
 * Remove ASS/SSA styling tags
 */
export function removeAssStyling(content: string): string {
	// Remove override tags
	const result = content.replace(/\{[^}]*\}/g, '');

	// Extract just the dialogue text from ASS format
	const lines = result.split('\n');
	const dialogueLines: string[] = [];

	let inEvents = false;
	for (const line of lines) {
		if (line.startsWith('[Events]')) {
			inEvents = true;
			continue;
		}
		if (line.startsWith('[') && inEvents) {
			inEvents = false;
		}

		if (inEvents && line.startsWith('Dialogue:')) {
			// Extract text after the 9th comma (Text field in ASS)
			const parts = line.split(',');
			if (parts.length >= 10) {
				const text = parts.slice(9).join(',');
				if (text.trim()) {
					dialogueLines.push(text);
				}
			}
		}
	}

	// Convert \N to newlines
	return dialogueLines.join('\n').replace(/\\N/g, '\n');
}

/**
 * Shift timing by milliseconds
 */
export function shiftTiming(content: string, shiftMs: number): string {
	const cues = parseSrt(content);

	for (const cue of cues) {
		cue.startTime = Math.max(0, cue.startTime + shiftMs);
		cue.endTime = Math.max(0, cue.endTime + shiftMs);
	}

	return serializeSrt(cues);
}

/**
 * Convert FPS (for syncing to different video versions)
 */
export function convertFps(content: string, sourceFps: number, targetFps: number): string {
	if (sourceFps === targetFps) return content;

	const ratio = targetFps / sourceFps;
	const cues = parseSrt(content);

	for (const cue of cues) {
		cue.startTime = Math.round(cue.startTime * ratio);
		cue.endTime = Math.round(cue.endTime * ratio);
	}

	return serializeSrt(cues);
}

/**
 * Remove empty cues from SRT
 */
export function removeEmptyCues(content: string): string {
	const cues = parseSrt(content);
	const nonEmptyCues = cues.filter((cue) => cue.text.trim().length > 0);

	// Renumber
	for (let i = 0; i < nonEmptyCues.length; i++) {
		nonEmptyCues[i].index = i + 1;
	}

	return serializeSrt(nonEmptyCues);
}

/**
 * Merge overlapping cues
 */
export function mergeOverlappingCues(content: string): string {
	const cues = parseSrt(content);
	if (cues.length < 2) return content;

	const merged: SrtCue[] = [cues[0]];

	for (let i = 1; i < cues.length; i++) {
		const prev = merged[merged.length - 1];
		const curr = cues[i];

		// If overlap or very close together
		if (curr.startTime <= prev.endTime + 100) {
			// Merge texts and extend timing
			prev.text = `${prev.text}\n${curr.text}`;
			prev.endTime = Math.max(prev.endTime, curr.endTime);
		} else {
			merged.push(curr);
		}
	}

	return serializeSrt(merged);
}

/**
 * Split long cues at natural break points
 */
export function splitLongCues(content: string, maxDurationMs = 7000): string {
	const cues = parseSrt(content);
	const result: SrtCue[] = [];

	for (const cue of cues) {
		const duration = cue.endTime - cue.startTime;

		if (duration <= maxDurationMs) {
			result.push(cue);
			continue;
		}

		// Split at sentence/phrase boundaries
		const sentences = cue.text.split(/(?<=[.!?])\s+/);
		if (sentences.length > 1) {
			const partDuration = duration / sentences.length;
			for (let i = 0; i < sentences.length; i++) {
				result.push({
					index: 0, // Will be renumbered
					startTime: cue.startTime + Math.round(partDuration * i),
					endTime: cue.startTime + Math.round(partDuration * (i + 1)),
					text: sentences[i]
				});
			}
		} else {
			result.push(cue);
		}
	}

	// Renumber
	for (let i = 0; i < result.length; i++) {
		result[i].index = i + 1;
	}

	return serializeSrt(result);
}

/**
 * Create a modification pipeline
 */
export function createModificationPipeline(
	options: ModificationOptions
): (content: string) => string {
	return (content: string) => applyModifications(content, options).content;
}
