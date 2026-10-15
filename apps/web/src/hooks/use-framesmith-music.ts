/**
 * Framesmith Musical Director glue: applies `config.music` through the real project store and keeps the music clips
 * in step with their scenes. The decisions live in utils/framesmith-music.ts (pure, tested); this file only wires them
 * to the store and to the parent page.
 */
import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/project-store";
import { applyFramesmithMusic, type MusicStoreApi } from "../utils/framesmith-music-apply";
import { detectMusicSync, META_KEY, readMusicMeta, type Seen } from "../utils/framesmith-music";

export const MUSIC_CONFLICT_EVENT = "framesmith:music-conflict";

export function createStoreMusicApi(): MusicStoreApi {
  const st = () => useProjectStore.getState();
  return {
    getTracks: () => st().project.timeline.tracks,
    getMediaItems: () => st().project.mediaLibrary.items as Array<{ id: string; name: string }>,
    addTrack: async (type) => (await st().addTrack(type)).success,
    renameTrack: (id, name) => st().renameTrack(id, name),
    importMedia: async (file) => (await st().importMedia(file)).success,
    setMediaOriginalUrl: (mediaId, url) =>
      useProjectStore.setState((s) => ({
        project: {
          ...s.project,
          mediaLibrary: {
            ...s.project.mediaLibrary,
            items: s.project.mediaLibrary.items.map((it) => (it.id === mediaId ? { ...it, originalUrl: url } : it)),
          },
        },
      })),
    addClip: async (trackId, mediaId, start, duration) => (await st().addClip(trackId, mediaId, start, duration)).success,
    removeClip: async (clipId) => (await st().removeClip(clipId)).success,
    setClipAudioPlan: (clipId, plan) => st().setClipAudioPlan(clipId, plan),
  };
}

function notifyConflicts(conflicts: unknown): void {
  window.dispatchEvent(new CustomEvent(MUSIC_CONFLICT_EVENT, { detail: conflicts }));
  try {
    window.parent?.postMessage({ type: MUSIC_CONFLICT_EVENT, conflicts }, "*");
  } catch {
    /* cross-origin parent: ignore */
  }
}

/** Called by use-framesmith-init after the video clips are in (init) or the saved project is loaded (restore). */
export async function applyMusicToStore(music: unknown) {
  try {
    const report = await applyFramesmithMusic(music, createStoreMusicApi(), { onConflict: notifyConflicts });
    if (report.added.length || report.removed || report.skipped.length || report.conflicts.length) {
      console.warn("[Framesmith] Music applied", report);
    }
    return report;
  } catch (err) {
    console.error("[Framesmith] Music could not be applied (project left as it was):", err);
    return null;
  }
}

/**
 * Keeps music clips glued to their scenes and flags user edits. Idle unless the project holds Framesmith music clips.
 * Our own moves/flags re-trigger the subscription, which is harmless: the `seen` map already holds the new state.
 */
export function useFramesmithMusicSync() {
  const seenRef = useRef<Map<string, Seen>>(new Map());
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const run = async () => {
      if (busyRef.current) return;
      const { project, moveClip, setClipAudioPlan } = useProjectStore.getState();
      const tracks = project.timeline.tracks;
      if (!tracks.some((t) => t.clips.some((c) => readMusicMeta(c)))) {
        seenRef.current = new Map();
        return;
      }
      const res = detectMusicSync(seenRef.current, tracks, project.mediaLibrary.items as Array<{ id: string; name: string }>);
      seenRef.current = res.seen;
      if (!res.moves.length && !res.userEdited.length) return;
      busyRef.current = true;
      try {
        for (const m of res.moves) {
          await moveClip(m.clipId, m.startTime);
        }
        for (const id of res.userEdited) {
          const clip = useProjectStore.getState().project.timeline.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
          const meta = clip && readMusicMeta(clip);
          if (meta) setClipAudioPlan(id, { metadata: { [META_KEY]: { ...meta, userEdited: true } } });
        }
        // re-record positions after our own changes so they are not mistaken for user moves
        const after = useProjectStore.getState().project;
        seenRef.current = detectMusicSync(seenRef.current, after.timeline.tracks, after.mediaLibrary.items as Array<{ id: string; name: string }>).seen;
      } finally {
        busyRef.current = false;
      }
    };
    const unsubscribe = useProjectStore.subscribe(
      (state) => state.project.timeline.tracks,
      () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(run, 300);
      },
    );
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
