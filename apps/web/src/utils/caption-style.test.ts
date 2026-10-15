import { describe, it, expect } from "vitest";
import { OVERLAY_PRESET_NAMES, overlayStyle, textClipStyle } from "./caption-style";

describe("overlayStyle (animated subtitles)", () => {
  it("uses the fork's 1080p sizes", () => {
    expect(overlayStyle("default", 1080).fontSize).toBe(56);
    expect(overlayStyle("bold", 1080).fontSize).toBe(72);
    expect(overlayStyle("minimal", 1080).fontSize).toBe(48);
  });
  it("scales with the canvas height and keeps the rest of the preset", () => {
    expect(overlayStyle("default", 1920).fontSize).toBe(Math.round(56 * (1920 / 1080)));
    expect(overlayStyle("centered", 1080)).toMatchObject({ position: "center", fontFamily: "Playfair Display" });
  });
  it("falls back to default for an unknown preset or a bad height", () => {
    expect(overlayStyle("nope", 0).fontSize).toBe(56);
  });
  it("lists the store's presets", () => {
    expect(OVERLAY_PRESET_NAMES).toEqual(expect.arrayContaining(["default", "bold", "centered", "elegant", "casual"]));
  });
});

describe("textClipStyle", () => {
  it("uses upstream's core presets untouched", () => {
    expect(textClipStyle("bold").fontSize).toBe(32);
    expect(textClipStyle("unknown")).toEqual(textClipStyle("default"));
  });
});
