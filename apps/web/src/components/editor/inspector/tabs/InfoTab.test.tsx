import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Clip, MediaItem } from "@openreel/core";
import { InfoTab } from "./InfoTab";

const clip = (extra: Partial<Clip> = {}): Clip =>
  ({ id: "c1", mediaId: "m1", trackId: "t1", startTime: 5, duration: 10, inPoint: 0, outPoint: 10, volume: 0.8, effects: [], audioEffects: [], keyframes: [], ...extra }) as unknown as Clip;
const media = (extra: Record<string, unknown> = {}): MediaItem =>
  ({ id: "m1", name: "scene_001.mp4", type: "video", blob: null, metadata: { duration: 60, width: 1920, height: 1080, frameRate: 30, codec: "h264", sampleRate: 48000, channels: 2, fileSize: 2_500_000 }, ...extra }) as unknown as MediaItem;

describe("InfoTab", () => {
  it("shows clip timing and media metadata, including the Framesmith source URL", () => {
    render(<InfoTab clip={clip()} mediaItem={media({ originalUrl: "/assets/s5/scene_001.mp4" })} trackName="Video 1" trackType="video" />);
    expect(screen.getByText("Video 1 (video)")).toBeInTheDocument();
    expect(screen.getByText("1920 × 1080")).toBeInTheDocument();
    expect(screen.getByText("30 fps")).toBeInTheDocument();
    expect(screen.getByText("2.5 MB")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Source URL")).toBeInTheDocument();
  });

  it("shows in/out points only when the clip is trimmed, and speed/reversed only when set", () => {
    const { rerender } = render(<InfoTab clip={clip()} mediaItem={media()} trackName="V" trackType="video" />);
    expect(screen.queryByText("In Point")).toBeNull();
    expect(screen.queryByText("Speed")).toBeNull();
    rerender(<InfoTab clip={clip({ inPoint: 10, outPoint: 25, speed: 1.5, reversed: true })} mediaItem={media()} trackName="V" trackType="video" />);
    expect(screen.getByText("In Point")).toBeInTheDocument();
    expect(screen.getByText("Out Point")).toBeInTheDocument();
    expect(screen.getByText("1.5×")).toBeInTheDocument();
    expect(screen.getByText("Reversed")).toBeInTheDocument();
  });

  it("works without media (e.g. text clips)", () => {
    render(<InfoTab clip={clip()} mediaItem={null} trackName="Text" trackType="text" />);
    expect(screen.queryByText("Resolution")).toBeNull();
    expect(screen.getByText("Track")).toBeInTheDocument();
  });
});
