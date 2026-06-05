import React from "react";
import type { Clip, MediaItem } from "@openreel/core";

interface InfoTabProps {
  clip: Clip;
  mediaItem: MediaItem | null;
  trackName: string;
  trackType: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-[10px] text-text-secondary shrink-0">{label}</span>
      <span className="text-[10px] text-text-primary text-right break-all">{value}</span>
    </div>
  );
}

export const InfoTab: React.FC<InfoTabProps> = ({ clip, mediaItem, trackName, trackType }) => {
  const meta = mediaItem?.metadata;
  const endTime = clip.startTime + clip.duration;
  const trimmed = clip.outPoint - clip.inPoint !== clip.duration;

  return (
    <div className="space-y-3 p-1">
      <section>
        <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1.5 font-semibold">Clip</p>
        <div className="bg-background-secondary rounded-lg px-3 py-0.5">
          <Row label="Track" value={`${trackName} (${trackType})`} />
          <Row label="Start" value={formatTime(clip.startTime)} />
          <Row label="End" value={formatTime(endTime)} />
          <Row label="Duration" value={formatTime(clip.duration)} />
          {clip.speed !== undefined && clip.speed !== 1 && (
            <Row label="Speed" value={`${clip.speed}×`} />
          )}
          {clip.reversed && <Row label="Reversed" value="Yes" />}
          {trimmed && (
            <>
              <Row label="In Point" value={formatTime(clip.inPoint)} />
              <Row label="Out Point" value={formatTime(clip.outPoint)} />
            </>
          )}
          <Row label="Volume" value={`${Math.round(clip.volume * 100)}%`} />
        </div>
      </section>

      {mediaItem && (
        <section>
          <p className="text-[9px] uppercase tracking-widest text-text-muted mb-1.5 font-semibold">Media</p>
          <div className="bg-background-secondary rounded-lg px-3 py-0.5">
            <Row label="Name" value={mediaItem.name} />
            <Row label="Type" value={mediaItem.type} />
            {meta && (
              <>
                {meta.duration > 0 && (
                  <Row label="File Duration" value={formatTime(meta.duration)} />
                )}
                {(meta.width > 0 || meta.height > 0) && (
                  <Row label="Resolution" value={`${meta.width} × ${meta.height}`} />
                )}
                {meta.frameRate > 0 && (
                  <Row label="Frame Rate" value={`${meta.frameRate} fps`} />
                )}
                {meta.codec && (
                  <Row label="Codec" value={meta.codec} />
                )}
                {meta.sampleRate > 0 && (
                  <Row label="Sample Rate" value={`${meta.sampleRate} Hz`} />
                )}
                {meta.channels > 0 && (
                  <Row label="Channels" value={meta.channels === 1 ? "Mono" : meta.channels === 2 ? "Stereo" : `${meta.channels}ch`} />
                )}
                {meta.fileSize > 0 && (
                  <Row label="File Size" value={formatBytes(meta.fileSize)} />
                )}
              </>
            )}
            {mediaItem.originalUrl && (
              <Row
                label="Source URL"
                value={
                  <span className="truncate max-w-[140px] inline-block" title={mediaItem.originalUrl}>
                    {mediaItem.originalUrl.split("/").pop() || mediaItem.originalUrl}
                  </span>
                }
              />
            )}
          </div>
        </section>
      )}

      <p className="text-[9px] text-text-muted text-center pb-1">Clip ID: {clip.id.slice(0, 8)}…</p>
    </div>
  );
};
