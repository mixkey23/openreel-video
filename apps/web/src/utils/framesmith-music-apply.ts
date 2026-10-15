/**
 * Applies config.music to the project through an injected store API (so it is testable without the real store).
 * See framesmith-music.ts for the contract and merge rules.
 */
import type { Track } from "@openreel/core";
import {
  buildMeta, cueStart, isValidMusic, META_KEY, musicMediaName, planMusicMerge, readMusicMeta, sanitizeAutomation, sceneStarts, trackNameFor, usableCues,
  type MergePlan,
} from "./framesmith-music";

export interface MusicStoreApi {
  getTracks(): Track[];
  getMediaItems(): Array<{ id: string; name: string }>;
  addTrack(type: "audio"): Promise<boolean>;
  renameTrack(trackId: string, name: string): void;
  importMedia(file: File): Promise<boolean>;
  setMediaOriginalUrl(mediaId: string, url: string): void;
  addClip(trackId: string, mediaId: string, startTime: number, duration?: number): Promise<boolean>;
  removeClip(clipId: string): Promise<boolean>;
  setClipAudioPlan(clipId: string, plan: {
    volume?: number; fade?: { fadeIn: number; fadeOut: number };
    volumeAutomation?: Array<{ time: number; value: number }>; metadata?: Record<string, unknown>;
  }): boolean;
}

export interface ApplyOptions {
  fetchFile?: (url: string, filename: string) => Promise<File>;
  onConflict?: (conflicts: MergePlan["conflicts"]) => void;
  warn?: (msg: string) => void;
}

export interface ApplyReport {
  applied: boolean;
  unchanged: boolean;
  added: string[];
  removed: number;
  skipped: Array<{ cue_id: string; reason: string }>;
  conflicts: MergePlan["conflicts"];
}

async function defaultFetchFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new File([await res.blob()], filename, { type: "audio/wav" });
}

export async function applyFramesmithMusic(music: unknown, api: MusicStoreApi, opts: ApplyOptions = {}): Promise<ApplyReport> {
  const report: ApplyReport = { applied: false, unchanged: false, added: [], removed: 0, skipped: [], conflicts: [] };
  const warn = opts.warn ?? ((m: string) => console.warn(`[Framesmith] ${m}`));
  if (!isValidMusic(music)) return report;
  const fetchFile = opts.fetchFile ?? defaultFetchFile;

  const names = new Set(usableCues(music).map((c) => trackNameFor(c, music)));
  const ownedTracks = () => api.getTracks().filter((t) => t.type === "audio" && (names.has(t.name) || t.clips.some((c) => readMusicMeta(c))));
  const findTrack = (name: string): Track | undefined => api.getTracks().find((t) => t.type === "audio" && t.name === name);
  const plan = planMusicMerge(ownedTracks(), music);
  report.conflicts = plan.conflicts;
  if (plan.conflicts.length) opts.onConflict?.(plan.conflicts);
  if (plan.unchanged) {
    report.unchanged = true;
    return report;
  }

  const ensureTrack = async (name: string): Promise<Track | undefined> => {
    const existing = findTrack(name);
    if (existing) return existing;
    const before = new Set(api.getTracks().map((t) => t.id));
    if (!(await api.addTrack("audio"))) {
      warn(`could not create the music track "${name}"`);
      return undefined;
    }
    const created = api.getTracks().find((t) => t.type === "audio" && !before.has(t.id));
    if (!created) {
      warn(`music track "${name}" not found after creation`);
      return undefined;
    }
    api.renameTrack(created.id, name);
    return findTrack(name) ?? created;
  };

  for (const id of plan.removeClipIds) {
    if (await api.removeClip(id)) report.removed++;
  }

  const starts = sceneStarts(api.getTracks(), api.getMediaItems());
  for (const cue of plan.add) {
    try {
      const sceneStart = starts.get(cue.scene_id) ?? cue.scene_start_s;
      if (sceneStart === undefined) {
        report.skipped.push({ cue_id: cue.cue_id, reason: "scene not in project" });
        warn(`music cue ${cue.cue_id}: scene ${cue.scene_id} is not in the project, skipped`);
        continue;
      }
      const track = await ensureTrack(trackNameFor(cue, music));
      if (!track) throw new Error("music track unavailable");
      const file = await fetchFile(cue.url, musicMediaName(cue.cue_id));
      if (!(await api.importMedia(file))) throw new Error("importMedia failed");
      const media = api.getMediaItems();
      const item = media[media.length - 1];
      if (!item) throw new Error("media item missing after import");
      api.setMediaOriginalUrl(item.id, cue.url);

      const beforeIds = new Set(api.getTracks().flatMap((t) => t.clips.map((c) => c.id)));
      const start = cueStart(sceneStart, cue.offset_in_scene_s ?? 0);
      if (!(await api.addClip(track.id, item.id, start, cue.duration_s))) throw new Error("addClip failed");
      const added = api.getTracks().flatMap((t) => t.clips).find((c) => !beforeIds.has(c.id));
      if (!added) throw new Error("clip not found after addClip");
      const ok = api.setClipAudioPlan(added.id, {
        volume: cue.gain ?? 1,
        fade: { fadeIn: cue.fade?.fadeIn ?? 0, fadeOut: cue.fade?.fadeOut ?? 0 },
        volumeAutomation: sanitizeAutomation(cue.automation_volume),
        metadata: { [META_KEY]: buildMeta(cue, music.version) },
      });
      if (!ok) throw new Error("setClipAudioPlan failed");
      report.added.push(cue.cue_id);
    } catch (err) {
      report.skipped.push({ cue_id: cue.cue_id, reason: err instanceof Error ? err.message : String(err) });
      warn(`music cue ${cue.cue_id} skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  report.applied = report.added.length > 0 || report.removed > 0;
  return report;
}
