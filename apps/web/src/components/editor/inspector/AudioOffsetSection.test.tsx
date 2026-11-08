import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Project, Track, Clip } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { AudioOffsetSection } from "./AudioOffsetSection";

vi.mock("../../../services/auto-save", () => ({
  autoSaveManager: { startAutoSave: vi.fn(), stopAutoSave: vi.fn(), triggerSave: vi.fn(), getRecentSaves: vi.fn().mockResolvedValue([]), loadSave: vi.fn(), deleteSave: vi.fn() },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

const clip = (id: string, start: number): Clip =>
  ({ id, mediaId: "m", trackId: "ta", startTime: start, duration: 2, inPoint: 0, outPoint: 2, effects: [], audioEffects: [],
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 }, volume: 1, keyframes: [] }) as unknown as Clip;

function load(starts: number[]) {
  useProjectStore.getState().createNewProject();
  const base = useProjectStore.getState().project;
  const track = { id: "ta", type: "audio", name: "Audio", clips: starts.map((s, i) => clip(`c${i + 1}`, s)), transitions: [], locked: false, hidden: false, muted: false, solo: false } as unknown as Track;
  useProjectStore.getState().loadProject({ ...base, timeline: { ...base.timeline, tracks: [track] } } as Project);
}
const start = (id: string) => useProjectStore.getState().getClip(id)!.startTime;

describe("AudioOffsetSection", () => {
  beforeEach(() => load([1, 5]));

  it("+10 ms and −100 ms move only the selected clip, with ms precision", async () => {
    render(<AudioOffsetSection clipId="c1" />);
    fireEvent.click(screen.getByText("+10 ms"));
    await waitFor(() => expect(start("c1")).toBeCloseTo(1.01, 5));
    fireEvent.click(screen.getByText("−100 ms"));
    await waitFor(() => expect(start("c1")).toBeCloseTo(0.91, 5));
    expect(start("c2")).toBe(5);
  });

  it("never moves a clip before 0:00", async () => {
    load([0.05, 5]);
    render(<AudioOffsetSection clipId="c1" />);
    fireEvent.click(screen.getByText("−100 ms"));
    await waitFor(() => expect(start("c1")).toBeCloseTo(0, 5));
    expect(screen.getByText(/Limited to the start/)).toBeTruthy();
  });

  it("custom ms value moves the clip", async () => {
    render(<AudioOffsetSection clipId="c1" />);
    fireEvent.change(screen.getByLabelText("Offset in milliseconds"), { target: { value: "-250" } });
    fireEvent.click(screen.getByText("Move"));
    await waitFor(() => expect(start("c1")).toBeCloseTo(0.75, 5));
  });

  it("whole-track mode shifts every clip by the same amount and keeps spacing", async () => {
    render(<AudioOffsetSection clipId="c1" />);
    fireEvent.click(screen.getByLabelText(/Move all clips on this track/));
    fireEvent.click(screen.getByText("+100 ms"));
    await waitFor(() => expect(start("c2")).toBeCloseTo(5.1, 5));
    expect(start("c1")).toBeCloseTo(1.1, 5);
  });
});
