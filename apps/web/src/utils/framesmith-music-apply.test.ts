import { describe, it, expect, vi } from "vitest";
import type { Clip, Track } from "@openreel/core";
import { applyFramesmithMusic, type MusicStoreApi } from "./framesmith-music-apply";
import { META_KEY, readMusicMeta, type FramesmithMusic, type FramesmithMusicClip } from "./framesmith-music";

/** Minimal in-memory project: enough behaviour to exercise the apply logic without the real store. */
function fakeProject(opts: { scenes?: Record<string, number>; failImport?: string[]; failAddTrack?: boolean } = {}) {
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const media: Array<{ id: string; name: string; originalUrl?: string }> = [];
  const tracks: Track[] = [];
  const mk = (type: Track["type"], name: string): Track => ({ id: id("trk"), type, name, clips: [], transitions: [], locked: false, hidden: false, muted: false, solo: false });
  const video = mk("video", "Video");
  tracks.push(video);
  for (const [scene, start] of Object.entries(opts.scenes ?? { scene_001: 0, scene_002: 13.667 })) {
    const m = { id: id("m"), name: `${scene}.mp4` };
    media.push(m);
    video.clips.push({ id: id("clip"), mediaId: m.id, trackId: video.id, startTime: start, duration: 10, inPoint: 0, outPoint: 10, effects: [], audioEffects: [],
      transform: { position: { x: 0.5, y: 0.5 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 }, volume: 1, keyframes: [] } as Clip);
  }
  const calls = { importMedia: [] as string[], removed: [] as string[], planned: [] as string[] };
  const api: MusicStoreApi = {
    getTracks: () => tracks,
    getMediaItems: () => media,
    addTrack: async () => { if (opts.failAddTrack) return false; tracks.push(mk("audio", "Audio")); return true; },
    renameTrack: (tid, name) => { const t = tracks.find((x) => x.id === tid); if (t) (t as { name: string }).name = name; },
    importMedia: async (file) => { calls.importMedia.push(file.name); if (opts.failImport?.includes(file.name)) return false; media.push({ id: id("m"), name: file.name }); return true; },
    setMediaOriginalUrl: (mid, url) => { const m = media.find((x) => x.id === mid); if (m) m.originalUrl = url; },
    addClip: async (tid, mid, start, dur) => {
      const t = tracks.find((x) => x.id === tid)!;
      t.clips.push({ id: id("clip"), mediaId: mid, trackId: tid, startTime: start, duration: dur ?? 5, inPoint: 0, outPoint: dur ?? 5, effects: [], audioEffects: [],
        transform: { position: { x: 0.5, y: 0.5 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 }, volume: 1, keyframes: [] } as Clip);
      return true;
    },
    removeClip: async (cid) => { calls.removed.push(cid); for (const t of tracks) (t as { clips: Clip[] }).clips = t.clips.filter((c) => c.id !== cid); return true; },
    setClipAudioPlan: (cid, plan) => {
      for (const t of tracks) {
        const found = t.clips.find((x) => x.id === cid);
        if (!found) continue;
        const c = found as unknown as Record<string, unknown>;          // Clip fields are readonly; this fake mutates in place
        if (plan.volume !== undefined) c.volume = plan.volume;
        if (plan.fade) c.fade = plan.fade;
        if (plan.volumeAutomation) c.automation = { ...((c.automation as object) ?? {}), volume: plan.volumeAutomation };
        if (plan.metadata) c.metadata = { ...((c.metadata as object) ?? {}), ...plan.metadata };
        calls.planned.push(cid);
        return true;
      }
      return false;
    },
  };
  return { api, tracks, media, calls, musicTrack: () => tracks.find((t) => t.type === "audio" && t.name === "Music (Framesmith)") };
}

const cue = (id: string, scene: string, extra: Partial<FramesmithMusicClip> = {}): FramesmithMusicClip => ({
  cue_id: id, scene_id: scene, offset_in_scene_s: 0, duration_s: 11, url: `/assets/ep/music/${id}.wav`, gain: 1,
  fade: { fadeIn: 0, fadeOut: 1 }, automation_volume: [{ time: 0, value: 1 }, { time: 2, value: 0.35 }], status: "ok", ...extra,
});
const music = (version: string, clips: FramesmithMusicClip[]): FramesmithMusic => ({ version, track_name: "Music (Framesmith)", clips });
const fetchFile = async (_url: string, name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "audio/wav" });
const opts = (extra: Record<string, unknown> = {}) => ({ fetchFile, warn: () => {}, ...extra });

describe("applyFramesmithMusic", () => {
  it("creates the Framesmith track and places each cue at scene start + offset with its audio plan", async () => {
    const p = fakeProject();
    const r = await applyFramesmithMusic(music("v1", [cue("a", "scene_001"), cue("b", "scene_002", { offset_in_scene_s: 0.5 })]), p.api, opts());
    expect(r).toMatchObject({ applied: true, added: ["a", "b"], removed: 0, skipped: [] });
    const t = p.musicTrack()!;
    expect(t.type).toBe("audio");
    expect(t.clips.map((c) => c.startTime)).toEqual([0, 14.167]);
    expect(p.calls.importMedia).toEqual(["music__a.wav", "music__b.wav"]);
    const c = t.clips[0];
    expect(c.fade).toEqual({ fadeIn: 0, fadeOut: 1 });
    expect(c.automation?.volume).toEqual([{ time: 0, value: 1 }, { time: 2, value: 0.35 }]);
    expect(readMusicMeta(c)).toMatchObject({ cue_id: "a", version: "v1", userEdited: false });
    expect(p.media.filter((m) => m.name.startsWith("music__")).every((m) => m.originalUrl?.startsWith("/assets/ep/music/"))).toBe(true);
  });

  it("does nothing for an invalid payload, and never creates an empty track", async () => {
    const p = fakeProject();
    expect((await applyFramesmithMusic(null, p.api, opts())).applied).toBe(false);
    expect((await applyFramesmithMusic({ version: "1" }, p.api, opts())).applied).toBe(false);
    expect((await applyFramesmithMusic(music("v1", []), p.api, opts())).applied).toBe(false);
    expect(p.tracks.length).toBe(1);
  });

  it("is idempotent: applying the same version twice changes nothing", async () => {
    const p = fakeProject();
    const m = music("v1", [cue("a", "scene_001"), cue("b", "scene_002")]);
    await applyFramesmithMusic(m, p.api, opts());
    const snapshot = JSON.stringify(p.tracks);
    const r = await applyFramesmithMusic(m, p.api, opts());
    expect(r.unchanged).toBe(true);
    expect(JSON.stringify(p.tracks)).toBe(snapshot);
  });

  it("a new version replaces untouched cues but keeps (and reports) a user-edited one", async () => {
    const p = fakeProject();
    await applyFramesmithMusic(music("v1", [cue("a", "scene_001"), cue("b", "scene_002")]), p.api, opts());
    const clipB = p.musicTrack()!.clips[1] as Clip & { metadata: Record<string, unknown> };
    clipB.metadata = { [META_KEY]: { ...readMusicMeta(clipB)!, userEdited: true } };
    const onConflict = vi.fn();
    const r = await applyFramesmithMusic(music("v2", [cue("a", "scene_001", { gain: 0.8 }), cue("b", "scene_002", { gain: 0.8 })]), p.api, opts({ onConflict }));
    expect(r.removed).toBe(1);
    expect(r.added).toEqual(["a"]);
    expect(onConflict).toHaveBeenCalledWith([{ cue_id: "b", clipId: clipB.id, reason: "changed" }]);
    const t = p.musicTrack()!;
    expect(t.clips.map((c) => readMusicMeta(c)!.cue_id).sort()).toEqual(["a", "b"]);
    expect(readMusicMeta(t.clips.find((c) => readMusicMeta(c)!.cue_id === "a")!)!.version).toBe("v2");
    expect(readMusicMeta(t.clips.find((c) => readMusicMeta(c)!.cue_id === "b")!)!.version).toBe("v1");      // the user's clip is untouched
  });

  it("skips a cue whose file cannot be fetched or imported, and keeps going", async () => {
    const p = fakeProject({ failImport: ["music__b.wav"] });
    const r = await applyFramesmithMusic(music("v1", [cue("a", "scene_001"), cue("b", "scene_002"), cue("c", "scene_002", { offset_in_scene_s: 2 })]), p.api, opts({
      fetchFile: async (url: string, name: string) => { if (name === "music__c.wav") throw new Error("HTTP 404"); return fetchFile(url, name); },
    }));
    expect(r.added).toEqual(["a"]);
    expect(r.skipped.map((s) => s.cue_id).sort()).toEqual(["b", "c"]);
    expect(r.skipped.find((s) => s.cue_id === "c")!.reason).toContain("404");
    expect(p.musicTrack()!.clips.length).toBe(1);
  });

  it("falls back to scene_start_s when the scene clip is missing, and skips when there is no fallback", async () => {
    const p = fakeProject({ scenes: { scene_001: 0 } });
    const r = await applyFramesmithMusic(music("v1", [cue("b", "scene_002", { scene_start_s: 13.667, offset_in_scene_s: 1 }), cue("z", "scene_999")]), p.api, opts());
    expect(r.added).toEqual(["b"]);
    expect(p.musicTrack()!.clips[0].startTime).toBe(14.667);
    expect(r.skipped).toEqual([{ cue_id: "z", reason: "scene not in project" }]);
  });

  it("stops cleanly when the track cannot be created", async () => {
    const p = fakeProject({ failAddTrack: true });
    const r = await applyFramesmithMusic(music("v1", [cue("a", "scene_001")]), p.api, opts());
    expect(r.applied).toBe(false);
    expect(p.tracks.length).toBe(1);
  });

  it("never touches video, other audio tracks or user clips", async () => {
    const p = fakeProject();
    await p.api.addTrack("audio");
    const other = p.tracks[p.tracks.length - 1];
    (other as { name: string }).name = "My sound effects";
    await p.api.addClip(other.id, p.media[0].id, 3, 2);
    const before = JSON.stringify([p.tracks[0], other]);
    await applyFramesmithMusic(music("v1", [cue("a", "scene_001")]), p.api, opts());
    await applyFramesmithMusic(music("v2", [cue("a", "scene_001")]), p.api, opts());
    expect(JSON.stringify([p.tracks[0], other])).toBe(before);
  });
});
