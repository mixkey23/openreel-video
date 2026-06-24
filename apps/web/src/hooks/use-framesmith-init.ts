/**
 * Framesmith Bootstrap Hook
 *
 * When OpenReel is embedded by Framesmith (via iframe), this hook reads
 * the episode config from sessionStorage and loads the ViMax storyboard
 * timeline via the Framesmith API (/openreel/timeline).
 *
 * Config written by Framesmith before opening the iframe:
 *   sessionStorage['__framesmith_config__'] = { episodeId, apiBase, projectName? }
 *
 * On init:
 * 1. Fetch /api/episodes/{episodeId}/openreel/timeline
 * 2. Create a "Storyboard" image track + VimaxShotClips for each video clip
 * 3. Create an "Audio" track + import speech.wav clips
 */

import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/project-store";

export const FRAMESMITH_STORAGE_KEY = "__framesmith_config__";

export interface FramesmithConfig {
  episodeId: string;
  apiBase: string;      // e.g. "http://localhost:8000"
  projectName?: string;
}

// Legacy clip format (S5-era) kept for backward compat
export interface FramesmithClip {
  id: string;
  url: string | null;
  duration: number;
  start_time?: number;
  audioUrl?: string | null;
  audioDuration?: number | null;
  beat_id?: string;
  name?: string;
}

async function fetchAsFile(url: string, filename: string, mimeType: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const blob = await response.blob();
  return new File([blob], filename, { type: mimeType });
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
      createVimaxShotClip,
    } = useProjectStore.getState();

    createNewProject(config.projectName || "Framesmith Project", {
      width: 1920,
      height: 1080,
      frameRate: 24,
    });

    setTimeout(async () => {
      const { episodeId, apiBase } = config;
      console.log(`[Framesmith] Loading timeline for episode ${episodeId} from ${apiBase}`);

      // ── Fetch timeline from Framesmith ────────────────────────────────
      let timeline: {
        duration: number;
        fps: number;
        tracks: Array<{
          id: string;
          type: string;
          clips: Array<Record<string, unknown>>;
        }>;
      };

      try {
        const r = await fetch(`${apiBase}/api/episodes/${episodeId}/openreel/timeline`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        timeline = await r.json();
      } catch (err) {
        console.error("[Framesmith] Failed to fetch timeline:", err);
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }

      const videoTrackData = timeline.tracks.find((t) => t.id === "video");
      const audioTrackData = timeline.tracks.find((t) => t.id === "audio");

      // ── Create storyboard track (image type) ─────────────────────────
      const storyboardResult = await addTrack("image");
      if (!storyboardResult.success) {
        console.error("[Framesmith] Failed to create storyboard track");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }
      const storyboardTrack = useProjectStore
        .getState()
        .project.timeline.tracks
        .find((t) => t.type === "image");
      if (!storyboardTrack) {
        console.error("[Framesmith] Storyboard track not found after creation");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }

      // ── Create VimaxShotClips ─────────────────────────────────────────
      let shotsCreated = 0;
      for (const clip of videoTrackData?.clips ?? []) {
        createVimaxShotClip(storyboardTrack.id, Number(clip.start ?? 0), {
          shotIdx:       Number(clip.shot_idx ?? 0),
          ffDesc:        String(clip.ff_desc ?? ""),
          motionDesc:    clip.motion_desc ? String(clip.motion_desc) : undefined,
          variationType: (clip.variation_type as "small" | "medium" | "large") ?? "small",
          mode:          "i2v",
          frameUrl:      clip.frame_url ? `${apiBase}${clip.frame_url}` : undefined,
          audioUrl:      clip.audio_url  ? `${apiBase}${clip.audio_url}` : undefined,
          duration:      Number(clip.duration ?? 4),
        });
        shotsCreated++;
      }
      console.log(`[Framesmith] ${shotsCreated} ViMax shots added to storyboard track`);

      // ── Create audio track ────────────────────────────────────────────
      if (audioTrackData && audioTrackData.clips.length > 0) {
        const audioTrackResult = await addTrack("audio");
        if (!audioTrackResult.success) {
          console.warn("[Framesmith] Failed to create audio track — skipping audio");
        } else {
          const audioTrack = useProjectStore
            .getState()
            .project.timeline.tracks
            .find((t) => t.type === "audio");

          let audioImported = 0;
          for (const clip of audioTrackData.clips) {
            const audioUrl = clip.audio_url ? `${apiBase}${clip.audio_url}` : null;
            if (!audioUrl) continue;
            try {
              const file = await fetchAsFile(audioUrl, `shot_${clip.shot_idx}.wav`, "audio/wav");
              const importResult = await importMedia(file);
              if (!importResult.success) continue;
              const items = useProjectStore.getState().project.mediaLibrary.items;
              const mediaItem = items[items.length - 1];
              if (!mediaItem || !audioTrack) continue;
              await addClip(audioTrack.id, mediaItem.id, Number(clip.start ?? 0), Number(clip.duration ?? 2));
              audioImported++;
            } catch (err) {
              console.warn(`[Framesmith] Audio import failed for shot ${clip.shot_idx}:`, err);
            }
          }
          console.log(`[Framesmith] ${audioImported} audio clips imported`);
        }
      }

      sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
      console.log("[Framesmith] Init complete");
    }, 800);
  }, []);
}
