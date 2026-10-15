import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Project, Subtitle } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import { SubtitleListPanel } from "./SubtitleListPanel";

vi.mock("../../../services/auto-save", () => ({
  autoSaveManager: { startAutoSave: vi.fn(), stopAutoSave: vi.fn(), triggerSave: vi.fn(), getRecentSaves: vi.fn().mockResolvedValue([]), loadSave: vi.fn(), deleteSave: vi.fn() },
  initializeAutoSave: vi.fn().mockResolvedValue(undefined),
}));

const sub = (id: string, text: string, start: number, end: number): Subtitle => ({ id, text, startTime: start, endTime: end });

function load(subtitles: Subtitle[], height = 1080) {
  useProjectStore.getState().createNewProject("t");
  const base = useProjectStore.getState().project;
  const project: Project = {
    ...base,
    settings: { ...base.settings, height },
    timeline: { ...base.timeline, subtitles },
  };
  useProjectStore.getState().loadProject(project);
}
const subs = () => useProjectStore.getState().project.timeline.subtitles;

describe("SubtitleListPanel (animated subtitles)", () => {
  beforeEach(() => {
    load([sub("s2", "second line", 5, 7), sub("s1", "first line", 1.5, 3)]);
    useUIStore.getState().clearSelection();
  });

  it("lists subtitles sorted by start time with centisecond timestamps", () => {
    render(<SubtitleListPanel />);
    const first = screen.getByText("first line");
    const second = screen.getByText("second line");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(/00:00:01\.50/).length).toBeGreaterThan(0);
  });

  it("clicking a row selects that subtitle", () => {
    render(<SubtitleListPanel />);
    fireEvent.click(screen.getByText("second line"));
    expect(useUIStore.getState().selectedItems).toEqual([expect.objectContaining({ type: "subtitle", id: "s2" })]);
  });

  it("a preset restyles the listed subtitles (not the Captions text clips), in one undoable step", async () => {
    render(<SubtitleListPanel />);
    const select = screen.getByDisplayValue("Apply preset…") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "bold" } });
    await waitFor(() => expect(subs().every((s) => s.style?.fontSize === 72)).toBe(true));
    expect(subs().every((s) => s.style?.fontFamily === "Bebas Neue")).toBe(true);
    expect(useProjectStore.getState().canUndo()).toBe(true);
    useProjectStore.getState().undo();
    await waitFor(() => expect(subs().some((s) => s.style?.fontSize === 72)).toBe(false));
  });

  it("presets scale with the canvas height", async () => {
    load([sub("s1", "x", 0, 1)], 1920);
    render(<SubtitleListPanel />);
    fireEvent.change(screen.getByDisplayValue("Apply preset…"), { target: { value: "default" } });
    await waitFor(() => expect(subs()[0].style?.fontSize).toBe(Math.round(56 * (1920 / 1080))));
  });

  it("'Apply to All' applies the draft style to every subtitle at once", async () => {
    render(<SubtitleListPanel />);
    fireEvent.click(screen.getByRole("button", { name: /apply to all/i }));
    await waitFor(() => expect(subs().every((s) => Boolean(s.style))).toBe(true));
    expect(new Set(subs().map((s) => JSON.stringify(s.style))).size).toBe(1);
  });

  it("'Clear All' removes every subtitle (no lost removals)", async () => {
    load(Array.from({ length: 8 }, (_, i) => sub(`s${i}`, `line ${i}`, i, i + 0.5)));
    render(<SubtitleListPanel />);
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    await waitFor(() => expect(subs()).toHaveLength(0));
  });

  it("the row delete button removes just that subtitle", async () => {
    render(<SubtitleListPanel />);
    fireEvent.click(screen.getAllByTitle("Remove subtitle")[0]);
    await waitFor(() => expect(subs()).toHaveLength(1));
    expect(subs()[0].id).toBe("s2"); // the first row (s1, earliest) was removed
  });
});
