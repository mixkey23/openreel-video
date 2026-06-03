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
 * 2. Imports all video clips and adds them at their start_time
 * 3. Imports beat-specific audio and adds it at the clip's start_time
 */

import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/project-store";

export const FRAMESMITH_STORAGE_KEY = "__framesmith_config__";

export interface FramesmithClip {
  id: string;
  url: string;
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

    const {
      createNewProject,
      importMedia,
      addTrack,
      addClip,
    } = useProjectStore.getState();

    createNewProject(config.projectName || "Framesmith Project", {
      width: 1920,
      height: 1080,
      frameRate: 30,
    });

    // Small delay to let the editor initialize before importing
    setTimeout(async () => {
      console.log(`[Framesmith] Setting up timeline for ${config.clips.length} clips...`);

      // Create video and audio tracks
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
        console.error("[Framesmith] Track IDs not found");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }

      console.log(`[Framesmith] Video track: ${videoTrackId}, Audio track: ${audioTrackId}`);

      // Map to track audio imports (beat_id -> mediaId)
      const audioImports: Record<string, string> = {};

      // Import all video clips
      for (const clip of config.clips) {
        try {
          console.log(`[Framesmith] Fetching video ${clip.id}...`);
          const response = await fetch(clip.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const blob = await response.blob();
          const file = new File([blob], `${clip.id}.mp4`, {
            type: "video/mp4",
          });

          const importResult = await importMedia(file);

          if (importResult.success) {
            const items = useProjectStore.getState().project.mediaLibrary.items;
            const newItem = items[items.length - 1];

            if (newItem) {
              const startTime = clip.start_time ?? 0;
              const addResult = await addClip(videoTrackId, newItem.id, startTime);

              if (addResult.success) {
                console.log(`[Framesmith] Added video clip ${clip.id} at ${startTime}s`);
              } else {
                console.error(`[Framesmith] Failed to add video clip ${clip.id}`);
              }
            }
          } else {
            console.error(
              `[Framesmith] Failed to import video ${clip.id}:`,
              importResult.error?.message
            );
          }
        } catch (err) {
          console.error(`[Framesmith] Error importing video ${clip.id}:`, err);
        }
      }

      // Import beat audio clips
      for (const clip of config.clips) {
        if (!clip.audioUrl || audioImports[clip.beat_id || ""]) {
          continue; // Skip if no audio or already imported this beat
        }

        try {
          console.log(`[Framesmith] Fetching audio for beat ${clip.beat_id}...`);
          const response = await fetch(clip.audioUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const blob = await response.blob();
          const file = new File([blob], `${clip.beat_id}.wav`, {
            type: "audio/wav",
          });

          const importResult = await importMedia(file);

          if (importResult.success) {
            const items = useProjectStore.getState().project.mediaLibrary.items;
            const newItem = items[items.length - 1];

            if (newItem) {
              audioImports[clip.beat_id || ""] = newItem.id;
              const startTime = clip.start_time ?? 0;
              const addResult = await addClip(audioTrackId, newItem.id, startTime);

              if (addResult.success) {
                console.log(`[Framesmith] Added audio ${clip.beat_id} at ${startTime}s`);
              } else {
                console.error(`[Framesmith] Failed to add audio ${clip.beat_id}`);
              }
            }
          } else {
            console.error(
              `[Framesmith] Failed to import audio ${clip.beat_id}:`,
              importResult.error?.message
            );
          }
        } catch (err) {
          console.error(`[Framesmith] Error importing audio ${clip.beat_id}:`, err);
        }
      }

      // Clear the init data so it doesn't reload on refresh
      sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
      console.log("[Framesmith] Initialization complete");
    }, 800);
  }, []);
}
