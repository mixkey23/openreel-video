/**
 * OS-205 — Characterization contract: store API surface Framesmith depends on.
 *
 * Fails if an upstream merge drops the explicit `duration` 4th parameter of
 * `addClip` (per-beat audio and music cues would silently become 5 s clips) or
 * the fork-only `setClipAudioPlan` action. See docs/sync/OS-205.md.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useProjectStore } from "./project-store";
import type { Project, MediaItem, Clip } from "@openreel/core";

vi.mock("../services/auto-save", () => ({
  autoSaveManager: {
    startAutoSave: vi.fn(),
    stopAutoSave: vi.fn(),
    triggerSave: vi.fn(),
    getRecentSaves: vi.fn().mockResolvedValue([]),
    loadSave: vi.fn(),
    deleteSave: vi.fn(),
  },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

const audioItem = (id: string, duration: number): MediaItem =>
  ({
    id,
    name: `${id}.wav`,
    type: "audio",
    fileHandle: null,
    blob: null,
    metadata: { duration, width: 0, height: 0, frameRate: 0, codec: "pcm", sampleRate: 48000, channels: 2, fileSize: 1000 },
    thumbnailUrl: null,
    waveformData: null,
  }) as unknown as MediaItem;

function seed(items: MediaItem[]) {
  const store = useProjectStore.getState();
  store.createNewProject("contract");
  const p = useProjectStore.getState().project;
  const loaded: Project = { ...p, mediaLibrary: { ...p.mediaLibrary, items } };
  useProjectStore.getState().loadProject(loaded);
}

async function audioTrackId(): Promise<string> {
  const r = await useProjectStore.getState().addTrack("audio");
  expect(r.success).toBe(true);
  const t = useProjectStore.getState().project.timeline.tracks.find((x) => x.type === "audio");
  expect(t).toBeDefined();
  return t!.id;
}

const clipsOf = (trackId: string): Clip[] =>
  useProjectStore.getState().project.timeline.tracks.find((t) => t.id === trackId)!.clips;

describe("Framesmith store contract (OS-205)", () => {
  beforeEach(() => seed([audioItem("beat_a", 3.2)]));

  it("addClip honours an explicit duration as 4th argument", async () => {
    const tid = await audioTrackId();
    const r = await useProjectStore.getState().addClip(tid, "beat_a", 1.5, 2.25);
    expect(r.success).toBe(true);
    const [clip] = clipsOf(tid);
    expect(clip.startTime).toBeCloseTo(1.5, 5);
    expect(clip.duration).toBeCloseTo(2.25, 5);
  });

  it("addClip without duration falls back to the media duration (not the explicit one)", async () => {
    const tid = await audioTrackId();
    await useProjectStore.getState().addClip(tid, "beat_a", 0);
    const [clip] = clipsOf(tid);
    expect(clip.duration).not.toBeCloseTo(2.25, 5);
    expect(clip.duration).toBeGreaterThan(0);
  });

  it("addClip ignores a non-positive duration (same as omitted)", async () => {
    const tid = await audioTrackId();
    await useProjectStore.getState().addClip(tid, "beat_a", 0, 0);
    const [clip] = clipsOf(tid);
    expect(clip.duration).toBeGreaterThan(0);
  });

  it("an explicit duration longer than the media is not clamped away silently", async () => {
    const tid = await audioTrackId();
    const r = await useProjectStore.getState().addClip(tid, "beat_a", 0, 11.667);
    expect(r.success).toBe(true);
    // Characterizes current fork behaviour: record the resulting duration so a merge that changes it is noticed.
    expect(clipsOf(tid)[0].duration).toBeCloseTo(11.667, 3);
  });

  it("setClipAudioPlan exists and applies volume (clamped 0..4), fade, automation and metadata", async () => {
    const tid = await audioTrackId();
    await useProjectStore.getState().addClip(tid, "beat_a", 0, 3);
    const clipId = clipsOf(tid)[0].id;
    const ok = useProjectStore.getState().setClipAudioPlan(clipId, {
      volume: 9,
      fade: { fadeIn: 0.5, fadeOut: -2 },
      volumeAutomation: [
        { time: 0, value: 1 },
        { time: 2, value: -1 },
        { time: 3, value: 0.35 },
      ],
      metadata: { framesmithMusic: { cue_id: "c1" } },
    });
    expect(ok).toBe(true);
    const clip = useProjectStore.getState().getClip(clipId)!;
    expect(clip.volume).toBe(4);
    expect(clip.fade).toEqual({ fadeIn: 0.5, fadeOut: 0 });
    expect(clip.automation?.volume).toEqual([
      { time: 0, value: 1 },
      { time: 2, value: 0 },
      { time: 3, value: 0.35 },
    ]);
    expect((clip.metadata as Record<string, unknown>).framesmithMusic).toEqual({ cue_id: "c1" });
  });

  it("setClipAudioPlan returns false for an unknown clip", () => {
    expect(useProjectStore.getState().setClipAudioPlan("nope", { volume: 1 })).toBe(false);
  });

  it("renameTrack changes the track name (sync or async; callers must not depend on the return type)", async () => {
    const tid = await audioTrackId();
    await Promise.resolve(useProjectStore.getState().renameTrack(tid, "Music (Framesmith)"));
    expect(useProjectStore.getState().project.timeline.tracks.find((t) => t.id === tid)?.name).toBe("Music (Framesmith)");
  });

  it("loadProject / importMedia / moveClip / addTrack are present on the store", () => {
    const s = useProjectStore.getState();
    for (const k of ["loadProject", "importMedia", "moveClip", "addTrack", "removeClip", "getClip", "createNewProject"] as const) {
      expect(typeof s[k]).toBe("function");
    }
  });
});
