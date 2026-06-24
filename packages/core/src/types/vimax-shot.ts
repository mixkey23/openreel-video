export interface VimaxShotClip {
  readonly id: string;
  readonly trackId: string;
  readonly startTime: number;
  readonly duration: number;
  // Storyboard data
  readonly shotIdx: number;
  readonly ffDesc: string;          // first-frame prompt (editable)
  readonly lfDesc?: string;         // last-frame prompt (editable)
  readonly motionDesc?: string;     // motion/camera desc (editable)
  readonly speaker?: string;
  readonly variationType?: "small" | "medium" | "large";
  // LTX Director render mode
  readonly mode: "i2v" | "t2v";    // i2v = Image+Prompt, t2v = Prompt only
  // URLs (from Framesmith API)
  readonly frameUrl?: string;       // URL to first_frame.png
  readonly audioUrl?: string;       // URL to speech.wav
  // Synthetic mediaId — always "vimax-{id}"
  readonly mediaId: string;
}
