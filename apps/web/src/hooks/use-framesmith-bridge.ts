/**
 * Framesmith WebSocket Bridge
 *
 * Bidirectional sync between OpenReel and Framesmith:
 *   - User moves/trims a clip → debounced 500ms → send clip:changed to Framesmith
 *   - Framesmith cascades timeline → sends timeline:synced → OpenReel repositions clips
 *
 * Activation: parent page (s6_openreel.html) writes WS URL to sessionStorage
 * under key '__framesmith_ws_url__' before the iframe loads.
 *
 * Loop prevention: module-level _applying flag blocks outbound messages
 * while applyServerTimeline() repositions clips from server data.
 */

import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/project-store";

export const FRAMESMITH_WS_URL_KEY = "__framesmith_ws_url__";

interface ShotEntry {
  shot_id: string;
  start_time: number;
  duration: number;
  end_time: number;
}

// Blocks outbound clip:changed while we apply server-driven repositions
let _applying = false;

function getShotId(mediaId: string): string | null {
  const items = useProjectStore.getState().project.mediaLibrary.items as Array<{
    id: string;
    name: string;
  }>;
  const item = items.find((m) => m.id === mediaId);
  if (!item) return null;
  // Clips imported as "{shot_id}.mp4" by use-framesmith-init.ts
  return item.name.replace(/\.mp4$/i, "") || null;
}

function sendVideoClips(
  tracks: Array<{
    type: string;
    clips: Array<{ id: string; mediaId: string; startTime: number; duration: number }>;
  }>,
  ws: WebSocket,
): void {
  if (_applying || ws.readyState !== WebSocket.OPEN) return;

  for (const track of tracks) {
    if (track.type !== "video") continue;
    for (const clip of track.clips) {
      const shotId = getShotId(clip.mediaId);
      if (!shotId) continue;
      ws.send(
        JSON.stringify({
          type: "clip:changed",
          shot_id: shotId,
          start_time: Math.round(clip.startTime * 1000) / 1000,
          duration: Math.round(clip.duration * 1000) / 1000,
        }),
      );
    }
  }
}

async function applyServerTimeline(shots: ShotEntry[]): Promise<void> {
  if (!shots?.length) return;
  _applying = true;
  try {
    const { project, moveClip } = useProjectStore.getState();
    const mediaItems = project.mediaLibrary.items as Array<{ id: string; name: string }>;

    for (const shot of shots) {
      for (const track of project.timeline.tracks) {
        if (track.type !== "video") continue;
        for (const clip of track.clips) {
          const item = mediaItems.find((m) => m.id === clip.mediaId);
          const clipShotId = item ? item.name.replace(/\.mp4$/i, "") : null;
          if (clipShotId !== shot.shot_id) continue;

          if (Math.abs(clip.startTime - shot.start_time) > 0.05) {
            await moveClip(clip.id, shot.start_time);
            console.log(
              `[Framesmith Bridge] Synced ${shot.shot_id} → ${shot.start_time.toFixed(2)}s`,
            );
          }
          break;
        }
      }
    }
  } finally {
    // Let the store settle before re-enabling outbound messages
    setTimeout(() => { _applying = false; }, 200);
  }
}

export function useFramesmithBridge() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const wsUrl = sessionStorage.getItem(FRAMESMITH_WS_URL_KEY);
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log("[Framesmith Bridge] Connected");
    ws.onclose = () => console.log("[Framesmith Bridge] Closed");
    ws.onerror = (e) => console.error("[Framesmith Bridge] Error:", e);

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          shots?: ShotEntry[];
        };
        if (
          (msg.type === "timeline:synced" || msg.type === "timeline:init") &&
          msg.shots
        ) {
          applyServerTimeline(msg.shots);
        }
      } catch (err) {
        console.error("[Framesmith Bridge] Bad message:", err);
      }
    };

    const unsubscribe = useProjectStore.subscribe(
      (state) => state.project.timeline.tracks,
      (tracks) => {
        if (_applying) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => sendVideoClips(tracks, ws), 500);
      },
    );

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      ws.close();
    };
  }, []);
}
