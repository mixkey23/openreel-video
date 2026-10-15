import { describe, it, expect } from "vitest";
import type { Clip, Track } from "@openreel/core";
import {
  automationKey, buildMeta, cueIdFromMediaName, cueStart, detectMusicSync, isValidMusic, META_KEY, musicMediaName, planMusicMerge,
  readMusicMeta, sanitizeAutomation, sceneStarts, usableCues, type FramesmithMusic, type FramesmithMusicClip, type Seen,
} from "./framesmith-music";

const cue = (id: string, scene: string, extra: Partial<FramesmithMusicClip> = {}): FramesmithMusicClip => ({
  cue_id: id, scene_id: scene, offset_in_scene_s: 0, duration_s: 10, url: `/assets/ep/music/${id}.wav`, gain: 1,
  fade: { fadeIn: 0, fadeOut: 1 }, automation_volume: [{ time: 0, value: 1 }, { time: 2, value: 0.35 }], status: "ok", ...extra,
});
const music = (version: string, clips: FramesmithMusicClip[]): FramesmithMusic => ({ version, track_name: "Music (Framesmith)", clips });

const clip = (id: string, over: Partial<Clip> = {}): Clip => ({
  id, mediaId: `m-${id}`, trackId: "t", startTime: 0, duration: 10, inPoint: 0, outPoint: 10, effects: [], audioEffects: [],
  transform: { position: { x: 0.5, y: 0.5 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 },
  volume: 1, keyframes: [], ...over,
});
const musicClip = (id: string, c: FramesmithMusicClip, version: string, over: Partial<Clip> = {}, edited = false): Clip => {
  const meta = buildMeta(c, version);
  meta.userEdited = edited;
  return clip(id, {
    duration: c.duration_s, volume: c.gain ?? 1, fade: c.fade, automation: { volume: sanitizeAutomation(c.automation_volume) },
    metadata: { [META_KEY]: meta }, ...over,
  });
};
const track = (clips: Clip[], type: Track["type"] = "audio", name = "Music (Framesmith)"): Track => ({
  id: `trk-${type}`, type, name, clips, transitions: [], locked: false, hidden: false, muted: false, solo: false,
});

describe("helpers", () => {
  it("names media and parses cue ids back", () => {
    expect(musicMediaName("seq_01_scene_001")).toBe("music__seq_01_scene_001.wav");
    expect(cueIdFromMediaName("music__seq_01_scene_001.wav")).toBe("seq_01_scene_001");
    expect(cueIdFromMediaName("scene_001.mp4")).toBeNull();
    expect(cueIdFromMediaName("music__.wav")).toBeNull();
  });

  it("sanitises automation: sorted, finite, clamped to 0..4, one point per time", () => {
    const out = sanitizeAutomation([
      { time: 2, value: 9 }, { time: 0, value: -1 }, { time: 1, value: NaN }, { time: -3, value: 1 }, { time: 2, value: 0.5 },
    ]);
    expect(out).toEqual([{ time: 0, value: 0 }, { time: 2, value: 0.5 }]);
    expect(sanitizeAutomation(undefined)).toEqual([]);
  });

  it("automationKey is insensitive to sub-0.1ms noise but sees real changes", () => {
    expect(automationKey([{ time: 1, value: 0.5 }])).toBe(automationKey([{ time: 1.00001, value: 0.500001 }]));
    expect(automationKey([{ time: 1, value: 0.5 }])).not.toBe(automationKey([{ time: 1, value: 0.6 }]));
  });

  it("validates the payload and keeps only placeable cues", () => {
    expect(isValidMusic(null)).toBe(false);
    expect(isValidMusic({ version: "1", clips: [] })).toBe(false);
    expect(isValidMusic(music("1", []))).toBe(true);
    const m = music("1", [cue("a", "s1"), cue("b", "s1", { url: "" }), cue("c", "s1", { duration_s: 0 }), cue("d", "s1", { status: "error" }), cue("e", "s2")]);
    expect(usableCues(m).map((c) => c.cue_id)).toEqual(["a", "e"]);
  });

  it("positions a cue at scene start + offset, never negative", () => {
    expect(cueStart(13.667, 0)).toBe(13.667);
    expect(cueStart(13.667, 0.25)).toBe(13.917);
    expect(cueStart(0.1, -1)).toBe(0);
  });

  it("finds scene starts from the video track by media name", () => {
    const media = [{ id: "m-v1", name: "scene_001.mp4" }, { id: "m-v2", name: "scene_002.mp4" }, { id: "m-a", name: "music__x.wav" }];
    const v = track([clip("v1", { mediaId: "m-v1", startTime: 0 }), clip("v2", { mediaId: "m-v2", startTime: 13.667 })], "video", "Video");
    const a = track([clip("a", { mediaId: "m-a", startTime: 5 })]);
    const s = sceneStarts([v, a], media);
    expect([...s.entries()]).toEqual([["scene_001", 0], ["scene_002", 13.667]]);
  });
});

describe("planMusicMerge (idempotent merge rules)", () => {
  const A = cue("a", "scene_001"), B = cue("b", "scene_002");

  it("fresh project: adds every cue and creates nothing to remove", () => {
    const p = planMusicMerge(undefined, music("v1", [A, B]));
    expect(p).toEqual({ unchanged: false, removeClipIds: [], add: [A, B], conflicts: [] });
  });

  it("same version and same cues: untouched (preserves the user's edits)", () => {
    const t = track([musicClip("c1", A, "v1"), musicClip("c2", B, "v1", {}, true)]);
    expect(planMusicMerge(t, music("v1", [A, B])).unchanged).toBe(true);
  });

  it("new version: non-edited cues are replaced, edited ones are kept and reported", () => {
    const t = track([musicClip("c1", A, "v1"), musicClip("c2", B, "v1", {}, true)]);
    const p = planMusicMerge(t, music("v2", [A, B]));
    expect(p.unchanged).toBe(false);
    expect(p.removeClipIds).toEqual(["c1"]);
    expect(p.add.map((c) => c.cue_id)).toEqual(["a"]);
    expect(p.conflicts).toEqual([{ cue_id: "b", clipId: "c2", reason: "changed" }]);
  });

  it("a cue dropped from the plan: removed if untouched, conflict 'removed' if the user edited it", () => {
    const t = track([musicClip("c1", A, "v1"), musicClip("c2", B, "v1", {}, true)]);
    const p = planMusicMerge(t, music("v2", []));
    expect(p.removeClipIds).toEqual(["c1"]);
    expect(p.conflicts).toEqual([{ cue_id: "b", clipId: "c2", reason: "removed" }]);
    expect(p.add).toEqual([]);
  });

  it("a new cue appears (same version): the set differs, so the non-edited cues are rebuilt", () => {
    const t = track([musicClip("c1", A, "v1")]);
    const p = planMusicMerge(t, music("v1", [A, B]));
    expect(p.unchanged).toBe(false);
    expect(p.removeClipIds).toEqual(["c1"]);
    expect(p.add.map((c) => c.cue_id)).toEqual(["a", "b"]);
  });

  it("never touches clips on that track that Framesmith did not create", () => {
    const own = musicClip("c1", A, "v1");
    const userClip = clip("u1", { startTime: 3 });                                  // dragged in by the user, no metadata
    const p = planMusicMerge(track([own, userClip]), music("v2", [A]));
    expect(p.removeClipIds).toEqual(["c1"]);
    expect(p.removeClipIds).not.toContain("u1");
  });
});

describe("detectMusicSync (follow the scene, flag user edits)", () => {
  const media = [{ id: "m-v1", name: "scene_001.mp4" }, { id: "m-v2", name: "scene_002.mp4" }];
  const A = cue("a", "scene_001"), B = cue("b", "scene_002", { offset_in_scene_s: 0.5 });
  const videoTrack = (s1: number, s2: number) => track([clip("v1", { mediaId: "m-v1", startTime: s1 }), clip("v2", { mediaId: "m-v2", startTime: s2 })], "video", "Video");
  const musicTrack = (a: Clip, b: Clip) => track([a, b]);
  const start = () => ({
    a: musicClip("ca", A, "v1", { startTime: 0 }),
    b: musicClip("cb", B, "v1", { startTime: 14.167 }),
  });

  it("first look just records positions", () => {
    const { a, b } = start();
    const r = detectMusicSync(new Map(), [videoTrack(0, 13.667), musicTrack(a, b)], media);
    expect(r.moves).toEqual([]);
    expect(r.userEdited).toEqual([]);
    expect(r.seen.get("b")).toEqual({ sceneStart: 13.667, clipStart: 14.167 });
  });

  it("unchanged project: nothing to do", () => {
    const { a, b } = start();
    const t = [videoTrack(0, 13.667), musicTrack(a, b)];
    const first = detectMusicSync(new Map(), t, media);
    const second = detectMusicSync(first.seen, t, media);
    expect(second.moves).toEqual([]);
    expect(second.userEdited).toEqual([]);
  });

  it("a scene moves and its cue did not: the cue follows by the same delta", () => {
    const { a, b } = start();
    const first = detectMusicSync(new Map(), [videoTrack(0, 13.667), musicTrack(a, b)], media);
    const r = detectMusicSync(first.seen, [videoTrack(0, 15.667), musicTrack(a, b)], media);
    expect(r.moves).toEqual([{ clipId: "cb", startTime: 16.167 }]);
    expect(r.userEdited).toEqual([]);
  });

  it("the user moves the cue itself: flagged userEdited, not moved back", () => {
    const { a, b } = start();
    const first = detectMusicSync(new Map(), [videoTrack(0, 13.667), musicTrack(a, b)], media);
    const moved = { ...b, startTime: 16 };
    const r = detectMusicSync(first.seen, [videoTrack(0, 13.667), musicTrack(a, moved)], media);
    expect(r.moves).toEqual([]);
    expect(r.userEdited).toEqual(["cb"]);
  });

  it("a user-moved cue keeps its offset when its scene later moves", () => {
    const { a, b } = start();
    const flagged = { ...b, startTime: 16, metadata: { [META_KEY]: { ...readMusicMeta(b)!, userEdited: true } } };
    const seen: Map<string, Seen> = new Map([["a", { sceneStart: 0, clipStart: 0 }], ["b", { sceneStart: 13.667, clipStart: 16 }]]);
    const r = detectMusicSync(seen, [videoTrack(0, 14.667), musicTrack(a, flagged)], media);
    expect(r.moves).toEqual([{ clipId: "cb", startTime: 17 }]);
    expect(r.userEdited).toEqual([]);                                              // already flagged
  });

  it("edits to volume, fade, automation or length are detected", () => {
    const { a, b } = start();
    const base = [videoTrack(0, 13.667)];
    const seen = detectMusicSync(new Map(), [...base, musicTrack(a, b)], media).seen;
    const variants: Array<[string, Clip]> = [
      ["volume", { ...a, volume: 0.5 }],
      ["fade", { ...a, fade: { fadeIn: 2, fadeOut: 1 } }],
      ["automation", { ...a, automation: { volume: [{ time: 0, value: 0.1 }] } }],
      ["duration", { ...a, duration: 7 }],
    ];
    for (const [what, edited] of variants) {
      const r = detectMusicSync(seen, [...base, musicTrack(edited, b)], media);
      expect(r.userEdited, what).toEqual(["ca"]);
    }
  });

  it("a cue whose scene is not in the project is left alone", () => {
    const { a, b } = start();
    const onlyScene1 = track([clip("v1", { mediaId: "m-v1", startTime: 0 })], "video", "Video");      // scene_002 is not in the project
    const r = detectMusicSync(new Map(), [onlyScene1, musicTrack(a, b)], media);
    expect(r.moves).toEqual([]);
    expect(r.userEdited).toEqual([]);
    expect(r.seen.has("b")).toBe(true);
  });

  it("ordinary audio clips without Framesmith metadata are ignored", () => {
    const plain = clip("x", { startTime: 4 });
    const r = detectMusicSync(new Map(), [videoTrack(0, 13.667), track([plain])], media);
    expect(r.seen.size).toBe(0);
  });
});
