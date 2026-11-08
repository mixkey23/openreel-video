import React, { useState } from "react";
import { ToolcraftButton as Button, ToolcraftText as Text } from "@openreel/ui";
import { useProjectStore } from "../../../stores/project-store";

const STEPS_MS = [100, 10, 1] as const;

interface AudioOffsetSectionProps {
  clipId: string;
}

/** Nudges an audio clip (or its whole track) earlier/later by milliseconds to fix A/V drift. */
export const AudioOffsetSection: React.FC<AudioOffsetSectionProps> = ({ clipId }) => {
  const track = useProjectStore((state) =>
    state.project.timeline.tracks.find((t) => t.clips.some((c) => c.id === clipId)),
  );
  const clip = track?.clips.find((c) => c.id === clipId);
  const [wholeTrack, setWholeTrack] = useState(false);
  const [customMs, setCustomMs] = useState("0");
  const [note, setNote] = useState<string | null>(null);

  if (!track || !clip) return null;

  const shift = async (deltaMs: number) => {
    const targets = wholeTrack ? track.clips : [clip];
    const earliest = Math.min(...targets.map((c) => c.startTime));
    // Never push a clip before 0:00; clamp the whole move so a track keeps its internal spacing.
    const allowedMs = Math.max(deltaMs, -Math.floor(earliest * 1000));
    setNote(allowedMs !== deltaMs ? "Limited to the start of the timeline (0:00)." : null);
    if (allowedMs === 0) return;
    const moves = targets.map((c) => ({
      clipId: c.id,
      startTime: Math.round((c.startTime + allowedMs / 1000) * 1000) / 1000,
    }));
    const result = await useProjectStore.getState().moveClips(moves);
    if (!result.success) setNote("Could not move the clip.");
  };

  const applyCustom = () => {
    const value = Number(customMs);
    if (Number.isFinite(value) && value !== 0) void shift(Math.round(value));
  };

  return (
    <div className="space-y-2">
      <Text type="supporting" color="secondary" className="block text-[10px]">
        Start: {Math.round(clip.startTime * 1000)} ms. Negative moves earlier, positive later.
      </Text>
      <div className="grid grid-cols-3 gap-1">
        {STEPS_MS.map((ms) => (
          <Button key={`-${ms}`} label={`−${ms} ms`} variant="secondary" size="sm" onClick={() => void shift(-ms)} />
        ))}
        {STEPS_MS.map((ms) => (
          <Button key={`+${ms}`} label={`+${ms} ms`} variant="secondary" size="sm" onClick={() => void shift(ms)} />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          step={1}
          aria-label="Offset in milliseconds"
          value={customMs}
          onChange={(event) => setCustomMs(event.target.value)}
          className="min-w-0 flex-1 bg-background-secondary border border-border rounded px-2 py-1 text-[11px] text-text-primary"
        />
        <span className="text-[10px] text-text-secondary">ms</span>
        <Button label="Move" variant="secondary" size="sm" onClick={applyCustom} />
      </div>
      <label className="flex items-center gap-2 text-[10px] text-text-secondary">
        <input type="checkbox" checked={wholeTrack} onChange={(event) => setWholeTrack(event.target.checked)} />
        Move all clips on this track ({track.clips.length})
      </label>
      {note && (
        <Text type="supporting" color="secondary" className="block text-[10px]">
          {note}
        </Text>
      )}
    </div>
  );
};
