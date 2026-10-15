/**
 * Client for the local WhisperX/whisper-ctranslate2 server (Framesmith: POST /api/transcribe).
 *
 * Request  (multipart): audio (wav), model, language ("" = auto), target_language ("" = none)
 * Response (json):      { text, word_count, words: [{ word, start, end }] } — times are seconds
 *                       from the START OF THE UPLOADED AUDIO (so the caller must send audio that
 *                       is already trimmed to the clip's in/out points).
 */
import { OPENREEL_TRANSCRIBE_URL } from "../config/api-endpoints";
import { encodeWavPcm16 } from "../utils/wav-encode";
import { WHISPER_SAMPLE_RATE } from "../utils/whisper-audio";
import type { EngineOutput } from "./caption-pipeline";

export interface ServerTranscribeOptions {
  model: string;
  /** "auto" or an ISO code. */
  language: string;
  /** Translate to this language, or null for plain transcription. */
  targetLanguage: string | null;
  signal?: AbortSignal;
  /** Override for tests / self-hosted setups. */
  baseUrl?: string;
}

interface ServerResponse {
  text?: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

export async function transcribeWithServer(
  samples: Float32Array,
  options: ServerTranscribeOptions,
): Promise<EngineOutput> {
  const form = new FormData();
  form.append("audio", encodeWavPcm16(samples, WHISPER_SAMPLE_RATE), "audio.wav");
  form.append("model", options.model);
  form.append("language", options.language === "auto" ? "" : options.language);
  form.append("target_language", options.targetLanguage ?? "");

  const base = (options.baseUrl ?? OPENREEL_TRANSCRIBE_URL).replace(/\/$/, "");
  const response = await fetch(`${base}/transcribe`, {
    method: "POST",
    body: form,
    signal: options.signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: unknown };
    throw new Error(`Transcription failed: ${String(body.detail ?? response.status)}`);
  }
  const data = (await response.json()) as ServerResponse;
  return {
    text: data.text ?? "",
    words: (data.words ?? []).filter((w) => w.word?.trim()),
  };
}
