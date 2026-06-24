import React, { useRef, useState } from "react";
import type { VimaxShotClip } from "@openreel/core";
import { useUIStore } from "../../../stores/ui-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { calculateSnap } from "./utils";

interface VimaxShotClipComponentProps {
  clip: VimaxShotClip;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: (clipId: string, addToSelection: boolean) => void;
  onMoveClip?: (clipId: string, newStartTime: number) => void;
}

export const VimaxShotClipComponent: React.FC<VimaxShotClipComponentProps> = ({
  clip,
  pixelsPerSecond,
  isSelected,
  onSelect,
  onMoveClip,
}) => {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const { snapSettings } = useUIStore();
  const { playheadPosition } = useTimelineStore();

  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;

  const handleClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || isDragging) return;
    e.stopPropagation();
    onSelect(clip.id, e.shiftKey || e.metaKey);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const rect = clipRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const offsetX = e.clientX - rect.left - left;
    setDragOffset(offsetX);

    const onMouseMove = (ev: MouseEvent) => {
      const newLeft = ev.clientX - rect.left - offsetX;
      let newStartTime = Math.max(0, newLeft / pixelsPerSecond);
      if (snapSettings.enabled) {
        newStartTime = calculateSnap(newStartTime, snapSettings, pixelsPerSecond, [playheadPosition]);
      }
      if (!isDragging) setIsDragging(true);
      onMoveClip?.(clip.id, newStartTime);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const modeColor = clip.mode === "i2v" ? "bg-indigo-600" : "bg-slate-600";

  return (
    <div
      ref={clipRef}
      className={`absolute top-0 h-full rounded overflow-hidden cursor-grab select-none border
        ${isSelected ? "border-indigo-400 ring-1 ring-indigo-400" : "border-indigo-800/60"}
        ${isDragging ? "cursor-grabbing opacity-80" : ""}`}
      style={{ left, width: Math.max(width, 2) }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Frame thumbnail */}
      {clip.frameUrl ? (
        <img
          src={clip.frameUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-70"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-indigo-950/60 flex items-center justify-center">
          <span className="text-indigo-400 text-lg">🎬</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

      {/* Top badges */}
      <div className="absolute top-1 left-1 flex gap-1 z-10">
        <span className="rounded bg-black/70 px-1 py-0.5 text-[9px] text-white font-mono leading-none">
          #{clip.shotIdx}
        </span>
        <span className={`rounded px-1 py-0.5 text-[9px] text-white font-bold leading-none ${modeColor}`}>
          {clip.mode.toUpperCase()}
        </span>
        {clip.variationType && (
          <span className="rounded bg-black/50 px-1 py-0.5 text-[9px] text-white/70 leading-none">
            {clip.variationType}
          </span>
        )}
      </div>

      {/* ff_desc preview */}
      {clip.ffDesc && width > 60 && (
        <div className="absolute bottom-1 left-1 right-1 z-10">
          <p className="text-[9px] text-white leading-tight line-clamp-2 drop-shadow">
            {clip.ffDesc}
          </p>
        </div>
      )}

      {/* Duration label */}
      {width > 40 && (
        <span className="absolute top-1 right-1 text-[9px] text-white/60 font-mono z-10">
          {clip.duration.toFixed(1)}s
        </span>
      )}
    </div>
  );
};
