import { describe, it, expect } from "vitest";
import feed from "./__fixtures__/framesmith-music-feed.json";
import { isValidMusic, usableCues, readMusicMeta } from "./framesmith-music";
import { applyFramesmithMusic } from "./framesmith-music-apply";

/**
 * Contract test: `__fixtures__/framesmith-music-feed.json` is the payload Framesmith's `s6_music_feed()` produced for the recorded
 * episode_035 (3 scenes, 1 approved sequence). If Framesmith changes the shape, regenerate it there and this test shows what broke.
 */
describe("Framesmith → OpenReel music payload (recorded from Framesmith)", () => {
  it("is accepted as-is: valid, every cue placeable, gains within OpenReel's range", () => {
    expect(isValidMusic(feed)).toBe(true);
    expect(feed.track_name).toBe("Music (Framesmith)");
    expect(feed.version).toMatch(/^sha1:[0-9a-f]+$/);
    const cues = usableCues(feed as never);
    expect(cues.map((c) => c.scene_id)).toEqual(["scene_001", "scene_002", "scene_003"]);
    for (const c of cues) {
      expect(c.url).toMatch(/^\/assets\/episode_035\/music\/seq_01_scene_00\d\.wav\?v=[0-9a-f]{8}$/);
      for (const p of c.automation_volume ?? []) {
        expect(p.time).toBeGreaterThanOrEqual(0);
        expect(p.value).toBeGreaterThanOrEqual(0);
        expect(p.value).toBeLessThanOrEqual(4);
      }
    }
  });

  it("applies end to end on a project that has the three scene clips, at the probed scene starts", async () => {
    const scenes: Record<string, number> = { scene_001: 0, scene_002: 13.667, scene_003: 24.292 };
    const media: Array<{ id: string; name: string; originalUrl?: string }> = [];
    type C = { id: string; mediaId: string; trackId: string; startTime: number; duration: number; metadata?: Record<string, unknown>; [k: string]: unknown };
    const clip = (id: string, mediaId: string, trackId: string, startTime: number, duration: number): C =>
      ({ id, mediaId, trackId, startTime, duration, inPoint: 0, outPoint: duration, effects: [], audioEffects: [], volume: 1, keyframes: [],
        transform: { position: { x: 0.5, y: 0.5 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 } });
    const video = { id: "v", type: "video", name: "Video", clips: [] as C[], transitions: [], locked: false, hidden: false, muted: false, solo: false };
    Object.entries(scenes).forEach(([sid, start], i) => {
      media.push({ id: `mv${i}`, name: `${sid}.mp4` });
      video.clips.push(clip(`vc${i}`, `mv${i}`, "v", start, 10.625));
    });
    const tracks: Array<typeof video> = [video];
    let n = 0;
    const api = {
      getTracks: () => tracks as never, getMediaItems: () => media,
      addTrack: async () => { tracks.push({ ...video, id: `a${++n}`, type: "audio", name: "Audio", clips: [] }); return true; },
      renameTrack: (id: string, name: string) => { const t = tracks.find((x) => x.id === id); if (t) t.name = name; },
      importMedia: async (f: File) => { media.push({ id: `m${++n}`, name: f.name }); return true; },
      setMediaOriginalUrl: (id: string, url: string) => { const m = media.find((x) => x.id === id); if (m) m.originalUrl = url; },
      addClip: async (tid: string, mid: string, start: number, dur?: number) => { tracks.find((x) => x.id === tid)!.clips.push(clip(`c${++n}`, mid, tid, start, dur ?? 5)); return true; },
      removeClip: async () => true,
      setClipAudioPlan: (cid: string, plan: { volume?: number; fade?: unknown; volumeAutomation?: unknown; metadata?: Record<string, unknown> }) => {
        for (const t of tracks) { const c = t.clips.find((x) => x.id === cid);
          if (c) { Object.assign(c, { volume: plan.volume, fade: plan.fade, automation: { volume: plan.volumeAutomation }, metadata: plan.metadata }); return true; } }
        return false;
      },
    };
    const r = await applyFramesmithMusic(feed, api as never, { fetchFile: async (_u, name) => new File([new Uint8Array([0])], name), warn: () => {} });
    expect(r.added).toEqual(["seq_01_scene_001", "seq_01_scene_002", "seq_01_scene_003"]);
    const music = tracks.find((t) => t.name === "Music (Framesmith)")!;
    expect(music.clips.map((c) => c.startTime)).toEqual([0, 13.667, 24.292]);
    expect(music.clips[1].duration).toBeCloseTo(10.625 + 1.0, 3);
    expect(readMusicMeta(music.clips[1])!.version).toBe(feed.version);
    // second application of the same payload is a no-op (restore of an unchanged project)
    expect((await applyFramesmithMusic(feed, api as never, { fetchFile: async (_u, name) => new File([], name), warn: () => {} })).unchanged).toBe(true);
  });
});
