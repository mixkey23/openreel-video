/**
 * WhisperX Provider — local transcription with word alignment and speaker diarization
 *
 * Integrates with Framesmith's WhisperX transcription service via API proxy.
 * Supports:
 * - Word-level timestamps
 * - Speaker diarization (identify speakers A, B, C)
 * - Silence detection (VAD)
 */

import type {
  AIProvider,
  TranscriptionResponse,
  SilenceBlock,
  ProviderCapabilities,
} from "../../ai/providers/types";
import { ProviderError } from "../../ai/providers/types";

export interface WhisperXConfig {
  /**
   * Base URL of the transcription service
   * Default: http://localhost:8000 (Framesmith API)
   */
  baseUrl?: string;
  /**
   * Whisper model to use: large-v3, large-v3-turbo, medium, small
   * Default: large-v3
   */
  model?: "large-v3" | "large-v3-turbo" | "medium" | "small";
  /**
   * Language code (e.g., 'en', 'es', 'fr')
   */
  language?: string;
  /**
   * Enable Voice Activity Detection (VAD) for silence detection
   */
  enableVad?: boolean;
  /**
   * Minimum silence duration in milliseconds
   */
  minSilenceMs?: number;
  /**
   * VAD threshold (0-1)
   */
  vadThreshold?: number;
  /**
   * Padding to add before/after silence blocks in milliseconds
   */
  paddingMs?: number;
}

export class WhisperXProvider implements AIProvider {
  readonly id = "whisperx";
  readonly name = "WhisperX";
  readonly capabilities: ProviderCapabilities = {
    transcription: true,
    diarization: true,
    silenceDetection: true,
  };

  private baseUrl: string;
  private model: WhisperXConfig["model"];
  private language: string;
  private minSilenceMs: number;
  private paddingMs: number;

  constructor(config?: WhisperXConfig) {
    this.baseUrl = config?.baseUrl || "http://localhost:8000";
    this.model = config?.model || "large-v3";
    this.language = config?.language || "en";
    this.minSilenceMs = config?.minSilenceMs ?? 300;
    this.paddingMs = config?.paddingMs ?? 100;
  }

  /**
   * Transcribe audio file
   * Expects audioFile to be a File or Blob object
   */
  async transcribe(audioFile: File | Blob): Promise<TranscriptionResponse> {
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", String(this.model));
    formData.append("language", this.language);
    formData.append("batch_size", "16");
    formData.append("compute_type", "float16");

    try {

      const res = await fetch(`${this.baseUrl}/api/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new ProviderError(
          "whisperx",
          "HTTP_ERROR",
          `${res.status} ${res.statusText}`,
        );
      }

      const data = (await res.json()) as TranscriptionResponse;
      return data;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        "whisperx",
        "TRANSCRIPTION_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Detect silence blocks in audio
   * Uses VAD from transcription response or standalone analysis
   */
  async detectSilences(
    audioFile: File | Blob,
  ): Promise<SilenceBlock[]> {
    try {
      // First, transcribe to get VAD info
      const transcript = await this.transcribe(audioFile);

      // Extract silence blocks from VAD info if available
      // For now, we'll analyze the gaps between segments
      const silences: SilenceBlock[] = [];

      if (transcript.segments && transcript.segments.length > 0) {
        // Look for gaps between segments
        for (let i = 0; i < transcript.segments.length - 1; i++) {
          const current = transcript.segments[i];
          const next = transcript.segments[i + 1];
          const gapStart = current.end;
          const gapEnd = next.start;
          const gapDuration = (gapEnd - gapStart) * 1000; // Convert to ms

          if (gapDuration >= this.minSilenceMs) {
            silences.push({
              start: gapStart - (this.paddingMs / 1000),
              end: gapEnd + (this.paddingMs / 1000),
              duration: gapDuration,
            });
          }
        }
      }

      return silences;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        "whisperx",
        "SILENCE_DETECTION_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Remove silence from audio (generates cutting points)
   * Returns array of segments to keep
   */
  async removeSilences(
    audioFile: File | Blob,
  ): Promise<Array<{ start: number; end: number }>> {
    const silences = await this.detectSilences(audioFile);
    const transcript = await this.transcribe(audioFile);

    const segments: Array<{ start: number; end: number }> = [];
    const totalDuration = transcript.duration;

    let currentStart = 0;

    for (const silence of silences) {
      if (currentStart < silence.start) {
        segments.push({
          start: currentStart,
          end: silence.start,
        });
      }
      currentStart = silence.end;
    }

    // Add final segment
    if (currentStart < totalDuration) {
      segments.push({
        start: currentStart,
        end: totalDuration,
      });
    }

    return segments;
  }

  /**
   * Extract speaker timeline — groups speech by speaker
   */
  async getSpeakerTimeline(
    audioFile: File | Blob,
  ): Promise<
    Array<{
      speaker: string;
      start: number;
      end: number;
      text: string;
      confidence?: number;
    }>
  > {
    const transcript = await this.transcribe(audioFile);

    if (!transcript.speaker_diarization || transcript.speaker_diarization.length === 0) {
      // Fallback: group by segments
      return (
        transcript.segments?.map((seg) => ({
          speaker: "Speaker",
          start: seg.start,
          end: seg.end,
          text: seg.text,
          confidence: seg.noSpeechProb ? 1 - seg.noSpeechProb : undefined,
        })) || []
      );
    }

    return transcript.speaker_diarization.map((diar) => ({
      speaker: diar.speaker,
      start: diar.start,
      end: diar.end,
      text: diar.text,
    }));
  }

  /**
   * Get unique speakers in transcript
   */
  async getSpeakers(audioFile: File | Blob): Promise<string[]> {
    const timeline = await this.getSpeakerTimeline(audioFile);
    const speakers = new Set(timeline.map((t) => t.speaker));
    return Array.from(speakers).sort();
  }

  /**
   * Get speech segments for a specific speaker
   */
  async getSpeakerSegments(
    audioFile: File | Blob,
    speaker: string,
  ): Promise<Array<{ start: number; end: number; text: string }>> {
    const timeline = await this.getSpeakerTimeline(audioFile);
    return timeline
      .filter((t) => t.speaker === speaker)
      .map((t) => ({
        start: t.start,
        end: t.end,
        text: t.text,
      }));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WhisperXConfig>): void {
    if (config.baseUrl !== undefined) this.baseUrl = config.baseUrl;
    if (config.model !== undefined) this.model = config.model;
    if (config.language !== undefined) this.language = config.language;
    if (config.minSilenceMs !== undefined)
      this.minSilenceMs = config.minSilenceMs;
    if (config.paddingMs !== undefined) this.paddingMs = config.paddingMs;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
