/**
 * Shared utility for caption track management.
 *
 * ensureCaptionsTrack() guarantees:
 *  1. A text track named "Captions" exists in the timeline
 *  2. It is positioned at index 0 (top of the track stack)
 *
 * Returns the track id, or null if creation failed.
 */
import { useProjectStore } from "../stores/project-store";

export async function ensureCaptionsTrack(): Promise<string | null> {
  const { project, addTrack, reorderTrack } = useProjectStore.getState();

  let captionsTrack = project.timeline.tracks.find(
    (t) => t.type === "text" && t.name === "Captions"
  );

  if (!captionsTrack) {
    const result = await addTrack("text");
    if (!result?.success) return null;

    // addTrack doesn't return the new track id — find it by diff
    const updated = useProjectStore.getState().project;
    const newTrack = updated.timeline.tracks.find(
      (t) => t.type === "text" && !project.timeline.tracks.some((o) => o.id === t.id)
    );
    if (!newTrack) return null;

    // Name it
    useProjectStore.setState((state) => ({
      project: {
        ...state.project,
        timeline: {
          ...state.project.timeline,
          tracks: state.project.timeline.tracks.map((t) =>
            t.id === newTrack.id ? { ...t, name: "Captions" } : t
          ),
        },
      },
    }));

    captionsTrack = { ...newTrack, name: "Captions" };
  }

  // Move to top (position 0)
  const currentIndex = useProjectStore
    .getState()
    .project.timeline.tracks.findIndex((t) => t.id === captionsTrack!.id);

  if (currentIndex !== 0) {
    await reorderTrack(captionsTrack.id, 0);
  }

  return captionsTrack.id;
}

export interface SubtitleBlock {
  text: string;
  startTime: number;
  endTime: number;
  words: Array<{ text: string; startTime: number; endTime: number }>;
}

/** Group whisper word array into subtitle blocks (max 10 words / 5 s), offset by clipStart.
 *  Each block includes per-word timestamps so animation styles (karaoke, bounce, etc.) work. */
export function groupWordsToSubtitles(
  words: Array<{ word: string; start: number; end: number }>,
  clipStart: number,
): SubtitleBlock[] {
  if (!words?.length) return [];
  const blocks: SubtitleBlock[] = [];
  let chunk: typeof words = [];
  const flush = () => {
    if (!chunk.length) return;
    blocks.push({
      text:      chunk.map((w) => w.word).join(" ").trim(),
      startTime: clipStart + chunk[0].start,
      endTime:   clipStart + chunk[chunk.length - 1].end,
      words:     chunk.map((w) => ({
        text:      w.word,
        startTime: clipStart + w.start,
        endTime:   clipStart + w.end,
      })),
    });
    chunk = [];
  };
  for (const w of words) {
    if (chunk.length >= 10 || (chunk.length > 0 && w.end - chunk[0].start > 5)) flush();
    chunk.push(w);
  }
  flush();
  return blocks;
}
