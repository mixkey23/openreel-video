/**
 * Framesmith Bootstrap Hook
 *
 * When OpenReel is embedded by Framesmith (via iframe), this hook reads
 * the clip configuration from sessionStorage and auto-imports S5 clips
 * + episode audio into the timeline on first load.
 *
 * Framesmith sets sessionStorage['__framesmith_config__'] before opening the
 * iframe. This hook runs once on mount, fetches each clip URL, imports it, and
 * adds it to the timeline in order.
 */

import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/project-store";

export const FRAMESMITH_STORAGE_KEY = "__framesmith_config__";

export interface FramesmithClip {
  id: string;
  url: string;
  duration: number;
  name?: string;
}

export interface FramesmithConfig {
  clips: FramesmithClip[];
  audioUrl?: string | null;
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

    const { createNewProject, importMedia, addClipToNewTrack } =
      useProjectStore.getState();

    createNewProject(config.projectName || "Framesmith Project", {
      width: 1920,
      height: 1080,
      frameRate: 30,
    });

    // Small delay to let the editor initialize before importing
    setTimeout(async () => {
      console.log(
        `[Framesmith] Importing ${config.clips.length} clips...`,
      );

      let currentTime = 0;

      for (const clip of config.clips) {
        try {
          console.log(`[Framesmith] Fetching ${clip.id}...`);
          const response = await fetch(clip.url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const blob = await response.blob();
          const file = new File([blob], `${clip.id}.mp4`, {
            type: "video/mp4",
          });

          const result = await importMedia(file);

          if (result.success) {
            // The last item in the media library is the one just imported
            const items =
              useProjectStore.getState().project.mediaLibrary.items;
            const newItem = items[items.length - 1];

            if (newItem) {
              await addClipToNewTrack(newItem.id, currentTime);
              currentTime += clip.duration || 5;
              console.log(`[Framesmith] Added clip ${clip.id} at ${currentTime}s`);
            }
          } else {
            console.error(
              `[Framesmith] Failed to import ${clip.id}:`,
              result.error?.message,
            );
          }
        } catch (err) {
          console.error(`[Framesmith] Error importing ${clip.id}:`, err);
        }
      }

      // Import episode audio if provided
      if (config.audioUrl) {
        try {
          console.log("[Framesmith] Importing audio...");
          const response = await fetch(config.audioUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const blob = await response.blob();
          const ext = config.audioUrl.includes(".mp3") ? "mp3" : "wav";
          const file = new File([blob], `audio.${ext}`, {
            type: `audio/${ext}`,
          });

          const result = await importMedia(file);

          if (result.success) {
            const items =
              useProjectStore.getState().project.mediaLibrary.items;
            const newItem = items[items.length - 1];
            if (newItem) {
              await addClipToNewTrack(newItem.id, 0);
              console.log("[Framesmith] Audio imported and added to timeline");
            }
          }
        } catch (err) {
          console.error("[Framesmith] Error importing audio:", err);
        }
      }

      // Clear the init data so it doesn't reload on refresh
      sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
      console.log("[Framesmith] Initialization complete");
    }, 800);
  }, []);
}
