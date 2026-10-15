/**
 * Framesmith Server Auto-Save Hook
 *
 * After OpenReel initialises from Framesmith, this hook watches for project
 * changes and debounces a POST to /api/episodes/{id}/s6/project so the
 * project state persists on the server.  On next load, useFramesmithInit
 * detects the saved file and restores the project instead of rebuilding from
 * scratch — preserving text overlays, subtitles, effects, and timing edits.
 *
 * External media blobs (files dragged in by the user, not from Framesmith)
 * are uploaded to /api/episodes/{id}/s6/media before saving so they get a
 * persistent originalUrl and survive page reloads.
 *
 * The parent s6_openreel.html can trigger an immediate save via postMessage:
 *   iframe.contentWindow.postMessage({ type: 'framesmith:save-now' }, '*')
 *
 * Only activates when framesmithEpisodeId is set (i.e. running inside a
 * Framesmith iframe).  No-ops in standalone / standalone OpenReel mode.
 */

import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/project-store";
import { useEngineStore } from "../stores/engine-store";
import { framesmithEpisodeId } from "./use-framesmith-init";
import type { MediaItem } from "@openreel/core";

const DEBOUNCE_MS = 5_000;

/** Upload a media blob to Framesmith and return the resulting URL, or null on failure. */
async function uploadMediaBlob(
  episodeId: string,
  item: MediaItem,
): Promise<string | null> {
  if (!item.blob) return null;
  try {
    const form = new FormData();
    form.append("file", item.blob, item.name || "upload");
    const res = await fetch(`/api/episodes/${episodeId}/s6/media`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      console.warn("[Framesmith] Media upload failed for", item.name, res.status);
      return null;
    }
    const { url } = await res.json() as { url: string };
    console.info("[Framesmith] Uploaded external media:", item.name, "→", url);
    return url;
  } catch (err) {
    console.warn("[Framesmith] Media upload error for", item.name, err);
    return null;
  }
}

async function doSave(episodeId: string): Promise<void> {
  const currentProject = useProjectStore.getState().project;
  if (!currentProject) return;

  const titleEngine    = useEngineStore.getState().getTitleEngine();
  const graphicsEngine = useEngineStore.getState().getGraphicsEngine();

  // Upload any external blobs that don't yet have a persistent server URL
  const itemsWithUrls = await Promise.all(
    currentProject.mediaLibrary.items.map(async (item) => {
      if (item.originalUrl) return item;                // already has a URL
      if (!item.blob)       return item;                // no blob to upload
      const url = await uploadMediaBlob(episodeId, item);
      if (!url) return item;
      return { ...item, originalUrl: url };
    })
  );

  // Strip binary data that can't be serialised to JSON
  const payload = {
    ...currentProject,
    textClips:    titleEngine?.getAllTextClips()       || [],
    shapeClips:   graphicsEngine?.getAllShapeClips()   || [],
    svgClips:     graphicsEngine?.getAllSVGClips()     || [],
    stickerClips: graphicsEngine?.getAllStickerClips() || [],
    mediaLibrary: {
      ...currentProject.mediaLibrary,
      items: itemsWithUrls.map((item) => ({
        ...item,
        blob:                null,
        thumbnailUrl:        null,
        filmstripThumbnails: undefined,
      })),
    },
  };

  const res = await fetch(`/api/episodes/${episodeId}/s6/project`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (res.ok) {
    console.info("[Framesmith] Project synced to server (episodeId=%s)", episodeId);
    // Notify parent window (Save button in s6_openreel.html)
    window.parent.postMessage({ type: "framesmith:saved" }, "*");
  } else {
    console.warn("[Framesmith] Server sync failed:", res.status);
    window.parent.postMessage({ type: "framesmith:save-error" }, "*");
  }
}

export function useFramesmithAutosave() {
  const project    = useProjectStore((s) => s.project);
  const modifiedAt = project?.modifiedAt;
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSynced = useRef<number>(0);

  // Debounced auto-save on project changes
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
      const current = useProjectStore.getState().project;
      if (!current) return;
      if (current.modifiedAt === lastSynced.current) return;

      try {
        await doSave(episodeId);
        lastSynced.current = current.modifiedAt ?? 0;
      } catch (err) {
        console.warn("[Framesmith] Auto-save error:", err);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [modifiedAt]);

  // Listen for save-now postMessage from parent s6_openreel.html
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== "framesmith:save-now") return;
      const episodeId = framesmithEpisodeId;
      if (!episodeId) return;
      try {
        await doSave(episodeId);
        const current = useProjectStore.getState().project;
        lastSynced.current = current?.modifiedAt ?? 0;
      } catch (err) {
        console.warn("[Framesmith] Manual save error:", err);
        window.parent.postMessage({ type: "framesmith:save-error" }, "*");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);
}
