/**
 * Orchestration of auto-captions, independent of React and of the engine:
 *   jobs (from caption-sources) → decode+trim audio → engine → timeline-time blocks.
 * Both engines (local server with word timings, in-browser Whisper with segment timings) plug in
 * through `transcribe`.
 */
import type { CaptionJob } from "../utils/caption-sources";
import { sourceOffsetToTimeline } from "../utils/caption-sources";
import {
  applyReadingHold,
  groupWordsToSubtitles,
  segmentToBlocks,
  type SubtitleBlock,
} from "../utils/caption-blocks";

export interface EngineOutput {
  text?: string;
  /** Word timings, seconds from the start of the audio that was transcribed. */
  words?: Array<{ word: string; start: number; end: number }>;
  /** Segment timings, same reference as words. */
  segments?: Array<{ text: string; start: number; end: number }>;
}

export interface TranscribeJobsDeps {
  /** Decode the job's media and return 16 kHz mono samples for [sourceStart, sourceEnd]. */
  loadSamples: (job: CaptionJob) => Promise<Float32Array>;
  transcribe: (samples: Float32Array, job: CaptionJob) => Promise<EngineOutput>;
  onProgress?: (info: { index: number; total: number; job: CaptionJob }) => void;
  signal?: AbortSignal;
}

export interface BuildOptions {
  holdSeconds: number;
  maxWordsPerBlock: number;
}

export interface TranscribeJobsResult {
  blocks: SubtitleBlock[];
  /** Jobs that produced no caption, with the reason. */
  skipped: Array<{ job: CaptionJob; reason: string }>;
}

export function outputToBlocks(job: CaptionJob, output: EngineOutput, maxWords: number): SubtitleBlock[] {
  const toTimeline = (offset: number) => sourceOffsetToTimeline(job, offset);

  if (output.words && output.words.length > 0) {
    const mapped = output.words.map((w) => ({
      word: w.word,
      start: toTimeline(w.start),
      end: Math.max(toTimeline(w.start), toTimeline(w.end)),
    }));
    return groupWordsToSubtitles(mapped, 0, 0, maxWords);
  }

  if (output.segments && output.segments.length > 0) {
    return output.segments.flatMap((segment) =>
      segmentToBlocks(
        segment.text,
        toTimeline(segment.start),
        Math.max(toTimeline(segment.start) + 0.1, toTimeline(segment.end)),
        maxWords,
      ),
    );
  }

  const text = output.text?.trim();
  if (text) return segmentToBlocks(text, job.timelineStart, job.timelineEnd, maxWords);
  return [];
}

export async function transcribeJobs(
  jobs: CaptionJob[],
  deps: TranscribeJobsDeps,
  build: BuildOptions,
): Promise<TranscribeJobsResult> {
  const all: SubtitleBlock[] = [];
  const skipped: TranscribeJobsResult["skipped"] = [];

  for (let index = 0; index < jobs.length; index += 1) {
    if (deps.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const job = jobs[index];
    deps.onProgress?.({ index, total: jobs.length, job });

    const samples = await deps.loadSamples(job);
    if (samples.length === 0) {
      skipped.push({ job, reason: "No audio in the selected span" });
      continue;
    }
    const output = await deps.transcribe(samples, job);
    const blocks = outputToBlocks(job, output, build.maxWordsPerBlock);
    if (blocks.length === 0) {
      skipped.push({ job, reason: "No speech detected" });
      continue;
    }
    all.push(...blocks.map((block) => ({ ...block, sourceClipId: job.clipId })));
  }

  all.sort((a, b) => a.startTime - b.startTime);
  return { blocks: applyReadingHold(all, build.holdSeconds), skipped };
}
