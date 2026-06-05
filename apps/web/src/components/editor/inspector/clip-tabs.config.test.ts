import { describe, it, expect } from "vitest";
import { getTabIdsForClipType, getTabsForClipType, TAB_DEFS } from "./clip-tabs.config";

describe("clip-tabs.config", () => {
  it("video has info plus all 7 media tabs in workflow order", () => {
    expect(getTabIdsForClipType("video")).toEqual([
      "info", "transform", "color", "effects", "audio", "speed", "animate", "ai",
    ]);
  });

  it("image has speed but no audio", () => {
    expect(getTabIdsForClipType("image")).toEqual([
      "info", "transform", "color", "effects", "speed", "animate", "ai",
    ]);
  });

  it("audio shows info, audio and ai", () => {
    expect(getTabIdsForClipType("audio")).toEqual(["info", "audio", "ai"]);
  });

  it("text/shape/svg share info/transform/style/effects/animate", () => {
    for (const t of ["text", "shape", "svg"] as const) {
      expect(getTabIdsForClipType(t)).toEqual(["info", "transform", "style", "effects", "animate"]);
    }
  });

  it("sticker has info/transform/effects/animate (no style/ai)", () => {
    expect(getTabIdsForClipType("sticker")).toEqual(["info", "transform", "effects", "animate"]);
  });

  it("null clip type yields no tabs", () => {
    expect(getTabIdsForClipType(null)).toEqual([]);
    expect(getTabsForClipType(null)).toEqual([]);
  });

  it("getTabsForClipType returns defs with labels and icons", () => {
    const defs = getTabsForClipType("video");
    expect(defs[0]).toMatchObject({ id: "info", label: "Info" });
    expect(defs[1]).toMatchObject({ id: "transform", label: "Transform" });
    expect(typeof defs[0].icon).toBe("object");
    expect(Object.keys(TAB_DEFS)).toHaveLength(9);
  });
});
