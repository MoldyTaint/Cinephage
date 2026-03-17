/**
 * Voice Activity Detection (VAD) from Audio
 *
 * Extracts speech segments from video/audio files using ffmpeg for audio
 * extraction and an energy-based VAD algorithm.
 *
 * The pipeline:
 * 1. Extract audio to raw mono 16kHz PCM using ffmpeg
 * 2. Stream PCM data in chunks, computing frame-level energy incrementally
 * 3. Apply adaptive threshold to identify speech frames
 * 4. Convert speech frames to TimeSpan[] for use as reference in alignment
 *
 * Memory optimization: PCM data is streamed in ~1MB chunks rather than loaded
 * entirely into memory. For a 2hr movie at 16kHz mono 16-bit, this reduces
 * peak memory from ~500MB to ~5MB.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, unlink, mkdtemp, rmdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import type { TimeSpan } from './types.js';
import { createTimeSpan } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Size of PCM read chunks in bytes (~1MB = 524288 samples at 16-bit).
 * Chosen to be large enough for efficient I/O but small enough to avoid
 * significant memory pressure.
 */
const PCM_CHUNK_BYTES = 1024 * 1024;

/**
 * VAD configuration.
 */
export interface VadOptions {
	/** Sample rate for audio extraction (default: 16000) */
	sampleRate?: number;
	/** Frame size in samples for energy computation (default: 512) */
	frameSize?: number;
	/** Hop size in samples between frames (default: 256) */
	hopSize?: number;
	/** Energy threshold multiplier above mean (default: 1.5) */
	thresholdMultiplier?: number;
	/** Minimum speech segment duration in ms (default: 200) */
	minSpeechDurationMs?: number;
	/** Maximum gap to bridge between speech segments in ms (default: 300) */
	maxGapMs?: number;
	/** Path to ffmpeg binary (default: 'ffmpeg') */
	ffmpegPath?: string;
}

const DEFAULT_VAD_OPTIONS: Required<VadOptions> = {
	sampleRate: 16000,
	frameSize: 512,
	hopSize: 256,
	thresholdMultiplier: 1.5,
	minSpeechDurationMs: 200,
	maxGapMs: 300,
	ffmpegPath: 'ffmpeg'
};

const DEFAULT_VAD_TIMEOUT_MS = 300_000;
const DEFAULT_STRM_VAD_TIMEOUT_MS = 45_000;
const DEFAULT_STRM_ANALYSIS_SECONDS = 240;
const DEFAULT_STRM_RW_TIMEOUT_MS = 15_000;

type ExecFileError = Error & {
	stderr?: string;
	stdout?: string;
	code?: string | number;
	signal?: string;
	killed?: boolean;
};

function parseStrmUrl(content: string): string | null {
	const lines = content.split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		return line;
	}
	return null;
}

function getPositiveIntEnv(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;

	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return Math.round(parsed);
}

function isHttpInput(inputPath: string): boolean {
	return inputPath.startsWith('http://') || inputPath.startsWith('https://');
}

async function resolveAudioInputPath(videoPath: string): Promise<string> {
	if (extname(videoPath).toLowerCase() !== '.strm') {
		return videoPath;
	}

	const content = await readFile(videoPath, 'utf-8');
	const strmUrl = parseStrmUrl(content);
	if (!strmUrl) {
		throw new Error('STRM file has no URL');
	}

	let parsed: URL;
	try {
		parsed = new URL(strmUrl);
	} catch {
		throw new Error('STRM file contains an invalid URL');
	}

	if (!['http:', 'https:'].includes(parsed.protocol)) {
		throw new Error(`STRM URL protocol '${parsed.protocol}' is not supported`);
	}

	return strmUrl;
}

function getFriendlyFfmpegError(error: unknown): string {
	if (!(error instanceof Error)) {
		return 'Could not extract audio from the media source.';
	}

	const execError = error as ExecFileError;
	const stderr = execError.stderr ?? '';
	const message = (execError.message || '').toLowerCase();
	const stderrLower = stderr.toLowerCase();

	if (message.includes('timed out') || stderrLower.includes('timed out')) {
		return 'Audio extraction timed out. The source may be slow or unreachable.';
	}
	if (stderrLower.includes('no such file or directory')) {
		return 'Media source not found.';
	}
	if (
		stderrLower.includes('invalid data found when processing input') ||
		stderrLower.includes('error opening input')
	) {
		return 'Could not read a valid media stream from the source.';
	}
	if (
		stderrLower.includes('connection refused') ||
		stderrLower.includes('failed to resolve hostname') ||
		stderrLower.includes('temporary failure in name resolution')
	) {
		return 'Could not connect to the media source.';
	}
	if (stderrLower.includes('401 unauthorized') || stderrLower.includes('403 forbidden')) {
		return 'Media source requires authorization and could not be accessed.';
	}
	if (stderrLower.includes('404 not found')) {
		return 'Media source URL was not found.';
	}
	if (stderrLower.includes('server returned 5')) {
		return 'Media source server returned an error.';
	}

	return 'Could not extract audio from the media source.';
}

/**
 * Extract speech segments from a video/audio file.
 *
 * Uses ffmpeg to extract mono PCM audio, then streams the PCM data in chunks
 * to compute energy-based VAD without loading the entire file into memory.
 *
 * @param videoPath - Path to video or audio file
 * @param options - VAD configuration
 * @returns TimeSpan array of speech segments
 */
export async function extractSpeechSegments(
	videoPath: string,
	options?: VadOptions
): Promise<TimeSpan[]> {
	const opts = { ...DEFAULT_VAD_OPTIONS, ...options };
	const inputPath = await resolveAudioInputPath(videoPath);
	const isRemoteHttpSource = isHttpInput(inputPath);

	// Create temp file for PCM output
	const tempDir = await mkdtemp(join(tmpdir(), 'cinephage-vad-'));
	const tempPcmPath = join(tempDir, `${randomUUID()}.raw`);

	try {
		// Extract audio using ffmpeg: mono, 16kHz, signed 16-bit little-endian PCM
		const ffmpegArgs = ['-nostdin', '-hide_banner', '-loglevel', 'error'];

		if (isRemoteHttpSource) {
			const rwTimeoutMs = getPositiveIntEnv(
				'SUBTITLE_SYNC_STRM_RW_TIMEOUT_MS',
				DEFAULT_STRM_RW_TIMEOUT_MS
			);
			const maxAnalysisSeconds = getPositiveIntEnv(
				'SUBTITLE_SYNC_STRM_ANALYSIS_SECONDS',
				DEFAULT_STRM_ANALYSIS_SECONDS
			);

			ffmpegArgs.push(
				'-rw_timeout',
				String(rwTimeoutMs * 1000), // ffmpeg expects microseconds
				'-analyzeduration',
				'4000000',
				'-probesize',
				'4000000'
			);

			if (maxAnalysisSeconds > 0) {
				ffmpegArgs.push('-t', String(maxAnalysisSeconds));
			}
		}

		ffmpegArgs.push(
			'-i',
			inputPath,
			'-vn', // No video
			'-ac',
			'1', // Mono
			'-ar',
			String(opts.sampleRate),
			'-f',
			's16le', // Signed 16-bit LE PCM
			'-acodec',
			'pcm_s16le',
			'-y', // Overwrite
			tempPcmPath
		);

		const timeoutMs = isRemoteHttpSource
			? getPositiveIntEnv('SUBTITLE_SYNC_STRM_TIMEOUT_MS', DEFAULT_STRM_VAD_TIMEOUT_MS)
			: DEFAULT_VAD_TIMEOUT_MS;

		try {
			await execFileAsync(opts.ffmpegPath, ffmpegArgs, { timeout: timeoutMs });
		} catch (error) {
			throw new Error(getFriendlyFfmpegError(error));
		}

		// Stream PCM data and compute VAD incrementally
		return await vadFromStream(tempPcmPath, opts);
	} finally {
		// Clean up temp files
		try {
			if (existsSync(tempPcmPath)) await unlink(tempPcmPath);
			await rmdir(tempDir);
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Stream PCM data from a file and compute VAD incrementally.
 *
 * Two-phase approach:
 * Phase 1: Stream through the file computing per-frame RMS energies.
 *          Energies are stored as Float32Array (~4 bytes/frame vs 8 for Float64).
 *          For a 2hr movie: ~450K frames = ~1.8MB.
 * Phase 2: Compute threshold from energies and extract speech segments.
 *
 * @param pcmPath - Path to raw PCM file (mono, 16-bit LE)
 * @param opts - VAD options
 * @returns TimeSpan array of speech segments
 */
async function vadFromStream(pcmPath: string, opts: Required<VadOptions>): Promise<TimeSpan[]> {
	const { frameSize, hopSize } = opts;

	// Get file size to pre-allocate energies array
	const fileStat = await stat(pcmPath);
	const totalSamples = Math.floor(fileStat.size / 2); // 16-bit = 2 bytes per sample
	const numFrames = Math.max(0, Math.floor((totalSamples - frameSize) / hopSize) + 1);

	if (numFrames === 0) return [];

	// Pre-allocate energies array (Float32 to save memory: 4 bytes vs 8)
	const energies = new Float32Array(numFrames);

	// Phase 1: Stream PCM and compute per-frame energies
	// We keep a carry-over buffer of the last (frameSize - 1) samples
	// to handle frame windows that span chunk boundaries.
	const carryoverCapacity = frameSize - 1;
	const carryover = new Int16Array(carryoverCapacity);
	let carryoverLen = 0;
	let globalSampleOffset = 0;
	let frameIdx = 0;

	await new Promise<void>((resolve, reject) => {
		const stream = createReadStream(pcmPath, { highWaterMark: PCM_CHUNK_BYTES });
		let leftoverBytes: Buffer | null = null;

		stream.on('data', (rawChunk: Buffer) => {
			// Handle leftover byte from previous chunk (16-bit alignment)
			let chunk: Buffer;
			if (leftoverBytes && leftoverBytes.length > 0) {
				chunk = Buffer.concat([leftoverBytes, rawChunk]);
				leftoverBytes = null;
			} else {
				chunk = rawChunk;
			}

			// If odd number of bytes, save the last byte for next chunk
			if (chunk.length % 2 !== 0) {
				leftoverBytes = Buffer.from([chunk[chunk.length - 1]]);
				chunk = chunk.subarray(0, chunk.length - 1);
			}

			const numSamplesInChunk = chunk.length / 2;
			// Create Int16Array view of this chunk
			const samples = new Int16Array(chunk.buffer, chunk.byteOffset, numSamplesInChunk);

			// Process frames using carryover + current chunk samples.
			// Virtual sample array: [...carryover[0..carryoverLen], ...samples]
			const virtualLen = carryoverLen + numSamplesInChunk;

			while (frameIdx < numFrames) {
				const frameGlobalStart = frameIdx * hopSize;
				// Position within the virtual buffer
				const frameLocalStart = frameGlobalStart - globalSampleOffset;

				if (frameLocalStart + frameSize > virtualLen) {
					// Not enough samples for this frame yet
					break;
				}

				// Compute RMS energy for this frame
				let sumSq = 0;
				for (let i = 0; i < frameSize; i++) {
					const localPos = frameLocalStart + i;
					let sampleVal: number;
					if (localPos < carryoverLen) {
						sampleVal = carryover[localPos] / 32768;
					} else {
						sampleVal = samples[localPos - carryoverLen] / 32768;
					}
					sumSq += sampleVal * sampleVal;
				}
				energies[frameIdx] = Math.sqrt(sumSq / frameSize);
				frameIdx++;
			}

			// Update carryover: keep the last (frameSize - 1) samples from virtual buffer
			const virtualStart = Math.max(0, virtualLen - carryoverCapacity);
			let newCarryoverLen = 0;
			for (let i = virtualStart; i < virtualLen; i++) {
				let val: number;
				if (i < carryoverLen) {
					val = carryover[i];
				} else {
					val = samples[i - carryoverLen];
				}
				carryover[newCarryoverLen++] = val;
			}

			globalSampleOffset += virtualLen - newCarryoverLen;
			carryoverLen = newCarryoverLen;
		});

		stream.on('end', () => resolve());
		stream.on('error', (err) => reject(err));
	});

	// Phase 2: Compute threshold and extract speech segments
	return vadFromEnergies(energies, frameIdx, opts);
}

/**
 * Run energy-based VAD on raw PCM samples (in-memory version).
 *
 * In-memory VAD path, used by unit tests and for small audio buffers.
 *
 * @param samples - Signed 16-bit PCM samples (mono)
 * @param opts - VAD options
 * @returns TimeSpan array of speech segments
 */
export function vadFromSamples(samples: Int16Array, opts: Required<VadOptions>): TimeSpan[] {
	if (samples.length === 0) return [];

	const { frameSize, hopSize } = opts;

	// Compute per-frame energy (RMS)
	const numFrames = Math.max(0, Math.floor((samples.length - frameSize) / hopSize) + 1);
	if (numFrames === 0) return [];

	const energies = new Float32Array(numFrames);

	for (let f = 0; f < numFrames; f++) {
		const start = f * hopSize;
		let sumSq = 0;
		for (let i = 0; i < frameSize && start + i < samples.length; i++) {
			const sample = samples[start + i] / 32768; // Normalize to [-1, 1]
			sumSq += sample * sample;
		}
		energies[f] = Math.sqrt(sumSq / frameSize); // RMS energy
	}

	return vadFromEnergies(energies, numFrames, opts);
}

/**
 * Convert per-frame energies into speech TimeSpan segments.
 *
 * Applies adaptive threshold, identifies speech frames, converts to time segments,
 * merges close segments, and filters short ones.
 *
 * @param energies - Per-frame RMS energy values
 * @param numFrames - Number of valid frames in the energies array
 * @param opts - VAD options
 * @returns TimeSpan array of speech segments
 */
function vadFromEnergies(
	energies: Float32Array,
	numFrames: number,
	opts: Required<VadOptions>
): TimeSpan[] {
	const { sampleRate, hopSize, thresholdMultiplier, minSpeechDurationMs, maxGapMs } = opts;

	// Compute adaptive threshold
	let totalEnergy = 0;
	for (let f = 0; f < numFrames; f++) {
		totalEnergy += energies[f];
	}
	const meanEnergy = totalEnergy / numFrames;
	const threshold = meanEnergy * thresholdMultiplier;

	// Convert frames to time segments (on-the-fly, no isSpeech array needed)
	const msPerFrame = (hopSize / sampleRate) * 1000;
	const rawSegments: TimeSpan[] = [];

	let segStart = -1;
	for (let f = 0; f <= numFrames; f++) {
		const isSpeech = f < numFrames && energies[f] > threshold;
		if (isSpeech) {
			if (segStart === -1) segStart = f;
		} else if (segStart !== -1) {
			const startMs = Math.round(segStart * msPerFrame);
			const endMs = Math.round(f * msPerFrame);
			if (endMs > startMs) {
				rawSegments.push(createTimeSpan(startMs, endMs));
			}
			segStart = -1;
		}
	}

	// Merge close segments (bridge small gaps)
	const merged = mergeCloseSegments(rawSegments, maxGapMs);

	// Filter out very short segments
	return merged.filter((span) => span.end - span.start >= minSpeechDurationMs);
}

/**
 * Merge segments that are separated by less than `maxGapMs`.
 */
export function mergeCloseSegments(segments: TimeSpan[], maxGapMs: number): TimeSpan[] {
	if (segments.length <= 1) return segments;

	const result: TimeSpan[] = [{ ...segments[0] }];

	for (let i = 1; i < segments.length; i++) {
		const last = result[result.length - 1];
		const current = segments[i];

		if (current.start - last.end <= maxGapMs) {
			// Merge
			last.end = Math.max(last.end, current.end);
		} else {
			result.push({ ...current });
		}
	}

	return result;
}
