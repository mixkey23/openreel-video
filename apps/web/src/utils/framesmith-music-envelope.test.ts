/**
 * OS-503 — the music ducking heard in the editor, on the merged audio engine.
 *
 * For each cue of the recorded Framesmith feed: the automation (ducking) must come out of the engine's
 * own scheduling helpers exactly as Framesmith sent it, stay inside OpenReel's 0..4 range, and the cue's
 * fade-in/out (applied in live preview by upstream's fade envelope) must multiply it without altering the
 * ducking in between. Run with PRINT_ENVELOPE=1 to print the table used in docs/sync/OS-503.md.
 */
import { describe, it, expect } from "vitest";
import {
  getClipFadeEnvelopePoints,
  getVolumeAutomationPointsForRange,
  resolveClipVolumeAutomation,
  type AutomationPoint,
  type Clip,
  type Track,
} from "@openreel/core";
import feed from "./__fixtures__/framesmith-music-feed.json";
import { sanitizeAutomation } from "./framesmith-music";

interface FeedCue {
  cue_id: string;
  duration_s: number;
  gain: number;
  fade: { fadeIn: number; fadeOut: number };
  automation_volume: AutomationPoint[];
}
const cues = feed.clips as unknown as FeedCue[];

/** Piecewise-linear value at t (what AudioParam.linearRampToValueAtTime produces between points). */
function linearAt(points: readonly AutomationPoint[], t: number): number {
  if (points.length === 0) return 1;
  if (t <= points[0].time) return points[0].value;
  for (let i = 1; i < points.length; i += 1) {
    if (t <= points[i].time) {
      const a = points[i - 1];
      const b = points[i];
      const span = b.time - a.time;
      return span <= 1e-9 ? b.value : a.value + ((b.value - a.value) * (t - a.time)) / span;
    }
  }
  return points[points.length - 1].value;
}

const samples = (duration: number): number[] => {
  const grid = [0, 0.25, 0.5, 1, 2, 3, 5, 5.65, 5.8, 8, duration - 1, duration - 0.5, duration - 0.1, duration];
  return [...new Set(grid.filter((t) => t >= 0 && t <= duration).map((t) => Number(t.toFixed(3))))];
};

describe("Framesmith music envelope on the merged audio engine (OS-503)", () => {
  it.each(cues.map((c) => [c.cue_id, c] as const))("%s: ducking is preserved exactly and stays within 0..4", (_id, cue) => {
    const sent = sanitizeAutomation(cue.automation_volume);
    const scheduled = getVolumeAutomationPointsForRange(sent, 0, cue.duration_s, cue.gain);
    for (const t of samples(cue.duration_s)) {
      expect(Math.abs(linearAt(scheduled, t) - linearAt(sent, t))).toBeLessThan(1e-9);
    }
    for (const p of scheduled) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(4);
    }
  });

  it.each(cues.map((c) => [c.cue_id, c] as const))("%s: fades multiply the ducking only at the edges", (_id, cue) => {
    const sent = sanitizeAutomation(cue.automation_volume);
    const ducking = getVolumeAutomationPointsForRange(sent, 0, cue.duration_s, cue.gain);
    const fade = getClipFadeEnvelopePoints({
      clipOffset: 0,
      rangeDuration: cue.duration_s,
      clipDuration: cue.duration_s,
      fadeIn: cue.fade.fadeIn,
      fadeOut: cue.fade.fadeOut,
    });
    const fadeAt = (t: number) => (fade.length === 0 ? 1 : linearAt(fade, t));
    const heard = (t: number) => linearAt(ducking, t) * fadeAt(t);

    if (cue.fade.fadeIn > 0) expect(heard(0)).toBeCloseTo(0, 6);
    if (cue.fade.fadeOut > 0) expect(heard(cue.duration_s)).toBeCloseTo(0, 6);
    const lo = cue.fade.fadeIn + 0.01;
    const hi = cue.duration_s - cue.fade.fadeOut - 0.01;
    for (const t of samples(cue.duration_s).filter((x) => x >= lo && x <= hi)) {
      expect(heard(t)).toBeCloseTo(linearAt(ducking, t), 9); // away from the edges: untouched
    }

    if (process.env.PRINT_ENVELOPE) {
      const rows = samples(cue.duration_s).map((t) => `${t.toFixed(3).padStart(7)} s  ducking=${linearAt(ducking, t).toFixed(3)}  fade=${fadeAt(t).toFixed(3)}  heard=${heard(t).toFixed(3)}`);
      // eslint-disable-next-line no-console
      console.info(`\n[${cue.cue_id}] duration=${cue.duration_s}s gain=${cue.gain} fade=${JSON.stringify(cue.fade)}\n${rows.join("\n")}`);
    }
  });

  it("Framesmith cues never get 'linked' to a scene clip, so the resolution change cannot reach them", () => {
    // Scene (mp4) and cue (wav) come from different media, so isAlignedLinkedClip (same media + start + inPoint) is false.
    const cue = cues[0];
    const automation = sanitizeAutomation(cue.automation_volume);
    const mk = (id: string, mediaId: string, trackId: string, extra: Partial<Clip> = {}): Clip =>
      ({ id, mediaId, trackId, startTime: 0, duration: cue.duration_s, inPoint: 0, outPoint: cue.duration_s, volume: 1, effects: [], audioEffects: [], keyframes: [], ...extra }) as unknown as Clip;
    const track = (id: string, type: Track["type"], clips: Clip[]): Track =>
      ({ id, type, name: id, clips, transitions: [], locked: false, hidden: false, muted: false, solo: false }) as unknown as Track;
    const timeline = {
      tracks: [
        track("tv", "video", [mk("scene", "m_scene_mp4", "tv")]),
        track("tm", "audio", [mk("cue", "m_cue_wav", "tm", { automation: { volume: automation } })]),
      ],
    };
    expect(resolveClipVolumeAutomation(timeline.tracks[1].clips[0], timeline)).toEqual(automation);
    expect(resolveClipVolumeAutomation(timeline.tracks[0].clips[0], timeline)).toEqual([]); // scene gets nothing from the cue
  });
});
