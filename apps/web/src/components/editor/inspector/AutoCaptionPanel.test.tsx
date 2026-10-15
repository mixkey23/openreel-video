/**
 * End-to-end wiring of the hybrid auto-caption panel with the local-server engine:
 * selected clip → trimmed audio → POST /api/transcribe → subtitles on the timeline.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Clip, MediaItem, Project, Track } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { AutoCaptionPanel } from "./AutoCaptionPanel";

vi.mock("../../../services/auto-save", () => ({
  autoSaveManager: { startAutoSave: vi.fn(), stopAutoSave: vi.fn(), triggerSave: vi.fn(), getRecentSaves: vi.fn().mockResolvedValue([]), loadSave: vi.fn(), deleteSave: vi.fn() },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));
// Inside Framesmith → the local server is the default engine.
vi.mock("../../../hooks/use-framesmith-init", () => ({ framesmithEpisodeId: "ep_test" }));
vi.mock("../../../utils/load-audio-buffer", () => ({
  loadAudioBuffer: vi.fn(async () => ({
    duration: 60,
    sampleRate: 16000,
    length: 60 * 16000,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(60 * 16000),
  })),
}));

const media = (id: string, type: "audio" | "video"): MediaItem =>
  ({ id, name: `${id}.${type === "audio" ? "wav" : "mp4"}`, type, fileHandle: null, blob: new Blob(["x"]), metadata: { duration: 60, width: 0, height: 0, frameRate: 0, codec: "x", sampleRate: 16000, channels: 1, fileSize: 1 }, thumbnailUrl: null, waveformData: null }) as unknown as MediaItem;
const clip = (id: string, mediaId: string, trackId: string, start: number, duration: number, extra: Partial<Clip> = {}): Clip =>
  ({ id, mediaId, trackId, startTime: start, duration, inPoint: 0, outPoint: duration, effects: [], audioEffects: [], volume: 1, keyframes: [], transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 }, ...extra }) as unknown as Clip;
const track = (id: string, clips: Clip[]): Track =>
  ({ id, type: "audio", name: id, clips, transitions: [], locked: false, hidden: false, muted: false, solo: false }) as unknown as Track;

function load(tracks: Track[], items: MediaItem[]) {
  useProjectStore.getState().createNewProject("t");
  const base = useProjectStore.getState().project;
  const project: Project = { ...base, mediaLibrary: { items }, timeline: { ...base.timeline, tracks, subtitles: [] } };
  useProjectStore.getState().loadProject(project);
}

describe("AutoCaptionPanel (server engine)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchMock: ReturnType<typeof vi.fn<any[], any>>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "hola mundo", words: [{ word: "hola", start: 0.5, end: 0.9 }, { word: "mundo", start: 1, end: 1.4 }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a TRIMMED clip uploads only its used span and places captions relative to the timeline", async () => {
    // 60 s file; timeline uses source 10–20 s, placed at 5 s.
    load([track("ta", [clip("a1", "m_a", "ta", 5, 10, { inPoint: 10, outPoint: 20 })])], [media("m_a", "audio")]);
    render(<AutoCaptionPanel clipId="a1" maxWordsPerLine={5} />);

    fireEvent.click(screen.getByRole("button", { name: /generate captions/i }));
    await waitFor(() => expect(useProjectStore.getState().project.timeline.subtitles.length).toBe(1), { timeout: 4000 });

    // Uploaded audio = 10 s of 16 kHz mono 16-bit PCM + 44-byte header, not the whole 60 s file.
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect((form.get("audio") as File).size).toBe(44 + 10 * 16000 * 2);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/transcribe$/);

    const [sub] = useProjectStore.getState().project.timeline.subtitles;
    expect(sub.text).toBe("hola mundo");
    expect(sub.startTime).toBeCloseTo(5.5, 3); // 5 (clip start) + 0.5, NOT 5 + 10 + 0.5
    expect(sub.words?.[1]).toMatchObject({ text: "mundo" });
    expect(sub.animationStyle).toBe("word-highlight");
    // reading hold (0.5 s default) extends the last block
    expect(sub.endTime).toBeCloseTo(5 + 1.4 + 0.5, 3);
  });

  it("timeline range over audio tracks transcribes each clip under the range", async () => {
    load(
      [track("ta", [clip("a1", "m_a", "ta", 0, 4), clip("a2", "m_b", "ta", 10, 4)])],
      [media("m_a", "audio"), media("m_b", "audio")],
    );
    render(<AutoCaptionPanel maxWordsPerLine={5} />);
    // no clip selected → range scope is the only one available
    fireEvent.click(screen.getByRole("button", { name: /generate captions/i }));
    await waitFor(() => expect(useProjectStore.getState().project.timeline.subtitles.length).toBe(2), { timeout: 4000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const starts = useProjectStore.getState().project.timeline.subtitles.map((s) => s.startTime).sort((x, y) => x - y);
    expect(starts[0]).toBeCloseTo(0.5, 3);
    expect(starts[1]).toBeCloseTo(10.5, 3);
  });

  it("shows the server's error and adds nothing", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "whisper-ctranslate2 not found" }), { status: 503 }));
    load([track("ta", [clip("a1", "m_a", "ta", 0, 4)])], [media("m_a", "audio")]);
    render(<AutoCaptionPanel clipId="a1" />);
    fireEvent.click(screen.getByRole("button", { name: /generate captions/i }));
    await screen.findByText(/whisper-ctranslate2 not found/, undefined, { timeout: 4000 });
    expect(useProjectStore.getState().project.timeline.subtitles).toHaveLength(0);
  });
});
