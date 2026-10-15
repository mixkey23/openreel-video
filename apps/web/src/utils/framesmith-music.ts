/**
 * Framesmith "Musical Director" track — pure logic (no store, no DOM), so it can be unit-tested.
 *
 * Contract (Framesmith docs/architecture/musical-director/08-s6-post-integration.md §2):
 *   config.music = { version, track_name, clips: [{ cue_id, scene_id, offset_in_scene_s, duration_s, url,
 *                    gain, fade:{fadeIn,fadeOut}, automation_volume:[{time,value}] }] }
 * - Framesmith owns exactly one audio track, found by its NAME, and the clips on it that carry
 *   `clip.metadata.framesmithMusic`. Nothing else in the project is ever touched.
 * - A cue FOLLOWS its scene: its timeline position is (start of the scene's video clip) + offset_in_scene_s.
 * - Automation `time` is clip-relative seconds, `value` a linear gain clamped to 0..4 (OpenReel's range).
 * - Anything the user changes on a music clip marks it `userEdited`; a new plan version never overwrites
 *   those clips (it reports a conflict instead).
 */
import type { AutomationPoint, Clip, Track } from "@openreel/core";

export const MUSIC_MEDIA_PREFIX = "music__";
export const MAX_GAIN = 4;
export const MOVE_EPS_S = 0.02;
export const META_KEY = "framesmithMusic";

export interface FramesmithMusicClip {
  cue_id: string;
  scene_id: string;
  offset_in_scene_s: number;
  duration_s: number;
  url: string;
  gain?: number;
  fade?: { fadeIn: number; fadeOut: number };
  automation_volume?: Array<{ time: number; value: number }>;
  status?: string;
  /** Absolute scene start at plan time; only a fallback when the scene's video clip is not in the project. */
  scene_start_s?: number;
  /** Per-layer delivery modes: the layer this clip carries and the track it belongs on (defaults to music.track_name). */
  layer_id?: string;
  track_name?: string;
}

export interface FramesmithMusic {
  version: string;
  track_name: string;
  delivery_mode?: string;
  sample_rate?: number;
  clips: FramesmithMusicClip[];
}

export interface AppliedSnapshot {
  duration: number;
  volume: number;
  fade: { fadeIn: number; fadeOut: number };
  automationKey: string;
  offset: number;
  sceneId: string;
}

export interface MusicClipMeta {
  cue_id: string;
  version: string;
  userEdited: boolean;
  applied: AppliedSnapshot;
}

type MediaLike = { id: string; name: string };

export function musicMediaName(cueId: string): string {
  return `${MUSIC_MEDIA_PREFIX}${cueId}.wav`;
}

export function cueIdFromMediaName(name: string): string | null {
  if (!name.startsWith(MUSIC_MEDIA_PREFIX)) return null;
  const id = name.slice(MUSIC_MEDIA_PREFIX.length).replace(/\.wav$/i, "");
  return id || null;
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Sorted, finite, clamped to 0..MAX_GAIN, one point per time (the last wins). */
export function sanitizeAutomation(points: ReadonlyArray<{ time: number; value: number }> | undefined): AutomationPoint[] {
  const ok = (points ?? []).filter((p) => p && Number.isFinite(p.time) && Number.isFinite(p.value) && p.time >= 0);
  ok.sort((a, b) => a.time - b.time);
  const out: AutomationPoint[] = [];
  for (const p of ok) {
    const point = { time: Math.round(p.time * 1e6) / 1e6, value: Math.min(MAX_GAIN, Math.max(0, p.value)) };
    if (out.length && Math.abs(out[out.length - 1].time - point.time) < 1e-9) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

export function automationKey(points: ReadonlyArray<{ time: number; value: number }> | undefined): string {
  return JSON.stringify((points ?? []).map((p) => [Math.round(p.time * 1e4) / 1e4, Math.round(p.value * 1e4) / 1e4]));
}

export function readMusicMeta(clip: Pick<Clip, "metadata">): MusicClipMeta | null {
  const m = (clip.metadata as Record<string, unknown> | undefined)?.[META_KEY] as Partial<MusicClipMeta> | undefined;
  if (!m || typeof m.cue_id !== "string" || !m.applied) return null;
  return m as MusicClipMeta;
}

export function buildMeta(c: FramesmithMusicClip, version: string): MusicClipMeta {
  const fade = { fadeIn: num(c.fade?.fadeIn), fadeOut: num(c.fade?.fadeOut) };
  const auto = sanitizeAutomation(c.automation_volume);
  return {
    cue_id: c.cue_id, version, userEdited: false,
    applied: { duration: c.duration_s, volume: num(c.gain, 1), fade, automationKey: automationKey(auto), offset: num(c.offset_in_scene_s), sceneId: c.scene_id },
  };
}

export function isValidMusic(m: unknown): m is FramesmithMusic {
  const x = m as FramesmithMusic | null;
  return !!x && typeof x === "object" && typeof x.track_name === "string" && x.track_name.length > 0 && typeof x.version === "string" &&
    Array.isArray(x.clips);
}

/** Cues that can be placed: all fields present and a finite, positive duration. Others are skipped (never fatal). */
export function usableCues(music: FramesmithMusic): FramesmithMusicClip[] {
  return music.clips.filter((c) =>
    c && typeof c.cue_id === "string" && c.cue_id && typeof c.url === "string" && c.url && typeof c.scene_id === "string" &&
    Number.isFinite(c.duration_s) && c.duration_s > 0 && Number.isFinite(c.offset_in_scene_s ?? 0) && (c.status === undefined || c.status === "ok"));
}

export interface MergePlan {
  unchanged: boolean;
  /** clip ids (Framesmith-owned, not user-edited) to remove before re-adding */
  removeClipIds: string[];
  /** cues to import and place */
  add: FramesmithMusicClip[];
  /** user-edited clips that the new plan would have replaced: kept, and reported */
  conflicts: Array<{ cue_id: string; clipId: string; reason: "changed" | "removed" }>;
}

/** Track a cue belongs on: its own `track_name` (per-layer delivery) or the feed's single track. */
export function trackNameFor(cue: Pick<FramesmithMusicClip, "track_name">, music: Pick<FramesmithMusic, "track_name">): string {
  return cue.track_name || music.track_name;
}

/** Idempotent merge rule (08 §2.2). `tracks` are the Framesmith-owned tracks as saved in the project (none, one, or one per layer). */
export function planMusicMerge(tracks: Pick<Track, "clips"> | ReadonlyArray<Pick<Track, "clips">> | undefined, music: FramesmithMusic): MergePlan {
  const track = tracks === undefined ? [] : Array.isArray(tracks) ? tracks : [tracks as Pick<Track, "clips">];
  const wanted = usableCues(music);
  const owned = track.flatMap((t) => t.clips).map((c) => ({ clip: c, meta: readMusicMeta(c) })).filter((x): x is { clip: Clip; meta: MusicClipMeta } => !!x.meta);

  const sameSet = owned.length === wanted.length && wanted.every((w) => owned.some((o) => o.meta.cue_id === w.cue_id));
  if (track.length > 0 && sameSet && owned.every((o) => o.meta.version === music.version)) {
    return { unchanged: true, removeClipIds: [], add: [], conflicts: [] };
  }

  const removeClipIds: string[] = [];
  const conflicts: MergePlan["conflicts"] = [];
  const keptCues = new Set<string>();
  const wantedIds = new Set(wanted.map((w) => w.cue_id));
  for (const o of owned) {
    if (o.meta.userEdited) {
      keptCues.add(o.meta.cue_id);
      conflicts.push({ cue_id: o.meta.cue_id, clipId: o.clip.id, reason: wantedIds.has(o.meta.cue_id) ? "changed" : "removed" });
    } else {
      removeClipIds.push(o.clip.id);
    }
  }
  return { unchanged: false, removeClipIds, add: wanted.filter((w) => !keptCues.has(w.cue_id)), conflicts };
}

/** scene id → start time of its video clip on the timeline (video clips are imported as "{scene_id}.mp4"). */
export function sceneStarts(tracks: ReadonlyArray<Pick<Track, "type" | "clips">>, media: ReadonlyArray<MediaLike>): Map<string, number> {
  const byId = new Map(media.map((m) => [m.id, m.name]));
  const out = new Map<string, number>();
  for (const t of tracks) {
    if (t.type !== "video") continue;
    for (const c of t.clips) {
      const name = byId.get(c.mediaId);
      if (!name) continue;
      const sid = name.replace(/\.mp4$/i, "");
      if (!out.has(sid) || c.startTime < (out.get(sid) as number)) out.set(sid, c.startTime);
    }
  }
  return out;
}

export function cueStart(sceneStart: number, offset: number): number {
  return Math.max(0, Math.round((sceneStart + offset) * 1e6) / 1e6);
}

export interface Seen {
  sceneStart: number;
  clipStart: number;
}

export interface SyncResult {
  moves: Array<{ clipId: string; startTime: number }>;
  userEdited: string[];
  seen: Map<string, Seen>;
}

function propsDiffer(clip: Clip, a: AppliedSnapshot): boolean {
  return (
    Math.abs(clip.duration - a.duration) > MOVE_EPS_S ||
    Math.abs(num(clip.volume, 1) - a.volume) > 1e-3 ||
    Math.abs(num(clip.fade?.fadeIn) - a.fade.fadeIn) > 1e-3 ||
    Math.abs(num(clip.fade?.fadeOut) - a.fade.fadeOut) > 1e-3 ||
    automationKey(clip.automation?.volume) !== a.automationKey
  );
}

/**
 * Compares the project with what we saw last time:
 *  - a scene moved and its cue did not → the cue follows (keeps any offset the user already gave it);
 *  - the cue itself moved, or its duration/volume/fade/automation differ from what Framesmith applied → userEdited.
 */
export function detectMusicSync(
  prev: ReadonlyMap<string, Seen>,
  tracks: ReadonlyArray<Pick<Track, "type" | "clips">>,
  media: ReadonlyArray<MediaLike>,
): SyncResult {
  const starts = sceneStarts(tracks, media);
  const moves: SyncResult["moves"] = [];
  const edited = new Set<string>();
  const seen = new Map<string, Seen>();
  for (const t of tracks) {
    for (const clip of t.clips) {
      const meta = readMusicMeta(clip);
      if (!meta) continue;
      const sceneStart = starts.get(meta.applied.sceneId);
      if (sceneStart === undefined) {
        seen.set(meta.cue_id, { sceneStart: prev.get(meta.cue_id)?.sceneStart ?? 0, clipStart: clip.startTime });
        continue;
      }
      const p = prev.get(meta.cue_id);
      let clipStart = clip.startTime;
      if (p) {
        const dScene = sceneStart - p.sceneStart;
        const clipMoved = Math.abs(clip.startTime - p.clipStart) > MOVE_EPS_S;
        if (Math.abs(dScene) > MOVE_EPS_S && !clipMoved) {
          clipStart = Math.max(0, Math.round((p.clipStart + dScene) * 1e6) / 1e6);
          moves.push({ clipId: clip.id, startTime: clipStart });
        } else if (clipMoved && Math.abs(dScene) <= MOVE_EPS_S && !meta.userEdited) {
          edited.add(clip.id);
        }
      }
      if (!meta.userEdited && propsDiffer(clip, meta.applied)) edited.add(clip.id);
      seen.set(meta.cue_id, { sceneStart, clipStart });
    }
  }
  return { moves, userEdited: [...edited], seen };
}
