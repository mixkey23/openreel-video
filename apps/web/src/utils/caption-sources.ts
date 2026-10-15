/**
 * Where captions come from. Pure logic (no React, no store): given the timeline and a scope,
 * produce the list of audio "jobs" to transcribe, each trimmed to the part of the clip that is
 * actually on the timeline (in/out points and playback speed respected).
 *
 * Scopes (from the fork's auto-caption features):
 *  - clip:  the selected clip. A video clip can use its own embedded audio or the audio clips
 *           that sit under it; an audio clip always uses itself.
 *  - range: a span of the timeline, taking audio clips or video clips (extracting their audio).
 *
 * Sources are classified by the clip's MEDIA type, not by track.type, because upstream's
 * "standard" tracks accept every kind of item and track.type is only a legacy hint.
 */
import type { Clip, MediaItem, Project, Track } from "@openreel/core";

export const MIN_OVERLAP_SECONDS = 0.05;

export type CaptionScope =
  | {
      kind: "clip";
      clipId: string;
      /** "own": the clip's own audio. "audio-tracks": audio clips under a video clip. */
      source: "own" | "audio-tracks";
      /** "all" or a track id; only used when source is "audio-tracks". */
      trackId: string;
    }
  | {
      kind: "range";
      start: number;
      end: number;
      source: "audio-tracks" | "video-tracks";
      /** "all" or a track id. */
      trackId: string;
    };

export interface CaptionJob {
  id: string;
  clipId: string;
  mediaId: string;
  mediaName: string;
  trackId: string;
  /** Timeline span covered by this job. */
  timelineStart: number;
  timelineEnd: number;
  /** Source-media span to decode (seconds in the media file). */
  sourceStart: number;
  sourceEnd: number;
  speed: number;
  audioTrackIndex?: number;
}

type ProjectLike = Pick<Project, "timeline" | "mediaLibrary">;

const mediaById = (project: ProjectLike, mediaId: string): MediaItem | undefined =>
  project.mediaLibrary.items.find((item) => item.id === mediaId);

const clipSpeed = (clip: Clip): number => {
  const speed = clip.speed ?? 1;
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
};

/** Build a job for the part of `clip` that overlaps [from, to] on the timeline, or null if too small. */
function jobForOverlap(
  clip: Clip,
  media: MediaItem,
  from: number,
  to: number,
): CaptionJob | null {
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;
  const a = Math.max(clipStart, from);
  const b = Math.min(clipEnd, to);
  if (b - a < MIN_OVERLAP_SECONDS) return null;
  const speed = clipSpeed(clip);
  const inPoint = Math.max(0, clip.inPoint ?? 0);
  return {
    id: `${clip.id}@${a.toFixed(3)}-${b.toFixed(3)}`,
    clipId: clip.id,
    mediaId: clip.mediaId,
    mediaName: media.name,
    trackId: clip.trackId,
    timelineStart: a,
    timelineEnd: b,
    sourceStart: inPoint + (a - clipStart) * speed,
    sourceEnd: inPoint + (b - clipStart) * speed,
    speed,
    audioTrackIndex: clip.audioTrackIndex,
  };
}

const isMuted = (track: Track): boolean => Boolean(track.muted);

function collectByMediaType(
  project: ProjectLike,
  mediaType: "audio" | "video",
  trackId: string,
  from: number,
  to: number,
  options: { skipMuted: boolean },
): CaptionJob[] {
  const jobs: CaptionJob[] = [];
  for (const track of project.timeline.tracks) {
    if (trackId !== "all" && track.id !== trackId) continue;
    if (options.skipMuted && isMuted(track)) continue;
    for (const clip of track.clips) {
      const media = mediaById(project, clip.mediaId);
      if (!media || media.type !== mediaType) continue;
      const job = jobForOverlap(clip, media, from, to);
      if (job) jobs.push(job);
    }
  }
  return jobs.sort((x, y) => x.timelineStart - y.timelineStart);
}

export function findClip(project: ProjectLike, clipId: string): { clip: Clip; track: Track } | undefined {
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, track };
  }
  return undefined;
}

export function collectCaptionJobs(project: ProjectLike, scope: CaptionScope): CaptionJob[] {
  if (scope.kind === "range") {
    const end = scope.end > scope.start ? scope.end : Number.POSITIVE_INFINITY;
    return collectByMediaType(
      project,
      scope.source === "audio-tracks" ? "audio" : "video",
      scope.trackId,
      scope.start,
      end,
      { skipMuted: scope.source === "audio-tracks" },
    );
  }

  const found = findClip(project, scope.clipId);
  if (!found) return [];
  const { clip } = found;
  const media = mediaById(project, clip.mediaId);
  if (!media || (media.type !== "audio" && media.type !== "video")) return [];

  if (media.type === "audio" || scope.source === "own") {
    const job = jobForOverlap(clip, media, clip.startTime, clip.startTime + clip.duration);
    return job ? [job] : [];
  }

  // Video clip, audio taken from the audio clips under it (other clips only, trimmed to this clip's span).
  return collectByMediaType(
    project,
    "audio",
    scope.trackId,
    clip.startTime,
    clip.startTime + clip.duration,
    { skipMuted: true },
  ).filter((job) => job.clipId !== clip.id);
}

/** Tracks that hold at least one clip of the given media type (for the track selectors). */
export function listTracksWithMedia(
  project: ProjectLike,
  mediaType: "audio" | "video",
): Array<{ id: string; name: string }> {
  return project.timeline.tracks
    .filter((track) =>
      track.clips.some((clip) => mediaById(project, clip.mediaId)?.type === mediaType),
    )
    .map((track, index) => ({
      id: track.id,
      name: track.name?.trim() || `${mediaType === "audio" ? "Audio" : "Video"} track ${index + 1}`,
    }));
}

/** Map a time inside the decoded source span (seconds from `sourceStart`, source speed) back to the timeline. */
export function sourceOffsetToTimeline(job: CaptionJob, offsetSeconds: number): number {
  const t = job.timelineStart + Math.max(0, offsetSeconds) / job.speed;
  return Math.min(job.timelineEnd, t);
}
