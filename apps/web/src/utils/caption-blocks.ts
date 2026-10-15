/**
 * Caption block building shared by the WhisperX (word-level) and the in-browser Whisper
 * (segment-level) engines. Ported from the fork's captions-track.ts (groupWordsToSubtitles)
 * and extended with a configurable words-per-block limit and a segment splitter.
 */
import type { SubtitleWord } from "@openreel/core";

export interface SubtitleBlock {
  text: string;
  startTime: number;
  endTime: number;
  words: SubtitleWord[];
  /** Clip the audio came from (set by the pipeline; used to link text clips to their source). */
  sourceClipId?: string;
}

export interface TimedWordInput {
  word: string;
  start: number;
  end: number;
}

/** Extend each block by `holdSeconds` (reading time) without overlapping the next block or shortening any block. */
export function applyReadingHold(blocks: SubtitleBlock[], holdSeconds: number): SubtitleBlock[] {
  if (holdSeconds <= 0) return blocks;
  return blocks.map((block, index) => {
    const desired = block.endTime + holdSeconds;
    const maxEnd = index + 1 < blocks.length ? blocks[index + 1].startTime - 0.01 : desired;
    return { ...block, endTime: Math.max(block.endTime, Math.min(desired, maxEnd)) };
  });
}

/**
 * Group word timings (already in timeline seconds + `offset`) into blocks of at most
 * `maxWords` words / 5 s. Defaults match the fork (10 words, 5 s).
 */
export function groupWordsToSubtitles(
  words: TimedWordInput[],
  offset: number,
  holdSeconds = 0,
  maxWords = 10,
): SubtitleBlock[] {
  if (!words?.length) return [];
  const limit = Math.max(1, Math.floor(maxWords));
  const blocks: SubtitleBlock[] = [];
  let chunk: TimedWordInput[] = [];
  const flush = () => {
    if (!chunk.length) return;
    blocks.push({
      text: chunk.map((w) => w.word).join(" ").trim(),
      startTime: offset + chunk[0].start,
      endTime: offset + chunk[chunk.length - 1].end,
      words: chunk.map((w) => ({
        text: w.word,
        startTime: offset + w.start,
        endTime: offset + w.end,
      })),
    });
    chunk = [];
  };
  for (const w of words) {
    if (chunk.length >= limit || (chunk.length > 0 && w.end - chunk[0].start > 5)) flush();
    chunk.push(w);
  }
  flush();
  return applyReadingHold(blocks, holdSeconds);
}

/** Spread a text over [start, end] proportionally to word count (no real word timing available). */
export function synthesizeWords(text: string, start: number, end: number): SubtitleWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const safeEnd = Math.max(start + 0.1, end);
  const step = (safeEnd - start) / tokens.length;
  return tokens.map((token, i) => ({
    text: token,
    startTime: start + step * i,
    endTime: start + step * (i + 1),
  }));
}

/** Split a segment-level result (browser Whisper) into blocks of at most `maxWords`, with synthesized word timing. */
export function segmentToBlocks(
  text: string,
  start: number,
  end: number,
  maxWords: number,
): SubtitleBlock[] {
  const words = synthesizeWords(text, start, end);
  if (words.length === 0) return [];
  const limit = Math.max(1, Math.floor(maxWords));
  const blocks: SubtitleBlock[] = [];
  for (let i = 0; i < words.length; i += limit) {
    const slice = words.slice(i, i + limit);
    blocks.push({
      text: slice.map((w) => w.text).join(" "),
      startTime: slice[0].startTime,
      endTime: slice[slice.length - 1].endTime,
      words: slice,
    });
  }
  return blocks;
}
