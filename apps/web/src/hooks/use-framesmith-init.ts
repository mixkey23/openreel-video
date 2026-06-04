/**
 * Framesmith Bootstrap Hook
 *
 * When OpenReel is embedded by Framesmith (via iframe), this hook reads
 * the clip configuration from sessionStorage and auto-imports S5 clips
 * + per-beat audio into the timeline on first load.
 *
 * Framesmith sets sessionStorage['__framesmith_config__'] before opening the
 * iframe. This hook runs once on mount:
 * 1. Creates one video track + one audio track
 * 2. Imports all video clips at their start_time (skips if url is null)
 * 3. Imports beat-specific audio at the clip's start_time
 */

import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/project-store";

export const FRAMESMITH_STORAGE_KEY = "__framesmith_config__";

export interface FramesmithClip {
  id: string;
  url: string | null;
  duration: number;
  start_time?: number;
  audioUrl?: string | null;
  beat_id?: string;
  name?: string;
}

export interface FramesmithConfig {
  clips: FramesmithClip[];
  projectName?: string;
  episodeId?: string;
}

async function importAsset(
  url: string,
  filename: string,
  mimeType: string,
  importMedia: (file: File) => Promise<any>
): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

  const blob = await response.blob();
  const file = new File([blob], filename, { type: mimeType });
  const result = await importMedia(file);

  if (!result.success) {
    console.error(`[Framesmith] importMedia failed for ${filename}:`, result.error?.message);
    return null;
  }

  const items = useProjectStore.getState().project.mediaLibrary.items;
  const newItem = items[items.length - 1];
  return newItem?.id ?? null;
}

export function useFramesmithInit() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;

    const configStr = sessionStorage.getItem(FRAMESMITH_STORAGE_KEY);
    if (!configStr) return;

    initialized.current = true;

    let config: FramesmithConfig;
    try {
      config = JSON.parse(configStr);
    } catch {
      console.error("[Framesmith] Invalid config in sessionStorage");
      return;
    }

    // Keep config in sessionStorage until initialization is complete
    const { createNewProject, importMedia, addTrack, addClip } =
      useProjectStore.getState();

    createNewProject(config.projectName || "Framesmith Project", {
      width: 1920,
      height: 1080,
      frameRate: 30,
    });

    setTimeout(async () => {
      const clips = config.clips ?? [];
      console.log(`[Framesmith] Initializing timeline — ${clips.length} clips, episodeId=${config.episodeId}`);

      // ── Create tracks ──────────────────────────────────────────────────
      const videoTrackResult = await addTrack("video");
      const audioTrackResult = await addTrack("audio");

      if (!videoTrackResult.success || !audioTrackResult.success) {
        console.error("[Framesmith] Failed to create tracks");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }

      const videoTrackId = videoTrackResult.data?.id;
      const audioTrackId = audioTrackResult.data?.id;

      if (!videoTrackId || !audioTrackId) {
        console.error("[Framesmith] Track IDs missing after creation");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }

      console.log(`[Framesmith] Tracks created — video=${videoTrackId} audio=${audioTrackId}`);

      // ── Import video clips ─────────────────────────────────────────────
      let videosImported = 0;
      for (const clip of clips) {
        if (!clip.url) {
          console.log(`[Framesmith] Skip video ${clip.id} — pending`);
          continue;
        }
        try {
          const mediaId = await importAsset(
            clip.url,
            `${clip.id}.mp4`,
            "video/mp4",
            importMedia
          );
          if (mediaId) {
            const startTime = clip.start_time ?? 0;
            const r = await addClip(videoTrackId, mediaId, startTime);
            if (r.success) {
              console.log(`[Framesmith] Video ${clip.id} → track at ${startTime}s`);
              videosImported++;
            } else {
              console.error(`[Framesmith] addClip failed for video ${clip.id}`);
            }
          }
        } catch (err) {
          console.error(`[Framesmith] Error importing video ${clip.id}:`, err);
        }
      }

      // ── Import beat audio clips ────────────────────────────────────────
      // Deduplicate by beat_id (multiple shots can share a beat)
      const importedBeats = new Set<string>();
      let audioImported = 0;

      for (const clip of clips) {
        const beatId = clip.beat_id || "";
        if (!clip.audioUrl) {
          console.log(`[Framesmith] Skip audio ${clip.id} — no audioUrl`);
          continue;
        }
        if (importedBeats.has(beatId)) {
          console.log(`[Framesmith] Skip audio beat ${beatId} — already imported`);
          continue;
        }
        importedBeats.add(beatId);

        try {
          console.log(`[Framesmith] Fetching audio beat=${beatId} url=${clip.audioUrl}`);
          const mediaId = await importAsset(
            clip.audioUrl,
            `${beatId}.wav`,
            "audio/wav",
            importMedia
          );
          if (mediaId) {
            const startTime = clip.start_time ?? 0;
            const r = await addClip(audioTrackId, mediaId, startTime);
            if (r.success) {
              console.log(`[Framesmith] Audio beat=${beatId} → track at ${startTime}s`);
              audioImported++;
            } else {
              console.error(`[Framesmith] addClip failed for audio beat=${beatId}`);
            }
          }
        } catch (err) {
          console.error(`[Framesmith] Error importing audio beat=${beatId}:`, err);
        }
      }

      sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
      console.log(
        `[Framesmith] Done — ${videosImported} videos + ${audioImported} audio clips imported`
      );
    }, 800);
  }, []);
}
