import type { LucideIcon } from "lucide-react";
import { Move, Palette, Wand2, Volume2, Gauge, Film, Sparkles, Type, Info } from "lucide-react";

export type InspectorTabId =
  | "transform"
  | "color"
  | "effects"
  | "audio"
  | "speed"
  | "animate"
  | "ai"
  | "style"
  | "info";

export type InspectorClipType =
  | "video"
  | "image"
  | "audio"
  | "text"
  | "shape"
  | "svg"
  | "sticker";

export interface InspectorTabDef {
  id: InspectorTabId;
  label: string;
  icon: LucideIcon;
}

export const TAB_DEFS: Record<InspectorTabId, InspectorTabDef> = {
  transform: { id: "transform", label: "Transform", icon: Move },
  color: { id: "color", label: "Color", icon: Palette },
  effects: { id: "effects", label: "Effects", icon: Wand2 },
  audio: { id: "audio", label: "Audio", icon: Volume2 },
  speed: { id: "speed", label: "Speed", icon: Gauge },
  animate: { id: "animate", label: "Animate", icon: Film },
  ai: { id: "ai", label: "AI", icon: Sparkles },
  style: { id: "style", label: "Style", icon: Type },
  info:  { id: "info",  label: "Info",  icon: Info  },
};

const TABS_BY_CLIP_TYPE: Record<InspectorClipType, InspectorTabId[]> = {
  video:   ["info", "transform", "color", "effects", "audio", "speed", "animate", "ai"],
  image:   ["info", "transform", "color", "effects", "speed", "animate", "ai"],
  audio:   ["info", "audio", "ai"],
  text:    ["info", "transform", "style", "effects", "animate"],
  shape:   ["info", "transform", "style", "effects", "animate"],
  svg:     ["info", "transform", "style", "effects", "animate"],
  sticker: ["info", "transform", "effects", "animate"],
};

export function getTabIdsForClipType(
  clipType: InspectorClipType | null,
): InspectorTabId[] {
  if (!clipType) return [];
  return TABS_BY_CLIP_TYPE[clipType];
}

export function getTabsForClipType(
  clipType: InspectorClipType | null,
): InspectorTabDef[] {
  return getTabIdsForClipType(clipType).map((id) => TAB_DEFS[id]);
}
