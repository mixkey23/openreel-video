/**
 * OS-202 — Characterization contract: Framesmith ⇄ OpenReel WebSocket bridge.
 *
 * Pins message names (clip:changed, timeline:synced, timeline:init), the 500 ms
 * debounce, rounding to ms, the "{shot_id}.mp4" media-name convention and the
 * module-level `_applying` anti-loop guard. See docs/sync/OS-202.md.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Project, Clip, Track, MediaItem } from "@openreel/core";
import { useProjectStore } from "../stores/project-store";
import { useFramesmithBridge, FRAMESMITH_WS_URL_KEY } from "./use-framesmith-bridge";

vi.mock("../services/auto-save", () => ({
  autoSaveManager: { startAutoSave: vi.fn(), stopAutoSave: vi.fn(), triggerSave: vi.fn(), getRecentSaves: vi.fn().mockResolvedValue([]), loadSave: vi.fn(), deleteSave: vi.fn() },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

class FakeWS {
  static OPEN = 1;
  static instances: FakeWS[] = [];
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeWS.instances.push(this); }
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() { this.closed = true; }
  emit(msg: unknown) { this.onmessage?.({ data: typeof msg === "string" ? msg : JSON.stringify(msg) }); }
}

const media = (id: string, name: string): MediaItem =>
  ({ id, name, type: "video", fileHandle: null, blob: null, metadata: { duration: 10, width: 1920, height: 1080, frameRate: 30, codec: "h264", sampleRate: 48000, channels: 2, fileSize: 1 }, thumbnailUrl: null, waveformData: null }) as unknown as MediaItem;

const clip = (id: string, mediaId: string, trackId: string, start: number, dur: number): Clip =>
  ({ id, mediaId, trackId, startTime: start, duration: dur, inPoint: 0, outPoint: dur, effects: [], audioEffects: [],
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 }, volume: 1, keyframes: [] }) as unknown as Clip;

function loadFixture() {
  const track = (id: string, type: Track["type"], clips: Clip[]): Track =>
    ({ id, type, name: id, clips, transitions: [], locked: false, hidden: false, muted: false, solo: false }) as unknown as Track;
  const base = useProjectStore.getState().project;
  const project: Project = {
    ...base,
    mediaLibrary: { items: [media("m1", "scene_001.mp4"), media("m2", "scene_002.mp4"), media("m3", "beat.wav")] },
    timeline: {
      ...base.timeline,
      tracks: [
        track("tv", "video", [clip("c1", "m1", "tv", 0, 10.0004), clip("c2", "m2", "tv", 13.6667, 10)]),
        track("ta", "audio", [clip("c3", "m3", "ta", 0, 5)]),
      ],
    },
  };
  useProjectStore.getState().loadProject(project);
}

const lastWs = () => FakeWS.instances[FakeWS.instances.length - 1];
const ev = (t: string) => lastWs().sent.filter((m) => m.type === t);

/** Make a benign store change that emits a new `tracks` reference. */
const touchTracks = () =>
  useProjectStore.setState((s) => ({ project: { ...s.project, timeline: { ...s.project.timeline, tracks: [...s.project.timeline.tracks] } } }));

describe("Framesmith bridge contract (OS-202)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    FakeWS.instances = [];
    vi.stubGlobal("WebSocket", FakeWS);
    sessionStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    useProjectStore.getState().createNewProject();
    loadFixture();
  });
  afterEach(async () => {
    await vi.advanceTimersByTimeAsync(1000); // let any module-level `_applying` reset
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is inert without __framesmith_ws_url__", () => {
    renderHook(() => useFramesmithBridge());
    expect(FakeWS.instances).toHaveLength(0);
  });

  it("opens the socket at the URL stored by the parent page and closes it on unmount", () => {
    sessionStorage.setItem(FRAMESMITH_WS_URL_KEY, "ws://localhost:8000/ws/ep1");
    const { unmount } = renderHook(() => useFramesmithBridge());
    expect(lastWs().url).toBe("ws://localhost:8000/ws/ep1");
    unmount();
    expect(lastWs().closed).toBe(true);
  });

  it("outbound: debounced 500 ms clip:changed for VIDEO clips only, shot_id = media name without .mp4, rounded to ms", async () => {
    sessionStorage.setItem(FRAMESMITH_WS_URL_KEY, "ws://x");
    renderHook(() => useFramesmithBridge());
    touchTracks();
    await vi.advanceTimersByTimeAsync(499);
    expect(ev("clip:changed")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(ev("clip:changed")).toEqual([
      { type: "clip:changed", shot_id: "scene_001", start_time: 0, duration: 10 },
      { type: "clip:changed", shot_id: "scene_002", start_time: 13.667, duration: 10 },
    ]);
  });

  it("outbound: rapid changes collapse into one batch", async () => {
    sessionStorage.setItem(FRAMESMITH_WS_URL_KEY, "ws://x");
    renderHook(() => useFramesmithBridge());
    touchTracks(); await vi.advanceTimersByTimeAsync(300);
    touchTracks(); await vi.advanceTimersByTimeAsync(300);
    touchTracks(); await vi.advanceTimersByTimeAsync(600);
    expect(ev("clip:changed")).toHaveLength(2);
  });

  it("outbound: nothing is sent when the socket is not OPEN", async () => {
    sessionStorage.setItem(FRAMESMITH_WS_URL_KEY, "ws://x");
    renderHook(() => useFramesmithBridge());
    lastWs().readyState = 0;
    touchTracks();
    await vi.advanceTimersByTimeAsync(700);
    expect(lastWs().sent).toHaveLength(0);
  });

  it.each(["timeline:synced", "timeline:init"])("inbound %s repositions only clips off by > 0.05 s, via moveClip", async (type) => {
    const real = useProjectStore.getState().moveClip;
    const moveSpy = vi.fn(real);
    useProjectStore.setState({ moveClip: moveSpy as never });
    sessionStorage.setItem(FRAMESMITH_WS_URL_KEY, "ws://x");
    renderHook(() => useFramesmithBridge());

    lastWs().emit({ type, shots: [
      { shot_id: "scene_001", start_time: 0.04, duration: 10, end_time: 10.04 },   // within tolerance → untouched
      { shot_id: "scene_002", start_time: 20, duration: 10, end_time: 30 },        // moved
      { shot_id: "unknown", start_time: 1, duration: 1, end_time: 2 },             // no such clip → ignored
    ] });
    await vi.advanceTimersByTimeAsync(50);

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(moveSpy.mock.calls[0]).toEqual(["c2", 20]);
    expect(useProjectStore.getState().getClip("c2")?.startTime).toBe(20);
  });

  it("anti-loop: applying a server timeline does NOT echo clip:changed, and sending resumes ~200 ms later", async () => {
    sessionStorage.setItem(FRAMESMITH_WS_URL_KEY, "ws://x");
    renderHook(() => useFramesmithBridge());
    lastWs().emit({ type: "timeline:synced", shots: [{ shot_id: "scene_002", start_time: 25, duration: 10, end_time: 35 }] });
    await vi.advanceTimersByTimeAsync(100);   // inside the 200 ms settle window
    await vi.advanceTimersByTimeAsync(700);   // well past the debounce
    expect(ev("clip:changed")).toHaveLength(0);

    touchTracks();                            // user edit after the guard released
    await vi.advanceTimersByTimeAsync(600);
    expect(ev("clip:changed").length).toBeGreaterThan(0);
  });

  it("ignores malformed and unrelated messages without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sessionStorage.setItem(FRAMESMITH_WS_URL_KEY, "ws://x");
    renderHook(() => useFramesmithBridge());
    expect(() => lastWs().emit("not json")).not.toThrow();
    expect(() => lastWs().emit({ type: "hello" })).not.toThrow();
    expect(() => lastWs().emit({ type: "timeline:synced" })).not.toThrow(); // no shots
  });
});
