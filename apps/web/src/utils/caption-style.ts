import { SUBTITLE_STYLE_PRESETS, type SubtitleStyle } from "@openreel/core";
import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_PRESETS } from "../stores/project/subtitle-helpers";

/**
 * Two caption outputs, two preset families:
 *  - Animated subtitles (timeline.subtitles) are drawn in canvas pixels. Their presets (the store's
 *    SUBTITLE_PRESETS, sized by the fork for 1080p: default 56, bold 72…) scale with the canvas height.
 *  - Editable text clips use upstream's core presets as-is.
 */
export const OVERLAY_PRESET_NAMES: readonly string[] = Object.keys(SUBTITLE_PRESETS);
export const TEXT_CLIP_PRESET_NAMES: readonly string[] = ["default", "modern", "bold", "cinematic", "minimal"];

export function overlayStyle(presetName: string, canvasHeight: number): SubtitleStyle {
  const base = {
    ...DEFAULT_SUBTITLE_STYLE,
    ...(SUBTITLE_PRESETS[presetName] ?? SUBTITLE_PRESETS.default),
  } as SubtitleStyle;
  const height = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : 1080;
  return { ...base, fontSize: Math.round(base.fontSize * (height / 1080)) };
}

export function textClipStyle(presetName: string): SubtitleStyle {
  return SUBTITLE_STYLE_PRESETS[presetName] ?? SUBTITLE_STYLE_PRESETS.default;
}
