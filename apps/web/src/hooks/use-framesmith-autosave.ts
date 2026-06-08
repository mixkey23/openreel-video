/**
 * Framesmith Server Auto-Save Hook
 *
 * After OpenReel initialises from Framesmith, this hook watches for project
 * changes and debounces a POST to /api/episodes/{id}/s6/project so the
 * project state persists on the server.  On next load, useFramesmithInit
 * detects the saved file and restores the project instead of rebuilding from
 * scratch — preserving text overlays, subtitles, effects, and timing edits.
 *
 * Only activates when framesmithEpisodeId is set (i.e. running inside a
 * Framesmith iframe).  No-ops in standalone / standalone OpenReel mode.
 */

import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/project-store";
import { useEngineStore } from "../stores/engine-store";
import { framesmithEpisodeId } from "./use-framesmith-init";

const DEBOUNCE_MS = 5_000;  // wait 5s after last change before posting

export function useFramesmithAutosave() {
  const project    = useProjectStore((s) => s.project);
  const modifiedAt = project?.modifiedAt;
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSynced = useRef<number>(0);

  useEffect(() => {
    if (!framesmithEpisodeId) {
      console.debug("[Framesmith] autosave skip — no episodeId yet");
      return;
    }
    if (!modifiedAt) return;
    if (modifiedAt === lastSynced.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const episodeId = framesmithEpisodeId;
      if (!episodeId) return;

      const currentProject = useProjectStore.getState().project;
      if (!currentProject) return;

      // Pull engine-side clip arrays that are NOT stored in the Zustand project
      // state — they live in their respective engine instances and must be
      // snapshotted here so loadProject() can restore them on next load.
      const titleEngine    = useEngineStore.getState().getTitleEngine();
      const graphicsEngine = useEngineStore.getState().getGraphicsEngine();

      // Strip binary blobs — they can't be serialised to JSON and will be
      // re-fetched from originalUrl on restore.
      const payload = {
        ...currentProject,
        textClips:    titleEngine?.getAllTextClips()          || [],
        shapeClips:   graphicsEngine?.getAllShapeClips()      || [],
        svgClips:     graphicsEngine?.getAllSVGClips()        || [],
        stickerClips: graphicsEngine?.getAllStickerClips()    || [],
        mediaLibrary: {
          ...currentProject.mediaLibrary,
          items: currentProject.mediaLibrary.items.map((item) => ({
            ...item,
            blob:                null,
            thumbnailUrl:        null,
            filmstripThumbnails: undefined,
          })),
        },
      };

      try {
        const res = await fetch(`/api/episodes/${episodeId}/s6/project`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        if (res.ok) {
          lastSynced.current = modifiedAt;
          console.info("[Framesmith] Project synced to server (episodeId=%s)", episodeId);
        } else {
          console.warn("[Framesmith] Server sync failed:", res.status);
        }
      } catch (err) {
        console.warn("[Framesmith] Server sync error:", err);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [modifiedAt]);
}
