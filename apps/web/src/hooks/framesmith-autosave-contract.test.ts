/**
 * OS-203 — Characterization contract: autosave / restore with Framesmith.
 *
 * POST /api/episodes/{id}/s6/project (debounced 5 s or `framesmith:save-now`),
 * external blobs uploaded to /s6/media first, binary fields stripped, parent
 * notified with framesmith:saved / framesmith:save-error, and the saved payload
 * must be loadable by restore mode (GET /s6/project + originalUrl re-fetch).
 * See docs/sync/OS-203.md.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Project, MediaItem, Track, Clip } from "@openreel/core";
import { useProjectStore } from "../stores/project-store";
import * as init from "./use-framesmith-init";
import { useFramesmithAutosave } from "./use-framesmith-autosave";

vi.mock("../services/auto-save", () => ({
  autoSaveManager: { startAutoSave: vi.fn(), stopAutoSave: vi.fn(), triggerSave: vi.fn(), getRecentSaves: vi.fn().mockResolvedValue([]), loadSave: vi.fn(), deleteSave: vi.fn() },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

const EP = "ep_save";
const item = (id: string, name: string, extra: Record<string, unknown> = {}): MediaItem =>
  ({ id, name, type: "video", fileHandle: null, blob: null, metadata: { duration: 10, width: 1920, height: 1080, frameRate: 30, codec: "h264", sampleRate: 48000, channels: 2, fileSize: 1 }, thumbnailUrl: "blob:thumb", waveformData: null, ...extra }) as unknown as MediaItem;

function loadFixture(): Project {
  const base = useProjectStore.getState().project;
  const clip = { id: "c1", mediaId: "m_fs", trackId: "tv", startTime: 2, duration: 10, inPoint: 0, outPoint: 10, effects: [], audioEffects: [],
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 }, volume: 1, keyframes: [] } as unknown as Clip;
  const track = { id: "tv", type: "video", name: "Video", clips: [clip], transitions: [], locked: false, hidden: false, muted: false, solo: false } as unknown as Track;
  const project: Project = {
    ...base,
    mediaLibrary: { items: [
      item("m_fs", "scene_001.mp4", { originalUrl: "/assets/s5/scene_001.mp4", blob: new Blob(["a"]) }), // from Framesmith: already has URL
      item("m_ext", "dragged.mp4", { blob: new Blob(["b"]) }),                                          // user-dropped: needs upload
    ] },
    timeline: { ...base.timeline, tracks: [track] },
  };
  useProjectStore.getState().loadProject(project);
  return project;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchMock: ReturnType<typeof vi.fn<any[], any>>;
let posted: Array<{ type: string }>;
const calls = (url: string, method = "GET") => fetchMock.mock.calls.filter((c) => c[0] === url && (c[1]?.method ?? "GET") === method);

describe("Framesmith autosave / restore contract (OS-203)", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    sessionStorage.clear();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    posted = [];
    vi.spyOn(window.parent, "postMessage").mockImplementation(((m: { type: string }) => { posted.push(m); }) as never);
    fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === `/api/episodes/${EP}/s6/media`) return new Response(JSON.stringify({ url: "/assets/ep/s6/dragged.mp4" }), { status: 200 });
      if (url === `/api/episodes/${EP}/s6/project` && opts?.method === "POST") return new Response("{}", { status: 200 });
      return new Response(new Blob(["x"]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    useProjectStore.getState().createNewProject();
    // Activate "inside a Framesmith iframe": the init hook publishes the episodeId the autosave hook reads.
    sessionStorage.setItem(init.FRAMESMITH_STORAGE_KEY, JSON.stringify({ episodeId: EP, mode: "init", clips: [] }));
    renderHook(() => init.useFramesmithInit());
    expect(init.framesmithEpisodeId).toBe(EP);
    await vi.advanceTimersByTimeAsync(2000); // let init finish (empty clip list) before the fixture replaces the project
    fetchMock.mockClear();
    loadFixture();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const saveNow = async () => {
    window.dispatchEvent(new MessageEvent("message", { data: { type: "framesmith:save-now" } }));
    await vi.advanceTimersByTimeAsync(50);
  };

  it("save-now: uploads only blobs lacking originalUrl, then POSTs the project with binary fields stripped", async () => {
    renderHook(() => useFramesmithAutosave());
    await saveNow();

    const uploads = calls(`/api/episodes/${EP}/s6/media`, "POST");
    expect(uploads).toHaveLength(1);
    expect((uploads[0][1].body as FormData).get("file")).toBeTruthy();

    const saves = calls(`/api/episodes/${EP}/s6/project`, "POST");
    expect(saves).toHaveLength(1);
    expect(saves[0][1].headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(saves[0][1].body as string);
    const items = body.mediaLibrary.items as Array<Record<string, unknown>>;
    expect(items.find((i) => i.id === "m_fs")!.originalUrl).toBe("/assets/s5/scene_001.mp4");
    expect(items.find((i) => i.id === "m_ext")!.originalUrl).toBe("/assets/ep/s6/dragged.mp4"); // uploaded → persistent URL
    for (const i of items) { expect(i.blob).toBeNull(); expect(i.thumbnailUrl).toBeNull(); }
    for (const k of ["textClips", "shapeClips", "svgClips", "stickerClips"]) expect(Array.isArray(body[k])).toBe(true);
    expect(body.timeline.tracks[0].clips[0]).toMatchObject({ id: "c1", startTime: 2, duration: 10 });
    expect(posted).toContainEqual({ type: "framesmith:saved" });
  });

  it("server error → framesmith:save-error to the parent (no throw)", async () => {
    fetchMock.mockImplementation(async (url: string, opts?: RequestInit) =>
      url.endsWith("/s6/project") && opts?.method === "POST" ? new Response("boom", { status: 500 }) : new Response("{}", { status: 200 }));
    renderHook(() => useFramesmithAutosave());
    await saveNow();
    expect(posted).toContainEqual({ type: "framesmith:save-error" });
  });

  it("debounces project changes by 5 s", async () => {
    renderHook(() => useFramesmithAutosave());
    useProjectStore.setState((s) => ({ project: { ...s.project, modifiedAt: Date.now() + 10 } }));
    await vi.advanceTimersByTimeAsync(4900);
    expect(calls(`/api/episodes/${EP}/s6/project`, "POST")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(calls(`/api/episodes/${EP}/s6/project`, "POST")).toHaveLength(1);
  });

  it("round trip: what autosave POSTs is what restore mode loads back", async () => {
    renderHook(() => useFramesmithAutosave());
    await saveNow();
    const savedBody = calls(`/api/episodes/${EP}/s6/project`, "POST")[0][1].body as string;
    const before = useProjectStore.getState().project;

    // Fresh page load in restore mode: server returns the saved JSON, originalUrls are re-fetched.
    useProjectStore.getState().createNewProject("blank");
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string) =>
      url === `/api/episodes/${EP}/s6/project` ? new Response(savedBody, { status: 200 }) : new Response(new Blob(["re"]), { status: 200 }));
    sessionStorage.setItem(init.FRAMESMITH_STORAGE_KEY, JSON.stringify({ episodeId: EP, mode: "restore", clips: [] }));
    renderHook(() => init.useFramesmithInit());
    await vi.advanceTimersByTimeAsync(1000);

    const after = useProjectStore.getState().project;
    expect(after.id).toBe(before.id);
    expect(after.timeline.tracks.map((t) => [t.id, t.type, t.clips.map((c) => [c.id, c.startTime, c.duration])]))
      .toEqual(before.timeline.tracks.map((t) => [t.id, t.type, t.clips.map((c) => [c.id, c.startTime, c.duration])]));
    expect(calls("/assets/s5/scene_001.mp4")).toHaveLength(1);
    expect(calls("/assets/ep/s6/dragged.mp4")).toHaveLength(1);
    const restored = after.mediaLibrary.items as Array<{ id: string; blob: Blob | null }>;
    expect(restored.every((i) => i.blob && i.blob.size > 0)).toBe(true);
  });
});
