/**
 * OS-201 — Characterization contract: sessionStorage['__framesmith_config__'] → timeline.
 *
 * Framesmith (s6_openreel.html) writes a FramesmithConfig before the iframe loads.
 * This pins what useFramesmithInit builds from it (tracks, clip positions, explicit
 * audio durations, originalUrl for restore) and the restore-mode round trip.
 * See docs/sync/OS-201.md.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { MediaItem } from "@openreel/core";
import { useProjectStore } from "../stores/project-store";
import * as init from "./use-framesmith-init";

vi.mock("../services/auto-save", () => ({
  autoSaveManager: { startAutoSave: vi.fn(), stopAutoSave: vi.fn(), triggerSave: vi.fn(), getRecentSaves: vi.fn().mockResolvedValue([]), loadSave: vi.fn(), deleteSave: vi.fn() },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

const KEY = init.FRAMESMITH_STORAGE_KEY;

const mediaFor = (file: File, id: string): MediaItem =>
  ({
    id,
    name: file.name,
    type: file.type.startsWith("audio") ? "audio" : "video",
    fileHandle: null,
    blob: file,
    metadata: { duration: file.type.startsWith("audio") ? 3 : 10, width: 1920, height: 1080, frameRate: 30, codec: "x", sampleRate: 48000, channels: 2, fileSize: 1 },
    thumbnailUrl: null,
    waveformData: null,
  }) as unknown as MediaItem;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = ReturnType<typeof vi.fn<any[], any>>;
let fetchMock: AnyMock;
let addClipSpy: AnyMock;
let loadProjectSpy: AnyMock;
let n = 0;

function installStoreSpies() {
  const real = useProjectStore.getState();
  addClipSpy = vi.fn(real.addClip);
  loadProjectSpy = vi.fn(real.loadProject);
  useProjectStore.setState({
    addClip: addClipSpy as never,
    loadProject: loadProjectSpy as never,
    importMedia: (async (file: File) => {
      const item = mediaFor(file, `m${++n}`);
      useProjectStore.setState((s) => ({ project: { ...s.project, mediaLibrary: { ...s.project.mediaLibrary, items: [...s.project.mediaLibrary.items, item] } } }));
      return { success: true };
    }) as never,
  });
}

const tracks = () => useProjectStore.getState().project.timeline.tracks;

describe("Framesmith init contract (OS-201)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); // keep Date.now() real: track ids are `track-${Date.now()}`
    sessionStorage.clear();
    n = 0;
    fetchMock = vi.fn(async (url: string) => new Response(new Blob([url]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Fork-only latent issue: action-executor builds track ids as `track-${Date.now()}`, so two addTrack
    // calls in the same ms collide. Keep the clock strictly increasing so this test pins init behaviour, not that race.
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => ++clock);
    useProjectStore.getState().createNewProject();
    installStoreSpies();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing when no config is present", async () => {
    renderHook(() => init.useFramesmithInit());
    await vi.advanceTimersByTimeAsync(2000);
    expect(addClipSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("init mode: one video + one audio track, video at start_time, beat audio deduped with explicit duration", async () => {
    const config: init.FramesmithConfig = {
      projectName: "episode_035",
      episodeId: "episode_035",
      mode: "init",
      clips: [
        { id: "scene_001", url: "/assets/s5/scene_001.mp4", duration: 10, start_time: 0, audioUrl: "/assets/s1/beat_01.wav", audioDuration: 7.5, beat_id: "beat_01" },
        { id: "scene_002", url: "/assets/s5/scene_002.mp4", duration: 10, start_time: 13.667, audioUrl: "/assets/s1/beat_01.wav", audioDuration: 7.5, beat_id: "beat_01" },
        { id: "scene_003", url: null, duration: 5, start_time: 30 },
      ],
    };
    sessionStorage.setItem(KEY, JSON.stringify(config));
    renderHook(() => init.useFramesmithInit());
    await vi.advanceTimersByTimeAsync(5000);

    expect(init.framesmithEpisodeId).toBe("episode_035");
    expect(useProjectStore.getState().project.name).toBe("episode_035");
    expect(tracks().map((t) => t.type).sort()).toEqual(["audio", "video"]);

    const video = tracks().find((t) => t.type === "video")!;
    const audio = tracks().find((t) => t.type === "audio")!;
    // url:null (pending) is skipped
    expect(video.clips.map((c) => c.startTime).sort((a, b) => a - b)).toEqual([0, 13.667]);
    // beat audio deduplicated by beat_id: one clip, 4th arg = explicit audioDuration
    expect(audio.clips).toHaveLength(1);
    expect(audio.clips[0].duration).toBeCloseTo(7.5, 5);
    const audioCall = addClipSpy.mock.calls.find((c) => c[0] === audio.id)!;
    expect(audioCall[3]).toBe(7.5);
    // video clips are added WITHOUT explicit duration
    const videoCall = addClipSpy.mock.calls.find((c) => c[0] === video.id)!;
    expect(videoCall[3]).toBeUndefined();

    // restore needs the source URL on every imported media item
    const items = useProjectStore.getState().project.mediaLibrary.items as Array<{ name: string; originalUrl?: string }>;
    expect(items.find((i) => i.name === "scene_001.mp4")?.originalUrl).toBe("/assets/s5/scene_001.mp4");
    expect(items.find((i) => i.name === "beat_01.wav")?.originalUrl).toBe("/assets/s1/beat_01.wav");
    // config consumed
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("restore mode: GET /s6/project, re-fetch originalUrl blobs, loadProject", async () => {
    const saved = {
      id: "p1", name: "saved", createdAt: 1, modifiedAt: 2,
      settings: { width: 1920, height: 1080, frameRate: 30, sampleRate: 48000, channels: 2 },
      mediaLibrary: { items: [{ id: "m1", name: "scene_001.mp4", type: "video", blob: null, originalUrl: "/assets/s5/scene_001.mp4", metadata: { duration: 10 } }, { id: "m2", name: "x.wav", type: "audio", blob: null }] },
      timeline: { tracks: [], subtitles: [], duration: 0, markers: [] },
    };
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/episodes/ep1/s6/project" ? new Response(JSON.stringify(saved), { status: 200 }) : new Response(new Blob(["v"]), { status: 200 }));
    sessionStorage.setItem(KEY, JSON.stringify({ episodeId: "ep1", mode: "restore", clips: [] }));
    renderHook(() => init.useFramesmithInit());
    await vi.advanceTimersByTimeAsync(2000);

    expect(fetchMock).toHaveBeenCalledWith("/api/episodes/ep1/s6/project");
    expect(fetchMock).toHaveBeenCalledWith("/assets/s5/scene_001.mp4");
    expect(loadProjectSpy).toHaveBeenCalledTimes(1);
    const loaded = loadProjectSpy.mock.calls[0][0];
    expect(loaded.id).toBe("p1");
    expect(loaded.mediaLibrary.items[0].blob.size).toBeGreaterThan(0); // re-fetched, not the null that was saved
    expect(loaded.mediaLibrary.items[1].blob).toBeNull(); // no originalUrl → untouched
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("restore mode: server failure falls back by rewriting the config as mode:init", async () => {
    fetchMock.mockImplementation(async () => new Response("nope", { status: 404 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    sessionStorage.setItem(KEY, JSON.stringify({ episodeId: "ep2", mode: "restore", clips: [] }));
    renderHook(() => init.useFramesmithInit());
    await vi.advanceTimersByTimeAsync(500);
    const cfg = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(cfg.mode).toBe("init");
    expect(cfg.episodeId).toBe("ep2");
    expect(loadProjectSpy).not.toHaveBeenCalled();
  });
});
