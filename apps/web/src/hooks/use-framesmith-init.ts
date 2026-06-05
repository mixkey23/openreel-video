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
  audioDuration?: number | null;
  beat_id?: string;
  name?: string;
}

export interface FramesmithConfig {
  clips: FramesmithClip[];
  projectName?: string;
  episodeId?: string;
  mode?: "init" | "restore";
}

/** Module-level episodeId so the auto-save hook can POST back to Framesmith. */
export let framesmithEpisodeId: string | null = null;

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

    // Persist episodeId for the auto-save sync hook
    if (config.episodeId) {
      framesmithEpisodeId = config.episodeId;
    }

    // ── RESTORE MODE: load previously saved OpenReel project ──────────
    if (config.mode === "restore" && config.episodeId) {
      sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
      console.log("[Framesmith] Restore mode — loading saved project for episode", config.episodeId);

      setTimeout(async () => {
        try {
          const res = await fetch(`/api/episodes/${config.episodeId}/s6/project`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const savedProject = await res.json();

          // Re-fetch media blobs from their originalUrl (blobs can't be serialized to JSON)
          const restoredItems = await Promise.all(
            (savedProject.mediaLibrary?.items ?? []).map(async (item: Record<string, unknown>) => {
              const originalUrl = item.originalUrl as string | undefined;
              if (!originalUrl) return item;
              try {
                const blobRes = await fetch(originalUrl);
                if (!blobRes.ok) return item;
                const blob = await blobRes.blob();
                return { ...item, blob, thumbnailUrl: null, filmstripThumbnails: undefined };
              } catch {
                return item;
              }
            })
          );

          const projectWithMedia = {
            ...savedProject,
            mediaLibrary: {
              ...savedProject.mediaLibrary,
              items: restoredItems,
            },
          };

          useProjectStore.getState().loadProject(projectWithMedia);
          console.log("[Framesmith] Restore complete — project loaded from server");
        } catch (err) {
          console.error("[Framesmith] Restore failed, falling back to fresh init:", err);
          // Fallback: re-run as fresh init by re-writing config without mode:restore
          const fallbackConfig = { ...config, mode: "init" as const };
          sessionStorage.setItem(FRAMESMITH_STORAGE_KEY, JSON.stringify(fallbackConfig));
          // Re-trigger init
          initialized.current = false;
        }
      }, 100);
      return;
    }

    const { createNewProject, importMedia, addTrack, addClip } =
      useProjectStore.getState();

    createNewProject(config.projectName || "Framesmith Project", {
      width: 1920,
      height: 1080,
      frameRate: 30,
    });

    setTimeout(async () => {
      const clips = config.clips ?? [];
      console.log(`[Framesmith] Initializing — ${clips.length} clips, episodeId=${config.episodeId}`);

      // ── Create video track ────────────────────────────────────────────
      const videoTrackResult = await addTrack("video");
      if (!videoTrackResult.success) {
        console.error("[Framesmith] Failed to create video track");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }
      // Read track ID from store (addTrack doesn't return it in ActionResult)
      const videoTrack = useProjectStore
        .getState()
        .project.timeline.tracks
        .find((t) => t.type === "video");

      if (!videoTrack) {
        console.error("[Framesmith] Video track not found after creation");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }

      // ── Create audio track ────────────────────────────────────────────
      const audioTrackResult = await addTrack("audio");
      if (!audioTrackResult.success) {
        console.error("[Framesmith] Failed to create audio track");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }
      const audioTrack = useProjectStore
        .getState()
        .project.timeline.tracks
        .find((t) => t.type === "audio");

      if (!audioTrack) {
        console.error("[Framesmith] Audio track not found after creation");
        sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
        return;
      }

      console.log(`[Framesmith] Tracks ready — video=${videoTrack.id} audio=${audioTrack.id}`);

      // ── Import video clips ────────────────────────────────────────────
      let videosImported = 0;
      for (const clip of clips) {
        if (!clip.url) {
          console.log(`[Framesmith] Skip video ${clip.id} — pending`);
          continue;
        }
        try {
          console.log(`[Framesmith] Fetching video ${clip.id}…`);
          const file = await fetchAsFile(clip.url, `${clip.id}.mp4`, "video/mp4");
          const importResult = await importMedia(file);
          if (!importResult.success) {
            console.error(`[Framesmith] importMedia failed for ${clip.id}:`, importResult.error?.message);
            continue;
          }
          const items = useProjectStore.getState().project.mediaLibrary.items;
          const mediaItem = items[items.length - 1];
          if (!mediaItem) continue;

          const startTime = clip.start_time ?? 0;
          const addResult = await addClip(videoTrack.id, mediaItem.id, startTime);
          if (addResult.success) {
            console.log(`[Framesmith] Video ${clip.id} → timeline at ${startTime}s`);
            videosImported++;
          } else {
            console.error(`[Framesmith] addClip failed for video ${clip.id}`);
          }
        } catch (err) {
          console.error(`[Framesmith] Error importing video ${clip.id}:`, err);
        }
      }

      // ── Import beat audio clips (deduplicated by beat_id) ─────────────
      const importedBeats = new Set<string>();
      let audioImported = 0;

      for (const clip of clips) {
        if (!clip.audioUrl) {
          continue;
        }
        const beatId = clip.beat_id || clip.id;
        if (importedBeats.has(beatId)) {
          continue;
        }
        importedBeats.add(beatId);

        try {
          console.log(`[Framesmith] Fetching audio beat=${beatId} url=${clip.audioUrl}`);
          const file = await fetchAsFile(clip.audioUrl, `${beatId}.wav`, "audio/wav");
          const importResult = await importMedia(file);
          if (!importResult.success) {
            console.error(`[Framesmith] importMedia failed for audio ${beatId}:`, importResult.error?.message);
            continue;
          }
          const items = useProjectStore.getState().project.mediaLibrary.items;
          const mediaItem = items[items.length - 1];
          if (!mediaItem) continue;

          const startTime = clip.start_time ?? 0;
          // Pass audioDuration explicitly so clip/add doesn't fall back to 5s default
          // when browser metadata detection is slow or unavailable.
          const audioDur = clip.audioDuration ?? undefined;
          const addResult = await addClip(audioTrack.id, mediaItem.id, startTime, audioDur);
          if (addResult.success) {
            console.log(`[Framesmith] Audio beat=${beatId} → timeline at ${startTime}s dur=${audioDur ?? "auto"}s`);
            audioImported++;
          } else {
            console.error(`[Framesmith] addClip failed for audio beat=${beatId}`);
          }
        } catch (err) {
          console.error(`[Framesmith] Error importing audio beat=${beatId}:`, err);
        }
      }

      sessionStorage.removeItem(FRAMESMITH_STORAGE_KEY);
      console.log(`[Framesmith] Done — ${videosImported} videos + ${audioImported} audio clips`);
    }, 800);
  }, []);
}
