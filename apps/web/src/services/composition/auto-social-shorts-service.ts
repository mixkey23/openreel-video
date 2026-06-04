/**
 * Auto Social Shorts Generator Service (OR-FEATURE-005)
 *
 * Pipeline:
 * 1. Transcribe audio (WhisperX)
 * 2. Detect silences and speakers
 * 3. Identify highlight moments via Ollama
 * 4. Generate shorts timeline with natural cuts
 * 5. Suggest captions and transitions
 */

import { WhisperXProvider } from "../transcription/providers/WhisperXProvider";
import { OllamaProvider } from "../ai/providers";
import type { TranscriptionResponse } from "../ai/providers/types";

export interface ShortsSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly type: "highlight" | "transition" | "silence";
  readonly content: string;
  readonly speaker?: string;
  readonly highlightScore?: number; // 0-1 confidence
  readonly suggestedCaption?: string;
  readonly suggestedTransition?: string;
}

export interface ShortsTimeline {
  readonly segments: ShortsSegment[];
  readonly totalDuration: number;
  readonly highlightCount: number;
  readonly estimatedViews?: string; // Qualitative estimate based on content
}

export interface AutoShortsRequest {
  readonly videoUrl: string; // Source video URL
  readonly audioFile?: File | Blob; // Optional pre-extracted audio
  readonly maxDuration?: number; // Target duration for shorts (default: 60s)
  readonly platform?: "tiktok" | "youtube-shorts" | "instagram-reels" | "custom";
  readonly detectHighlights?: boolean;
  readonly addCaptions?: boolean;
  readonly language?: string;
}

export interface AutoShortsResult {
  readonly shorts: ShortsTimeline[];
  readonly generationTime: number;
  readonly transcript: TranscriptionResponse;
  readonly totalHighlightsFound: number;
}

export class AutoSocialShortsService {
  private whisperx: WhisperXProvider;
  private ollama: OllamaProvider;

  constructor(
    transcriptionConfig?: { baseUrl?: string; model?: string },
    ollamaConfig?: { host?: string; model?: string },
  ) {
    this.whisperx = new WhisperXProvider(transcriptionConfig);
    this.ollama = new OllamaProvider(ollamaConfig);
  }

  /**
   * Generate social media shorts from long-form video
   */
  async generateShorts(request: AutoShortsRequest): Promise<AutoShortsResult> {
    const startTime = performance.now();

    // Step 1: Transcribe audio
    let transcript: TranscriptionResponse;
    if (request.audioFile) {
      transcript = await this.whisperx.transcribe(request.audioFile);
    } else {
      // In real implementation, extract audio from video first
      throw new Error("Audio file required for transcription");
    }

    // Step 2: Detect silences and speakers
    const silences = await this.whisperx.detectSilences(request.audioFile!);
    const speakers = await this.whisperx.getSpeakers(request.audioFile!);

    // Step 3: Identify highlights
    const highlights = request.detectHighlights !== false
      ? await this.identifyHighlights(transcript, speakers)
      : [];

    // Step 4: Generate shorts timelines
    const maxDuration = request.maxDuration || 60;
    const shorts = await this.generateShortsTimelines(
      transcript,
      silences,
      highlights,
      maxDuration,
      request.addCaptions || true,
    );

    const generationTime = performance.now() - startTime;

    return {
      shorts,
      generationTime,
      transcript,
      totalHighlightsFound: highlights.length,
    };
  }

  /**
   * Identify highlight moments in transcript
   */
  private async identifyHighlights(
    transcript: TranscriptionResponse,
    speakers: string[],
  ): Promise<
    Array<{
      startTime: number;
      endTime: number;
      text: string;
      highlightScore: number;
      reason: string;
    }>
  > {
    const prompt = `You are a social media content strategist. Analyze this transcript and identify the most engaging moments that would make great social media shorts (TikTok, YouTube Shorts, Instagram Reels).

Focus on:
1. Surprising or dramatic statements
2. Emotional peaks (excitement, inspiration, humor)
3. Educational moments with instant value
4. Trending topics or controversial takes
5. Calls-to-action or viral hooks

Speakers: ${speakers.join(", ")}

Transcript:
${transcript.segments.map((s) => `[${s.start.toFixed(1)}s] ${s.text}`).join("\n")}

For each highlight, provide:
- Start and end time in seconds
- Why it's engaging
- A confidence score (0-1) for virality potential

Respond in JSON:
[
  {"startTime": 0, "endTime": 5, "reason": "why this is a highlight", "score": 0.8},
  ...
]`;

    try {
      const response = await this.ollama.chat([
        { role: "user", content: prompt },
      ]);

      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON found");

      const highlights = JSON.parse(jsonMatch[0]) as Array<{
        startTime: number;
        endTime: number;
        reason: string;
        score: number;
      }>;

      // Enrich with transcript text
      return highlights
        .map((h) => {
          const relevantSegments = transcript.segments.filter(
            (s) => s.start >= h.startTime && s.end <= h.endTime,
          );
          const text = relevantSegments.map((s) => s.text).join(" ");

          return {
            startTime: h.startTime,
            endTime: h.endTime,
            text,
            highlightScore: h.score,
            reason: h.reason,
          };
        })
        .sort((a, b) => b.highlightScore - a.highlightScore)
        .slice(0, 10); // Top 10 highlights
    } catch (err) {
      console.error("[AutoShorts] Highlight detection failed:", err);
      return [];
    }
  }

  /**
   * Generate shorts timelines from highlights and silences
   */
  private async generateShortsTimelines(
    transcript: TranscriptionResponse,
    silences: Array<{ start: number; end: number; duration: number }>,
    highlights: Array<{
      startTime: number;
      endTime: number;
      text: string;
      highlightScore: number;
      reason: string;
    }>,
    maxDuration: number,
    addCaptions: boolean,
  ): Promise<ShortsTimeline[]> {
    const shorts: ShortsTimeline[] = [];

    // For each highlight, create a short
    for (const highlight of highlights) {
      const segments: ShortsSegment[] = [];

      // Main content segment
      segments.push({
        startTime: highlight.startTime,
        endTime: Math.min(
          highlight.endTime,
          highlight.startTime + maxDuration,
        ),
        duration: Math.min(
          highlight.endTime - highlight.startTime,
          maxDuration,
        ),
        type: "highlight",
        content: highlight.text,
        highlightScore: highlight.highlightScore,
        suggestedCaption: addCaptions
          ? await this.generateCaption(highlight.text)
          : undefined,
      });

      // Add natural transitions (silence-based cuts)
      for (const silence of silences) {
        if (
          silence.start > highlight.startTime &&
          silence.start < highlight.endTime
        ) {
          segments.push({
            startTime: silence.start,
            endTime: silence.end,
            duration: silence.duration / 1000,
            type: "silence",
            content: "[silence]",
          });
        }
      }

      // Sort by time
      segments.sort((a, b) => a.startTime - b.startTime);

      const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

      shorts.push({
        segments,
        totalDuration,
        highlightCount: 1,
      });
    }

    return shorts;
  }

  /**
   * Generate captions for segments
   */
  private async generateCaption(text: string): Promise<string> {
    const prompt = `Create a short, engaging caption for social media (max 20 words) based on this content:

"${text}"

Requirements:
- Attention-grabbing
- Use relevant emojis
- Include hashtags if appropriate
- TikTok/Instagram style

Respond with just the caption, no explanations.`;

    try {
      const response = await this.ollama.chat([
        { role: "user", content: prompt },
      ]);
      return response.content.trim();
    } catch (err) {
      console.error("[AutoShorts] Caption generation failed:", err);
      return text.substring(0, 50) + "...";
    }
  }

  /**
   * Get shorts optimized for platform
   */
  optimizeForPlatform(
    result: AutoShortsResult,
    platform: "tiktok" | "youtube-shorts" | "instagram-reels" | "custom",
  ): AutoShortsResult {
    const platformConfig = {
      tiktok: { maxDuration: 60, aspectRatio: "9:16", fps: 30 },
      "youtube-shorts": { maxDuration: 60, aspectRatio: "9:16", fps: 30 },
      "instagram-reels": { maxDuration: 90, aspectRatio: "9:16", fps: 30 },
      custom: { maxDuration: 60, aspectRatio: "16:9", fps: 24 },
    };

    const config = platformConfig[platform];

    // Filter and trim shorts to platform specs
    const optimized = {
      ...result,
      shorts: result.shorts
        .map((s) => ({
          ...s,
          segments: s.segments.filter((seg) => seg.type !== "silence"),
          totalDuration: Math.min(s.totalDuration, config.maxDuration),
        }))
        .filter((s) => s.totalDuration > 5), // Minimum 5 seconds
    };

    return optimized;
  }

  /**
   * Export shorts metadata for timeline editor
   */
  exportToTimeline(shorts: ShortsTimeline[]): Array<{
    id: string;
    startTime: number;
    endTime: number;
    duration: number;
    type: string;
    caption?: string;
  }> {
    const timeline: Array<{
      id: string;
      startTime: number;
      endTime: number;
      duration: number;
      type: string;
      caption?: string;
    }> = [];

    let id = 0;
    for (const short of shorts) {
      for (const segment of short.segments) {
        timeline.push({
          id: `segment-${id++}`,
          startTime: segment.startTime,
          endTime: segment.endTime,
          duration: segment.duration,
          type: segment.type,
          caption: segment.suggestedCaption,
        });
      }
    }

    return timeline;
  }
}
