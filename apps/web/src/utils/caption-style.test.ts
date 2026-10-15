import { describe, it, expect } from "vitest";
import type { SubtitleStyle } from "@openreel/core";
import { scaleOverlayStyle } from "./caption-style";

const base: SubtitleStyle = { fontFamily: "Inter", fontSize: 24, color: "#fff", backgroundColor: "transparent", position: "bottom" };

describe("scaleOverlayStyle", () => {
  it("matches the fork's 1080p sizes (24 → 56, 32 → 75)", () => {
    expect(scaleOverlayStyle(base, 1080).fontSize).toBe(56);
    expect(scaleOverlayStyle({ ...base, fontSize: 32 }, 1080).fontSize).toBe(75);
  });
  it("scales with canvas height (vertical 1920 tall, 720p) and keeps other fields", () => {
    expect(scaleOverlayStyle(base, 1920).fontSize).toBe(Math.round(24 * (1920 / 1080) * 2.33));
    expect(scaleOverlayStyle(base, 720).fontSize).toBe(37);
    expect(scaleOverlayStyle(base, 1080)).toMatchObject({ fontFamily: "Inter", position: "bottom" });
  });
  it("falls back to 1080p for a bad height", () => {
    expect(scaleOverlayStyle(base, 0).fontSize).toBe(56);
  });
});
