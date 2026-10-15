import type { SubtitleStyle } from "@openreel/core";

/**
 * Subtitle overlays are drawn in canvas pixels. The core presets are sized like UI text (22–32), which
 * is tiny on a 1080p video; the fork raised them ≈2.33× (24→56, 32→72). Scale with the canvas height.
 */
export const OVERLAY_FONT_SCALE_AT_1080P = 2.33;

export function scaleOverlayStyle(style: SubtitleStyle, canvasHeight: number): SubtitleStyle {
  const height = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : 1080;
  return { ...style, fontSize: Math.round(style.fontSize * (height / 1080) * OVERLAY_FONT_SCALE_AT_1080P) };
}
