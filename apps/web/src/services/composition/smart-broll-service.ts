/**
 * Smart B-Roll Generator Service (OR-FEATURE-001)
 *
 * Pipeline:
 * 1. Parse transcript for concepts/keywords
 * 2. Generate visual descriptions via Ollama
 * 3. Create images via ComfyUI
 * 4. Insert into timeline at appropriate timestamps
 */

import { OllamaProvider } from "../ai/providers";
import { ComfyUIProvider, type ImageGenerationRequest } from "../generation";
import type { TranscriptionResponse } from "../ai/providers/types";

export interface BrollSegment {
  readonly timeStart: number;
  readonly timeEnd: number;
  readonly keyword: string;
  readonly visualPrompt: string;
  readonly negativePrompt?: string;
  readonly imageUrl?: string;
  readonly generationTime?: number;
}

export interface SmartBrollRequest {
  readonly transcript: TranscriptionResponse;
  readonly videoContext?: string; // Additional context about the video
  readonly imageModel?: string; // Default: flux
  readonly imageWidth?: number;
  readonly imageHeight?: number;
  readonly maxSegments?: number; // Limit number of B-roll segments
}

export interface SmartBrollResult {
  readonly segments: BrollSegment[];
  readonly totalGenerationTime: number;
  readonly successCount: number;
  readonly failureCount: number;
}

export class SmartBrollService {
  private ollama: OllamaProvider;
  private comfyui: ComfyUIProvider;

  constructor(
    ollamaConfig?: { host?: string; model?: string },
    comfyuiHost?: string,
  ) {
    this.ollama = new OllamaProvider(ollamaConfig);
    this.comfyui = new ComfyUIProvider(comfyuiHost);
  }

  /**
   * Generate smart B-roll for transcript
   */
  async generateBroll(request: SmartBrollRequest): Promise<SmartBrollResult> {
    const startTime = performance.now();

    // Step 1: Extract keywords/concepts from transcript
    const concepts = await this.extractConcepts(
      request.transcript,
      request.videoContext,
      request.maxSegments || 5,
    );

    // Step 2: Generate visual descriptions for each concept
    const prompts = await this.generateVisualPrompts(concepts);

    // Step 3: Generate images for each prompt
    const segments = await this.generateImages(
      prompts,
      request.imageModel || "flux",
      request.imageWidth || 1280,
      request.imageHeight || 720,
    );

    const totalTime = performance.now() - startTime;
    const successCount = segments.filter((s) => s.imageUrl).length;
    const failureCount = segments.length - successCount;

    return {
      segments,
      totalGenerationTime: totalTime,
      successCount,
      failureCount,
    };
  }

  /**
   * Extract key concepts from transcript segments
   */
  private async extractConcepts(
    transcript: TranscriptionResponse,
    videoContext?: string,
    maxConcepts: number = 5,
  ): Promise<
    Array<{
      keyword: string;
      timeStart: number;
      timeEnd: number;
      text: string;
    }>
  > {
    const segmentTexts = transcript.segments
      .slice(0, 10) // Take first 10 segments
      .map((seg) => `[${seg.start.toFixed(2)}s] ${seg.text}`)
      .join("\n");

    const prompt = `You are a video production expert. Analyze this transcript and identify ${maxConcepts} key visual concepts that would benefit from B-roll footage.

For each concept, provide:
1. A single keyword (2-3 words max)
2. The time range in the video when this concept should appear
3. Why it needs B-roll

Context: ${videoContext || "General video"}

Transcript:
${segmentTexts}

Respond in JSON format:
[
  {"keyword": "concept name", "timeStart": 0.0, "timeEnd": 5.5, "description": "why this needs b-roll"},
  ...
]`;

    try {
      const response = await this.ollama.chat([
        { role: "user", content: prompt },
      ]);

      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON found in response");

      const concepts = JSON.parse(jsonMatch[0]) as Array<{
        keyword: string;
        timeStart: number;
        timeEnd: number;
        description: string;
      }>;

      // Find matching transcript segments
      return concepts.map((concept) => {
        const matchingSegment = transcript.segments.find(
          (seg) =>
            seg.start >= concept.timeStart && seg.end <= concept.timeEnd,
        );

        return {
          keyword: concept.keyword,
          timeStart: concept.timeStart,
          timeEnd: concept.timeEnd,
          text: matchingSegment?.text || concept.description,
        };
      });
    } catch (err) {
      console.error("[SmartBroll] Concept extraction failed:", err);
      return [];
    }
  }

  /**
   * Generate visual prompts for concepts
   */
  private async generateVisualPrompts(
    concepts: Array<{ keyword: string; text: string }>,
  ): Promise<
    Array<{
      keyword: string;
      visualPrompt: string;
      negativePrompt: string;
    }>
  > {
    const prompts: Array<{
      keyword: string;
      visualPrompt: string;
      negativePrompt: string;
    }> = [];

    for (const concept of concepts) {
      const prompt = `You are a prompt engineer for AI image generation. Create a detailed, cinematic visual prompt for this concept that would work well as B-roll footage in a professional video.

Concept: "${concept.keyword}"
Context: ${concept.text}

Requirements:
- Cinematic quality (4K, professional production value)
- Dynamic composition suitable for video editing
- No text or watermarks
- Lighting: professional, well-lit
- Style: photorealistic or high-quality artistic

Create a detailed image generation prompt (2-3 sentences) that captures this concept visually.

Also provide a negative prompt to avoid artifacts.

Respond in JSON:
{"visual": "detailed visual prompt here", "negative": "things to avoid"}`;

      try {
        const response = await this.ollama.chat([
          { role: "user", content: prompt },
        ]);

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");

        const parsed = JSON.parse(jsonMatch[0]) as {
          visual: string;
          negative: string;
        };

        prompts.push({
          keyword: concept.keyword,
          visualPrompt: parsed.visual,
          negativePrompt: parsed.negative,
        });
      } catch (err) {
        console.error(
          `[SmartBroll] Prompt generation failed for "${concept.keyword}":`,
          err,
        );
        // Fallback prompt
        prompts.push({
          keyword: concept.keyword,
          visualPrompt: `cinematic footage of ${concept.keyword}, professional production, 4K quality`,
          negativePrompt:
            "text, watermark, low quality, blurry, artifacts",
        });
      }
    }

    return prompts;
  }

  /**
   * Generate images for prompts
   */
  private async generateImages(
    prompts: Array<{ keyword: string; visualPrompt: string; negativePrompt: string }>,
    model: string,
    width: number,
    height: number,
  ): Promise<BrollSegment[]> {
    const segments: BrollSegment[] = [];

    for (const prompt of prompts) {
      const segmentStart = performance.now();

      try {
        const imageRequest: ImageGenerationRequest = {
          model,
          prompt: prompt.visualPrompt,
          negativePrompt: prompt.negativePrompt,
          width,
          height,
          steps: 30,
          cfg: 7.5,
        };

        const result = await this.comfyui.generateImage(imageRequest);

        const generationTime = performance.now() - segmentStart;

        // Extract first image output (ComfyUI returns outputs with image data)
        const imageUrl = this.extractImageUrl(result.outputs);

        segments.push({
          timeStart: 0, // Placeholder - should be set by caller
          timeEnd: 5, // Placeholder
          keyword: prompt.keyword,
          visualPrompt: prompt.visualPrompt,
          negativePrompt: prompt.negativePrompt,
          imageUrl,
          generationTime,
        });
      } catch (err) {
        console.error(
          `[SmartBroll] Image generation failed for "${prompt.keyword}":`,
          err,
        );

        segments.push({
          timeStart: 0,
          timeEnd: 5,
          keyword: prompt.keyword,
          visualPrompt: prompt.visualPrompt,
          negativePrompt: prompt.negativePrompt,
        });
      }
    }

    return segments;
  }

  /**
   * Extract image URL from ComfyUI outputs
   */
  private extractImageUrl(outputs: Record<string, unknown>): string | undefined {
    // ComfyUI returns images as base64 or URLs depending on workflow
    // This is a simplified extraction - actual implementation depends on workflow output
    for (const [, value] of Object.entries(outputs)) {
      if (typeof value === "string" && value.startsWith("http")) {
        return value;
      }
      if (typeof value === "string" && value.startsWith("data:image")) {
        return value;
      }
    }
    return undefined;
  }
}
