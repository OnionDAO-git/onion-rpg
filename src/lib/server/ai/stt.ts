/**
 * Pluggable speech-to-text interface for voice challenges (1.1, 2.3, 3.3).
 *
 * Voice audio cannot fit ESP-NOW frames, so the BEACON uploads the captured
 * audio blob to the server out-of-band (HTTPS) and passes a handle/ref in the
 * VOICE_CAPTURE_SUBMIT message; the server resolves the blob and runs STT here.
 *
 * The provider is env-driven (STT_PROVIDER) so it isn't hard-wired to any one
 * vendor. Default 'whisper-http' targets an OpenAI-Whisper-compatible endpoint;
 * 'mock' returns a fixed transcript for tests.
 *
 * matchSequence() scores spoken input against an expected ordered sequence for
 * voice challenges (1.1, 2.3, 3.3) with fuzzy/comprehension tolerance.
 */
import { env } from '$env/dynamic/private';

// ── Core types ────────────────────────────────────────────────────────────

export interface SttResult {
	transcript: string;
	/** 0..1 provider confidence, if available. */
	confidence?: number;
	language?: string;
}

export interface SttProvider {
	readonly name: string;
	/** Transcribe raw audio bytes (wav/pcm/ogg/etc.). */
	transcribe(audio: Uint8Array, opts?: { language?: string }): Promise<SttResult>;
}

// ── WhisperHttpProvider ───────────────────────────────────────────────────

/**
 * Whisper-compatible HTTP provider (default). Sends a multipart/form-data
 * POST to the endpoint in STT_ENDPOINT with Bearer STT_API_KEY auth.
 *
 * Compatible with:
 *   - OpenAI Whisper API (https://api.openai.com/v1/audio/transcriptions)
 *   - faster-whisper-server / whisper.cpp server / any Whisper-compat endpoint
 *
 * The response is expected to be JSON with at least { text: string }.
 */
class WhisperHttpProvider implements SttProvider {
	readonly name = 'whisper-http';

	async transcribe(audio: Uint8Array, opts?: { language?: string }): Promise<SttResult> {
		const endpoint = env.STT_ENDPOINT;
		if (!endpoint) {
			throw new Error('STT_ENDPOINT env var is required for whisper-http provider');
		}

		const formData = new FormData();
		// Cast to Uint8Array<ArrayBuffer> — safe because audio comes from
		// FormData or fetch ArrayBuffer, never from a SharedArrayBuffer.
		const blob = new Blob([audio as Uint8Array<ArrayBuffer>], { type: 'audio/wav' });
		formData.append('file', blob, 'audio.wav');
		formData.append('model', env.STT_MODEL || 'whisper-1');
		if (opts?.language) {
			formData.append('language', opts.language);
		}
		formData.append('response_format', 'json');

		const headers: Record<string, string> = {};
		if (env.STT_API_KEY) {
			headers['Authorization'] = `Bearer ${env.STT_API_KEY}`;
		}

		const res = await fetch(endpoint, {
			method: 'POST',
			headers,
			body: formData
		});

		if (!res.ok) {
			const errText = await res.text().catch(() => '');
			throw new Error(`STT provider returned ${res.status}: ${errText}`);
		}

		const json = (await res.json()) as { text?: string; confidence?: number; language?: string };

		return {
			transcript: json.text ?? '',
			confidence: json.confidence,
			language: json.language
		};
	}
}

// ── MockProvider ──────────────────────────────────────────────────────────

/**
 * Deterministic mock for tests / hardware-free dev.
 * STT_MOCK_TRANSCRIPT env var overrides the empty default so tests can
 * inject specific transcripts without a real audio pipeline.
 */
class MockProvider implements SttProvider {
	readonly name = 'mock';

	async transcribe(): Promise<SttResult> {
		return {
			transcript: env.STT_MOCK_TRANSCRIPT || '',
			confidence: 1,
			language: 'en'
		};
	}
}

// ── Provider registry ─────────────────────────────────────────────────────

/** Resolve the configured provider. */
export function getSttProvider(): SttProvider {
	switch (env.STT_PROVIDER || 'whisper-http') {
		case 'mock':
			return new MockProvider();
		case 'whisper-http':
		default:
			return new WhisperHttpProvider();
	}
}

// ── Text normalization ────────────────────────────────────────────────────

/**
 * Normalize a transcript for fuzzy comparison: lowercase, strip punctuation,
 * collapse whitespace.
 */
export function normalizeTranscript(t: string): string {
	return t
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// ── Sequence matching ─────────────────────────────────────────────────────

/**
 * One step in an expected voice sequence for challenges 1.1, 2.3, 3.3.
 * Each step has a canonical keyword and optional accepted aliases/paraphrases.
 */
export interface SequenceStep {
	/** Primary keyword (normalized). */
	keyword: string;
	/** Additional accepted phrasings (normalized). */
	aliases?: string[];
	/** Human-readable label for error messages. */
	label?: string;
}

/**
 * Result of matching a spoken transcript against an expected sequence.
 */
export interface SequenceMatchResult {
	/** True if all steps were found in order with acceptable coverage. */
	passed: boolean;
	/**
	 * Steps matched (0..steps.length). A partial match still fails overall
	 * but tells the engine how far the player got.
	 */
	matchedCount: number;
	/** Total steps required. */
	totalCount: number;
	/** 0..1 score (matchedCount / totalCount). */
	score: number;
	/** Index of first missing step, or -1 if all matched. */
	firstMissingIndex: number;
	/** Player-friendly description of what was missing. */
	missingLabel?: string;
}

/**
 * Score a spoken transcript against an expected ordered sequence.
 *
 * Strategy:
 *   1. Normalize both transcript and each step keyword/alias.
 *   2. Scan the transcript left-to-right for each step keyword/alias
 *      (in order). A later step's keyword must appear AFTER the position
 *      where the previous step was found (loose ordering).
 *   3. A step is matched if its keyword OR any alias appears as a substring
 *      of the normalized transcript in the correct relative position.
 *   4. If matchedCount / totalCount >= threshold (default 0.8), passed = true.
 *      This allows one step to be missed or garbled for multi-step sequences.
 *
 * COMPREHENSION NOTE: the challenge's validate() should also call the
 * Storyteller for final judgment on borderline cases where keyword presence
 * alone isn't enough (e.g. challenge 1.3 which is NPC / free-form).
 * This helper is for the deterministic voice-sequence challenges (1.1, 2.3, 3.3).
 */
export function matchSequence(
	transcript: string,
	steps: SequenceStep[],
	opts?: {
		/** Minimum proportion matched to pass (default 0.8). */
		threshold?: number;
		/** If true, require ALL steps to match (threshold = 1). */
		strict?: boolean;
	}
): SequenceMatchResult {
	const threshold = opts?.strict ? 1.0 : (opts?.threshold ?? 0.8);
	const norm = normalizeTranscript(transcript);
	const total = steps.length;

	if (total === 0) {
		return { passed: true, matchedCount: 0, totalCount: 0, score: 1, firstMissingIndex: -1 };
	}

	let cursor = 0; // position in norm string to search from
	let matchedCount = 0;
	let firstMissingIndex = -1;
	let missingLabel: string | undefined;

	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		const candidates = [step.keyword, ...(step.aliases ?? [])].map(normalizeTranscript);

		// Find the earliest match for any candidate starting at `cursor`
		let bestPos = -1;
		for (const c of candidates) {
			if (!c) continue;
			const pos = norm.indexOf(c, cursor);
			if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
				bestPos = pos;
			}
		}

		if (bestPos !== -1) {
			// Found: advance cursor past this match
			cursor = bestPos + candidates.find((c) => norm.indexOf(c, cursor) === bestPos)!.length;
			matchedCount++;
		} else {
			// Not found in correct order
			if (firstMissingIndex === -1) {
				firstMissingIndex = i;
				missingLabel = step.label ?? step.keyword;
			}
		}
	}

	const score = matchedCount / total;
	return {
		passed: score >= threshold,
		matchedCount,
		totalCount: total,
		score,
		firstMissingIndex: matchedCount === total ? -1 : firstMissingIndex,
		missingLabel: matchedCount === total ? undefined : missingLabel
	};
}

// ── Voice blob store ───────────────────────────────────────────────────────

/**
 * Temporary in-memory store for voice audio blobs uploaded out-of-band by
 * the beacon. The beacon uploads an audio blob, receives a `ref` UUID, and
 * passes that ref in the VOICE_CAPTURE_SUBMIT ESP-NOW message.
 *
 * For production, replace with an object-store-backed implementation
 * (e.g. S3/Railway Volumes) — the interface is stable.
 *
 * Blobs expire after TTL_MS to prevent unbounded growth.
 */
const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface BlobEntry {
	audio: Uint8Array;
	contentType: string;
	expiresAt: number;
}

const blobStore = new Map<string, BlobEntry>();

/** Store a voice audio blob and return its ref. */
export function storeBlobRef(ref: string, audio: Uint8Array, contentType = 'audio/wav'): void {
	blobStore.set(ref, { audio, contentType, expiresAt: Date.now() + TTL_MS });
	// Opportunistic cleanup of expired entries
	for (const [k, v] of blobStore) {
		if (v.expiresAt < Date.now()) blobStore.delete(k);
	}
}

/** Retrieve and consume a voice blob by ref. Returns null if not found/expired. */
export function consumeBlobRef(ref: string): Uint8Array | null {
	const entry = blobStore.get(ref);
	if (!entry || entry.expiresAt < Date.now()) {
		blobStore.delete(ref);
		return null;
	}
	blobStore.delete(ref); // single-use
	return entry.audio;
}
