import { describe, it, expect } from "vitest";
import { applyReadingHold, groupWordsToSubtitles, segmentToBlocks, synthesizeWords } from "./caption-blocks";

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe("groupWordsToSubtitles", () => {
  it("groups by max words and keeps real word timings", () => {
    const words = Array.from({ length: 7 }, (_, i) => w(`w${i}`, i * 0.5, i * 0.5 + 0.4));
    const blocks = groupWordsToSubtitles(words, 0, 0, 3);
    expect(blocks.map((b) => b.text)).toEqual(["w0 w1 w2", "w3 w4 w5", "w6"]);
    expect(blocks[1].words[0]).toEqual({ text: "w3", startTime: 1.5, endTime: 1.9 });
    expect(blocks[0].endTime).toBe(1.4);
  });

  it("starts a new block after 5 s of speech and defaults to the fork's 10 words", () => {
    const slow = groupWordsToSubtitles([w("a", 0, 1), w("b", 2, 3), w("c", 5.5, 6)], 0);
    expect(slow.map((b) => b.text)).toEqual(["a b", "c"]);
    const many = groupWordsToSubtitles(Array.from({ length: 12 }, (_, i) => w(`x${i}`, i * 0.1, i * 0.1 + 0.05)), 0);
    expect(many).toHaveLength(2);
    expect(many[0].words).toHaveLength(10);
  });

  it("applies the offset", () => {
    expect(groupWordsToSubtitles([w("a", 1, 2)], 10)[0]).toMatchObject({ startTime: 11, endTime: 12 });
  });

  it("returns [] for no words", () => {
    expect(groupWordsToSubtitles([], 0)).toEqual([]);
  });
});

describe("applyReadingHold", () => {
  const blocks = [
    { text: "a", startTime: 0, endTime: 1, words: [] },
    { text: "b", startTime: 1.2, endTime: 2, words: [] },
    { text: "c", startTime: 5, endTime: 6, words: [] },
  ];
  it("extends each block but never into the next one, and never shortens", () => {
    const out = applyReadingHold(blocks, 0.5);
    expect(out[0].endTime).toBeCloseTo(1.19, 5); // capped just before "b"
    expect(out[1].endTime).toBe(2.5);
    expect(out[2].endTime).toBe(6.5);
  });
  it("is a no-op for 0", () => {
    expect(applyReadingHold(blocks, 0)).toBe(blocks);
  });
});

describe("segment fallbacks (browser Whisper)", () => {
  it("spreads words proportionally", () => {
    const words = synthesizeWords("one two three four", 10, 14);
    expect(words.map((x) => [x.text, x.startTime, x.endTime])).toEqual([["one", 10, 11], ["two", 11, 12], ["three", 12, 13], ["four", 13, 14]]);
  });
  it("splits a long segment into single-line blocks", () => {
    const blocks = segmentToBlocks("one two three four five six seven", 10, 17, 5);
    expect(blocks.map((b) => b.text)).toEqual(["one two three four five", "six seven"]);
    expect(blocks[1].startTime).toBe(15);
    expect(blocks[1].endTime).toBe(17);
  });
  it("empty text → no blocks", () => {
    expect(segmentToBlocks("   ", 0, 1, 5)).toEqual([]);
  });
});
