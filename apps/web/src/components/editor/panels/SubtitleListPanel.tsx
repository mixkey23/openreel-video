import React from "react";
import { Trash2 } from "lucide-react";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const truncateText = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
};

export const SubtitleListPanel: React.FC = () => {
  const subtitles = useProjectStore(
    (state) => state.project.timeline.subtitles,
  );
  const removeSubtitle = useProjectStore((state) => state.removeSubtitle);
  const select = useUIStore((state) => state.select);
  const selectedItems = useUIStore((state) => state.selectedItems);

  const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);

  const handleClearAll = () => {
    for (const sub of subtitles) {
      removeSubtitle(sub.id);
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <p className="text-[11px] text-text-muted leading-relaxed">
          No subtitles yet. Generate captions from the AI tab.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
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
                  ? "bg-accent-soft text-text-primary"
                  : "hover:bg-background-secondary text-text-primary"
              }`}
            >
              {/* Index */}
              <span className="text-[10px] text-text-muted w-4 shrink-0 text-right">
                {index + 1}
              </span>

              {/* Time range */}
              <span className="text-[10px] text-text-secondary shrink-0 font-mono">
                {formatTime(sub.startTime)} → {formatTime(sub.endTime)}
              </span>

              {/* Text */}
              <span className="flex-1 text-[11px] text-text-primary truncate min-w-0">
                {truncateText(sub.text, 40)}
              </span>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeSubtitle(sub.id);
                }}
                title="Remove subtitle"
                className="shrink-0 p-0.5 rounded text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Clear All footer */}
      <div className="shrink-0 px-3 py-2 border-t border-border">
        <button
          onClick={handleClearAll}
          className="w-full text-[10px] text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded px-2 py-1 transition-colors"
        >
          Clear All
        </button>
      </div>
    </div>
  );
};
