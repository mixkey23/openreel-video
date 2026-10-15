import { describe, it, expect, vi } from "vitest";
import type { CaptionJob } from "../utils/caption-sources";
import { outputToBlocks, transcribeJobs, type EngineOutput } from "./caption-pipeline";

const job = (over: Partial<CaptionJob> = {}): CaptionJob => ({
  id: "j", clipId: "c", mediaId: "m", mediaName: "m.wav", trackId: "t",
  timelineStart: 5, timelineEnd: 15, sourceStart: 10, sourceEnd: 20, speed: 1, ...over,
});

describe("outputToBlocks", () => {
  it("word timings are relative to the trimmed audio and land on the timeline", () => {
    const out: EngineOutput = { words: [{ word: "hola", start: 0.5, end: 0.9 }, { word: "mundo", start: 1, end: 1.4 }] };
    const [block] = outputToBlocks(job(), out, 5);
    expect(block.text).toBe("hola mundo");
    expect(block.startTime).toBeCloseTo(5.5, 5);
    expect(block.endTime).toBeCloseTo(6.4, 5);
    expect(block.words[1]).toMatchObject({ text: "mundo", startTime: 6, endTime: 6.4 });
  });

  it("scales by playback speed", () => {
    const [block] = outputToBlocks(job({ speed: 2 }), { words: [{ word: "x", start: 4, end: 6 }] }, 5);
    expect(block.startTime).toBe(7);
    expect(block.endTime).toBe(8);
  });

  it("segments (browser engine) are split by max words with synthesized word timing", () => {
    const blocks = outputToBlocks(job(), { segments: [{ text: "a b c d e f", start: 0, end: 6 }] }, 3);
    expect(blocks.map((b) => b.text)).toEqual(["a b c", "d e f"]);
    expect(blocks[1].startTime).toBe(8);
  });

  it("text only: one span over the whole job", () => {
    const blocks = outputToBlocks(job(), { text: "solo texto" }, 5);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startTime).toBe(5);
    expect(blocks[0].endTime).toBe(15);
  });

  it("nothing recognised → no blocks", () => {
    expect(outputToBlocks(job(), { text: "  ", words: [] }, 5)).toEqual([]);
  });
});

describe("transcribeJobs", () => {
  const samples = new Float32Array(160);

  it("runs jobs in order, reports progress, merges blocks sorted and applies hold across jobs", async () => {
    const jobs = [job({ id: "a", timelineStart: 0, timelineEnd: 4 }), job({ id: "b", timelineStart: 4.2, timelineEnd: 8 })];
    const progress: number[] = [];
    const result = await transcribeJobs(
      jobs,
      {
        loadSamples: async () => samples,
        transcribe: async () => ({ words: [{ word: "w", start: 0, end: 1 }] }),
        onProgress: ({ index }) => progress.push(index),
      },
      { holdSeconds: 0.5, maxWordsPerBlock: 5 },
    );
    expect(progress).toEqual([0, 1]);
    expect(result.blocks.map((b) => [b.startTime, b.endTime])).toEqual([[0, 1.5], [4.2, 5.7]]);
  });

  it("skips jobs with no audio or no speech and says why", async () => {
    const jobs = [job({ id: "silent" }), job({ id: "empty" }), job({ id: "ok" })];
    let n = 0;
    const result = await transcribeJobs(
      jobs,
      {
        loadSamples: async (j) => (j.id === "silent" ? new Float32Array() : samples),
        transcribe: async () => (++n === 1 ? { text: "", words: [] } : { words: [{ word: "hi", start: 0, end: 1 }] }),
      },
      { holdSeconds: 0, maxWordsPerBlock: 5 },
    );
    expect(result.blocks).toHaveLength(1);
    expect(result.skipped.map((s) => [s.job.id, s.reason])).toEqual([
      ["silent", "No audio in the selected span"],
      ["empty", "No speech detected"],
    ]);
  });

  it("aborts between jobs", async () => {
    const controller = new AbortController();
    const transcribe = vi.fn(async () => {
      controller.abort();
      return { words: [{ word: "x", start: 0, end: 1 }] };
    });
    await expect(
      transcribeJobs([job({ id: "1" }), job({ id: "2" })], { loadSamples: async () => samples, transcribe, signal: controller.signal }, { holdSeconds: 0, maxWordsPerBlock: 5 }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
});
