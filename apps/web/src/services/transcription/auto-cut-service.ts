/**
 * Auto Cut Service — generates jump cuts from audio analysis
 *
 * Uses WhisperX to detect:
 * - Silence blocks (for jump cuts)
 * - Speaker changes (natural cut points)
 * - Speech blocks (segments to keep)
 *
 * Generates a "cut timeline" with cut points and labels
 */

import { WhisperXProvider } from "./providers/WhisperXProvider";
import type { SilenceBlock } from "../ai/providers/types";

export interface CutPoint {
  readonly time: number;
  readonly type: "silence" | "speaker-change" | "manual";
  readonly label: string;
  readonly reason?: string;
}

export interface AutoCutResult {
  readonly cutPoints: CutPoint[];
  readonly segments: Array<{
    start: number;
    end: number;
    duration: number;
    speaker?: string;
    isSilence: boolean;
  }>;
  readonly totalDuration: number;
  readonly estimatedReduction: number;
}

export class AutoCutService {
  private whisperx: WhisperXProvider;

  constructor(whisperxConfig?: { baseUrl?: string; model?: "large-v3" | "large-v3-turbo" | "medium" | "small" }) {
    this.whisperx = new WhisperXProvider(whisperxConfig);
  }

  /**
   * Analyze audio and generate auto-cut points
   * Combines silence detection + speaker changes for natural jump cuts
   */
  async generateCuts(audioFile: File | Blob): Promise<AutoCutResult> {
    // Get silence blocks and speaker timeline in parallel
    const [silences, transcript, timeline] = await Promise.all([
      this.whisperx.detectSilences(audioFile),
      this.whisperx.transcribe(audioFile),
      this.whisperx.getSpeakerTimeline(audioFile),
    ]);

    const cutPoints: CutPoint[] = [];
    const totalDuration = transcript.duration;

    // Add silence-based cut points
    for (const silence of silences) {
      cutPoints.push({
        time: silence.start + (silence.duration / 1000) * 0.5, // Cut at middle of silence
        type: "silence",
        label: `Silence cut @ ${this.formatTime(silence.start)}`,
        reason: `${Math.round(silence.duration)}ms silence`,
      });
    }

    // Add speaker-change cut points (if we have diarization)
    if (timeline && timeline.length > 1) {
      for (let i = 0; i < timeline.length - 1; i++) {
        const current = timeline[i];
        const next = timeline[i + 1];

        // If speaker changes and they're not already within a silence block
        if (current.speaker !== next.speaker) {
          const changeTime = Math.max(current.end, next.start - 0.1);
          const existingCut = cutPoints.find(
            (cp) => Math.abs(cp.time - changeTime) < 0.2,
          );

          if (!existingCut) {
            cutPoints.push({
              time: changeTime,
              type: "speaker-change",
              label: `${current.speaker} → ${next.speaker} @ ${this.formatTime(changeTime)}`,
              reason: `Speaker change: ${current.speaker} → ${next.speaker}`,
            });
          }
        }
      }
    }

    // Sort by time
    cutPoints.sort((a, b) => a.time - b.time);

    // Generate segments (content between cut points)
    const segments = this.generateSegments(cutPoints, timeline, silences, totalDuration);

    // Calculate time saved
    const silencedTime = silences.reduce((sum, s) => sum + s.duration, 0) / 1000;
    const estimatedReduction = (silencedTime / totalDuration) * 100;

    return {
      cutPoints,
      segments,
      totalDuration,
      estimatedReduction,
    };
  }

  /**
   * Generate segments based on cut points and speaker timeline
   */
  private generateSegments(
    cutPoints: CutPoint[],
    timeline: Array<{ speaker: string; start: number; end: number }>,
    silences: SilenceBlock[],
    totalDuration: number,
  ): AutoCutResult["segments"] {
    const segments: AutoCutResult["segments"] = [];

    // Build a set of silence time ranges for quick lookup
    const silenceRanges = silences.map((s) => ({
      start: s.start,
      end: s.end,
    }));

    const isSilenceBlock = (start: number, end: number): boolean => {
      return silenceRanges.some(
        (s) => start >= s.start - 0.1 && end <= s.end + 0.1,
      );
    };

    // Add segment from start to first cut
    if (cutPoints.length === 0) {
      return [
        {
          start: 0,
          end: totalDuration,
          duration: totalDuration,
          isSilence: false,
        },
      ];
    }

    let currentStart = 0;

    for (const cut of cutPoints) {
      if (currentStart < cut.time) {
        const speaker = this.getSpeakerAtTime(timeline, currentStart);
        segments.push({
          start: currentStart,
          end: cut.time,
          duration: cut.time - currentStart,
          speaker,
          isSilence: isSilenceBlock(currentStart, cut.time),
        });
      }
      currentStart = cut.time;
    }

    // Add final segment
    if (currentStart < totalDuration) {
      const speaker = this.getSpeakerAtTime(timeline, currentStart);
      segments.push({
        start: currentStart,
        end: totalDuration,
        duration: totalDuration - currentStart,
        speaker,
        isSilence: isSilenceBlock(currentStart, totalDuration),
      });
    }

    return segments;
  }

  /**
   * Get the speaker active at a given time
   */
  private getSpeakerAtTime(
    timeline: Array<{ speaker: string; start: number; end: number }>,
    time: number,
  ): string | undefined {
    const segment = timeline.find((t) => time >= t.start && time <= t.end);
    return segment?.speaker;
  }

  /**
   * Format time (seconds) to HH:MM:SS.mmm
   */
  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const ms = Math.round((s - Math.floor(s)) * 1000);

    const pad = (n: number, width: number = 2) => String(n).padStart(width, "0");

    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(Math.floor(s))}.${pad(ms, 3)}`;
    }
    return `${pad(m)}:${pad(Math.floor(s))}.${pad(ms, 3)}`;
  }

  /**
   * Filter cuts by minimum segment duration
   * Removes cuts that would create very short segments
   */
  filterCutsByMinDuration(result: AutoCutResult, minDuration: number): AutoCutResult {
    const filtered = result.segments.filter((seg) => seg.duration >= minDuration);

    const newCutPoints = result.cutPoints.filter((cut) => {
      const segmentBefore = result.segments.find(
        (seg) => seg.end === cut.time,
      );
      const segmentAfter = result.segments.find(
        (seg) => seg.start === cut.time,
      );

      return (
        (!segmentBefore || segmentBefore.duration >= minDuration) &&
        (!segmentAfter || segmentAfter.duration >= minDuration)
      );
    });

    return {
      ...result,
      cutPoints: newCutPoints,
      segments: filtered,
    };
  }

  /**
   * Keep only silence-based cuts (remove speaker changes)
   */
  onlySilenceCuts(result: AutoCutResult): AutoCutResult {
    const silenceCuts = result.cutPoints.filter((cp) => cp.type === "silence");

    return {
      ...result,
      cutPoints: silenceCuts,
      segments: result.segments.filter((seg) => !seg.isSilence),
    };
  }
}
