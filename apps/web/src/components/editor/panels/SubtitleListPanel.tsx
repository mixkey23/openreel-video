import React, { useState } from "react";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import { SUBTITLE_PRESETS } from "../../../stores/project/subtitle-helpers";
import type { SubtitleStyle } from "@openreel/core";

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
};

const PRESET_NAMES = Object.keys(SUBTITLE_PRESETS);

const BG_OPACITIES: Array<{ label: string; alpha: string }> = [
  { label: "None",  alpha: "transparent" },
  { label: "30%",   alpha: "0.3" },
  { label: "50%",   alpha: "0.5" },
  { label: "70%",   alpha: "0.7" },
  { label: "100%",  alpha: "1" },
];

function extractBgColor(bg: string): { hex: string; alpha: string } {
  if (!bg || bg === "transparent") return { hex: "#000000", alpha: "transparent" };
  const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) {
    const r = parseInt(m[1]).toString(16).padStart(2, "0");
    const g = parseInt(m[2]).toString(16).padStart(2, "0");
    const b = parseInt(m[3]).toString(16).padStart(2, "0");
    return { hex: `#${r}${g}${b}`, alpha: m[4] ?? "1" };
  }
  return { hex: bg, alpha: "1" };
}

function buildBgColor(hex: string, alpha: string): string {
  if (alpha === "transparent") return "transparent";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexFromColor(color: string): string {
  if (color?.startsWith("#")) return color;
  const m = color?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const r = parseInt(m[1]).toString(16).padStart(2, "0");
    const g = parseInt(m[2]).toString(16).padStart(2, "0");
    const b = parseInt(m[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return "#ffffff";
}

const DEFAULT_GLOBAL_STYLE: SubtitleStyle = {
  fontFamily:      "Inter",
  fontSize:        48,
  color:           "#ffffff",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  position:        "bottom",
  highlightColor:  "#ffff00",
};

function styleFromSubtitles(subtitles: ReturnType<typeof useProjectStore.getState>["project"]["timeline"]["subtitles"]): SubtitleStyle {
  const first = subtitles.find((s) => s.style);
  if (!first?.style) return DEFAULT_GLOBAL_STYLE;
  return { ...DEFAULT_GLOBAL_STYLE, ...first.style };
}

export const SubtitleListPanel: React.FC = () => {
  const subtitles      = useProjectStore((s) => s.project.timeline.subtitles);
  const removeSubtitle = useProjectStore((s) => s.removeSubtitle);
  const updateSubtitle = useProjectStore((s) => s.updateSubtitle);
  const applyPreset    = useProjectStore((s) => s.applySubtitleStylePreset);
  const select         = useUIStore((s) => s.select);
  const selectedItems  = useUIStore((s) => s.selectedItems);

  const [styleOpen, setStyleOpen] = useState(true);
  const [draft, setDraft]         = useState<SubtitleStyle>(() => styleFromSubtitles(subtitles));

  const { hex: bgHex, alpha: bgAlpha } = extractBgColor(draft.backgroundColor);

  const set_ = (patch: Partial<SubtitleStyle>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const applyToAll = () => {
    for (const sub of subtitles) {
      updateSubtitle(sub.id, { style: draft });
    }
  };

  const handlePreset = async (name: string) => {
    await applyPreset(name);
    // Sync draft to the newly applied style
    const updated = useProjectStore.getState().project.timeline.subtitles;
    setDraft(styleFromSubtitles(updated));
  };

  const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Global Style Section ─────────────────────────────────── */}
      <div className="shrink-0 border-b border-border">
        <button
          onClick={() => setStyleOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>Global Style</span>
          {styleOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {styleOpen && (
          <div className="px-3 pb-3 space-y-2.5">

            {/* Preset */}
            <div>
              <label className="text-[9px] text-text-muted uppercase tracking-wider block mb-1">Preset</label>
              <select
                className="w-full bg-background-secondary border border-border rounded px-2 py-1 text-[11px] text-text-primary"
                defaultValue=""
                onChange={(e) => { if (e.target.value) handlePreset(e.target.value); }}
              >
                <option value="" disabled>Apply preset…</option>
                {PRESET_NAMES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Position */}
            <div>
              <label className="text-[9px] text-text-muted uppercase tracking-wider block mb-1">Position</label>
              <div className="flex gap-1">
                {(["top", "center", "bottom"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => set_({ position: pos })}
                    className={`flex-1 py-1 rounded text-[10px] transition-colors ${
                      draft.position === pos
                        ? "bg-primary text-white font-medium"
                        : "bg-background-secondary border border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size + Text color */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[9px] text-text-muted uppercase tracking-wider block mb-1">Font Size</label>
                <input
                  type="number" min={12} max={200}
                  value={draft.fontSize}
                  onChange={(e) => set_({ fontSize: parseInt(e.target.value) || 48 })}
                  className="w-full bg-background-secondary border border-border rounded px-2 py-1 text-[11px] text-text-primary"
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-text-muted uppercase tracking-wider block mb-1">Text Color</label>
                <div className="flex gap-1 items-center">
                  <input
                    type="color"
                    value={hexFromColor(draft.color)}
                    onChange={(e) => set_({ color: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent p-0"
                  />
                  <span className="text-[10px] text-text-secondary font-mono">{hexFromColor(draft.color)}</span>
                </div>
              </div>
            </div>

            {/* Background */}
            <div>
              <label className="text-[9px] text-text-muted uppercase tracking-wider block mb-1">Background</label>
              <div className="flex gap-1 items-center">
                <input
                  type="color"
                  value={bgAlpha === "transparent" ? "#000000" : bgHex}
                  disabled={bgAlpha === "transparent"}
                  onChange={(e) => set_({ backgroundColor: buildBgColor(e.target.value, bgAlpha === "transparent" ? "0.5" : bgAlpha) })}
                  className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent p-0 disabled:opacity-30"
                />
                <select
                  value={bgAlpha}
                  onChange={(e) => set_({ backgroundColor: buildBgColor(bgHex, e.target.value) })}
                  className="flex-1 bg-background-secondary border border-border rounded px-1 py-1 text-[10px] text-text-primary"
                >
                  {BG_OPACITIES.map((o) => (
                    <option key={o.alpha} value={o.alpha}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Highlight color */}
            <div>
              <label className="text-[9px] text-text-muted uppercase tracking-wider block mb-1">Highlight Color</label>
              <div className="flex gap-1 items-center">
                <input
                  type="color"
                  value={draft.highlightColor ?? "#ffff00"}
                  onChange={(e) => set_({ highlightColor: e.target.value })}
                  className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent p-0"
                />
                <span className="text-[10px] text-text-secondary font-mono">{draft.highlightColor ?? "#ffff00"}</span>
              </div>
            </div>

            {/* Apply button */}
            <button
              onClick={applyToAll}
              disabled={subtitles.length === 0}
              className="w-full py-1.5 bg-primary hover:bg-primary/80 disabled:opacity-40 text-black rounded text-[11px] font-medium transition-colors"
            >
              Apply to All Subtitles
            </button>

          </div>
        )}
      </div>

      {/* ── Subtitle list ─────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 px-4 text-center">
          <p className="text-[11px] text-text-muted leading-relaxed">
            No subtitles yet. Generate captions from the AI tab.
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto min-h-0">
            {sorted.map((sub, index) => {
              const isSelected = selectedItems.some(
                (item) => item.type === "subtitle" && item.id === sub.id,
              );
              return (
                <div
                  key={sub.id}
                  onClick={() => select({ type: "subtitle", id: sub.id })}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer border-b border-border transition-colors ${
                    isSelected
                      ? "bg-primary/10 text-text-primary"
                      : "hover:bg-background-secondary text-text-primary"
                  }`}
                >
                  <span className="text-[10px] text-text-muted w-4 shrink-0 text-right">{index + 1}</span>
                  <span className="text-[10px] text-text-secondary shrink-0 font-mono">
                    {formatTime(sub.startTime)} → {formatTime(sub.endTime)}
                  </span>
                  <span className="flex-1 text-[11px] text-text-primary truncate min-w-0">{sub.text}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSubtitle(sub.id); }}
                    title="Remove subtitle"
                    className="shrink-0 p-0.5 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 px-3 py-2 border-t border-border">
            <button
              onClick={() => { for (const sub of subtitles) removeSubtitle(sub.id); }}
              className="w-full text-[10px] text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded px-2 py-1 transition-colors"
            >
              Clear All
            </button>
          </div>
        </>
      )}
    </div>
  );
};
