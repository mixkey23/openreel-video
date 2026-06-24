import React from "react";
import { useProjectStore } from "../../../stores/project-store";
import type { VimaxShotClip } from "@openreel/core";

interface Props {
  clip: VimaxShotClip;
}

export const VimaxShotInspector: React.FC<Props> = ({ clip }) => {
  const { updateVimaxShotClip } = useProjectStore();

  return (
    <div className="flex flex-col gap-3 p-3">
      {clip.frameUrl && (
        <div className="rounded overflow-hidden border border-white/10" style={{ aspectRatio: "16/9" }}>
          <img src={clip.frameUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex gap-1">
        <button
          className={`flex-1 rounded py-1 text-xs font-bold transition-colors ${clip.mode === "i2v" ? "bg-indigo-600 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
          onClick={() => updateVimaxShotClip(clip.id, { mode: "i2v" })}
        >
          Image + Prompt
        </button>
        <button
          className={`flex-1 rounded py-1 text-xs font-bold transition-colors ${clip.mode === "t2v" ? "bg-slate-600 text-white" : "bg-white/10 text-white/60 hover:bg-white/20"}`}
          onClick={() => updateVimaxShotClip(clip.id, { mode: "t2v" })}
        >
          Prompt Only
        </button>
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1 block">First Frame Prompt</label>
        <textarea
          className="w-full rounded bg-white/10 text-white text-xs p-2 resize-none border border-white/10 focus:border-indigo-400 outline-none"
          rows={4}
          value={clip.ffDesc}
          onChange={(e) => updateVimaxShotClip(clip.id, { ffDesc: e.target.value })}
        />
      </div>

      <div>
        <label className="text-xs text-white/50 mb-1 block">Motion / Camera</label>
        <textarea
          className="w-full rounded bg-white/10 text-white text-xs p-2 resize-none border border-white/10 focus:border-indigo-400 outline-none"
          rows={2}
          value={clip.motionDesc ?? ""}
          onChange={(e) => updateVimaxShotClip(clip.id, { motionDesc: e.target.value })}
        />
      </div>

      <div className="text-xs text-white/40 font-mono">
        Shot #{clip.shotIdx} · {clip.variationType ?? "—"}
      </div>
    </div>
  );
};
