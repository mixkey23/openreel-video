import { describe, it, expect } from "vitest";
import type { Clip, MediaItem, Project, Track } from "@openreel/core";
import {
  collectCaptionJobs,
  listTracksWithMedia,
  sourceOffsetToTimeline,
  type CaptionScope,
} from "./caption-sources";

const media = (id: string, type: "audio" | "video", name = id): MediaItem =>
  ({ id, name, type, blob: null, metadata: { duration: 60 } }) as unknown as MediaItem;
const clip = (id: string, mediaId: string, trackId: string, start: number, duration: number, extra: Partial<Clip> = {}): Clip =>
  ({ id, mediaId, trackId, startTime: start, duration, inPoint: 0, outPoint: duration, effects: [], audioEffects: [], volume: 1, keyframes: [], ...extra }) as unknown as Clip;
const track = (id: string, type: Track["type"], clips: Clip[], extra: Partial<Track> = {}): Track =>
  ({ id, type, name: id, clips, transitions: [], locked: false, hidden: false, muted: false, solo: false, ...extra }) as unknown as Track;

function project(tracks: Track[], items: MediaItem[]): Pick<Project, "timeline" | "mediaLibrary"> {
  return { timeline: { tracks, subtitles: [], duration: 100, markers: [] }, mediaLibrary: { items } } as never;
}

describe("collectCaptionJobs — trimming (the case the old timeline mode got wrong)", () => {
  it("a trimmed audio clip is transcribed only from inPoint, and offsets map back to the timeline", () => {
    // 60 s file; timeline uses source 10–20 s, placed at 5 s.
    const p = project([track("ta", "audio", [clip("a1", "m_a", "ta", 5, 10, { inPoint: 10, outPoint: 20 })])], [media("m_a", "audio")]);
    const [job] = collectCaptionJobs(p, { kind: "clip", clipId: "a1", source: "own", trackId: "all" });
    expect(job.sourceStart).toBe(10);
    expect(job.sourceEnd).toBe(20);
    expect(job.timelineStart).toBe(5);
    expect(job.timelineEnd).toBe(15);
    // A word said 2 s into the decoded span lands at 5 + 2 = 7 s on the timeline (not 5 + 12).
    expect(sourceOffsetToTimeline(job, 2)).toBe(7);
  });

  it("respects playback speed (2x: 10 source seconds fill 5 timeline seconds)", () => {
    const p = project([track("ta", "audio", [clip("a1", "m_a", "ta", 0, 5, { inPoint: 0, speed: 2 })])], [media("m_a", "audio")]);
    const [job] = collectCaptionJobs(p, { kind: "clip", clipId: "a1", source: "own", trackId: "all" });
    expect(job.sourceEnd - job.sourceStart).toBe(10);
    expect(sourceOffsetToTimeline(job, 4)).toBe(2);
  });

  it("never maps beyond the clip end", () => {
    const p = project([track("ta", "audio", [clip("a1", "m_a", "ta", 0, 3)])], [media("m_a", "audio")]);
    const [job] = collectCaptionJobs(p, { kind: "clip", clipId: "a1", source: "own", trackId: "all" });
    expect(sourceOffsetToTimeline(job, 99)).toBe(3);
  });
});

describe("collectCaptionJobs — scopes", () => {
  const items = [media("v1", "video", "scene.mp4"), media("a1", "audio", "beat1.wav"), media("a2", "audio", "beat2.wav")];
  const base = () => project([
    track("tv", "video", [clip("cv", "v1", "tv", 10, 20)]),
    track("ta", "audio", [clip("ca1", "a1", "ta", 0, 15), clip("ca2", "a2", "ta", 25, 20)]),
    track("tb", "audio", [clip("cb", "a1", "tb", 12, 4)], { muted: true }),
  ], items);

  it("video clip, own audio → just that clip", () => {
    const jobs = collectCaptionJobs(base(), { kind: "clip", clipId: "cv", source: "own", trackId: "all" });
    expect(jobs.map((j) => j.clipId)).toEqual(["cv"]);
  });

  it("video clip, audio tracks → audio clips under it, trimmed to the video clip's span, muted tracks skipped", () => {
    const jobs = collectCaptionJobs(base(), { kind: "clip", clipId: "cv", source: "audio-tracks", trackId: "all" });
    expect(jobs.map((j) => [j.clipId, j.timelineStart, j.timelineEnd])).toEqual([
      ["ca1", 10, 15], // clip 0–15 cut to 10–15
      ["ca2", 25, 30], // clip 25–45 cut to 25–30
    ]);
    expect(jobs[0].sourceStart).toBe(10); // 10 s into beat1.wav, not 0
  });

  it("video clip, one specific audio track", () => {
    const jobs = collectCaptionJobs(base(), { kind: "clip", clipId: "cv", source: "audio-tracks", trackId: "tb" });
    expect(jobs).toEqual([]); // that track is muted
  });

  it("range + audio tracks, with a range that cuts a clip", () => {
    const scope: CaptionScope = { kind: "range", start: 12, end: 28, source: "audio-tracks", trackId: "all" };
    const jobs = collectCaptionJobs(base(), scope);
    expect(jobs.map((j) => [j.clipId, j.timelineStart, j.timelineEnd, j.sourceStart])).toEqual([
      ["ca1", 12, 15, 12],
      ["ca2", 25, 28, 0],
    ]);
  });

  it("range + video tracks extracts from video clips only", () => {
    const jobs = collectCaptionJobs(base(), { kind: "range", start: 0, end: 0, source: "video-tracks", trackId: "all" });
    expect(jobs.map((j) => j.clipId)).toEqual(["cv"]); // end <= start means "whole timeline"
  });

  it("ignores overlaps shorter than 50 ms", () => {
    const jobs = collectCaptionJobs(base(), { kind: "range", start: 14.97, end: 25.02, source: "audio-tracks", trackId: "all" });
    expect(jobs).toEqual([]);
  });

  it("classifies by media type, so 'standard' tracks (any kind of clip) work", () => {
    const p = project([track("t1", "video", [clip("x", "a1", "t1", 0, 5), clip("y", "v1", "t1", 6, 5)])], items);
    expect(collectCaptionJobs(p, { kind: "range", start: 0, end: 20, source: "audio-tracks", trackId: "all" }).map((j) => j.clipId)).toEqual(["x"]);
    expect(collectCaptionJobs(p, { kind: "range", start: 0, end: 20, source: "video-tracks", trackId: "all" }).map((j) => j.clipId)).toEqual(["y"]);
  });

  it("unknown clip or non-audio/video media yields nothing", () => {
    expect(collectCaptionJobs(base(), { kind: "clip", clipId: "nope", source: "own", trackId: "all" })).toEqual([]);
  });

  it("lists only tracks that contain the requested media type", () => {
    expect(listTracksWithMedia(base(), "audio").map((t) => t.id)).toEqual(["ta", "tb"]);
    expect(listTracksWithMedia(base(), "video").map((t) => t.id)).toEqual(["tv"]);
  });
});
