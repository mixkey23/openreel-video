/**
 * Auto Storyboard Service (OR-FEATURE-002)
 *
 * Pipeline:
 * 1. Parse script into scenes/shots
 * 2. Generate scene descriptions via Ollama
 * 3. Create keyframe images via ComfyUI
 * 4. Build storyboard timeline
 */

import { OllamaProvider } from "../ai/providers";
import { ComfyUIProvider, type ImageGenerationRequest } from "../generation";

export interface SceneShot {
  readonly sceneNumber: number;
  readonly shotNumber: number;
  readonly description: string;
  readonly duration: number; // seconds
  readonly cameraDirection?: string;
  readonly lighting?: string;
  readonly mood?: string;
}

export interface StoryboardFrame {
  readonly sceneNumber: number;
  readonly shotNumber: number;
  readonly frameNumber: number;
  readonly timestamp: number;
  readonly description: string;
  readonly visualPrompt: string;
  readonly imageUrl?: string;
  readonly cameraDirection?: string;
  readonly lighting?: string;
  readonly mood?: string;
}

export interface AutoStoryboardRequest {
  readonly script: string;
  readonly videoTitle?: string;
  readonly videoDuration?: number; // total target duration
  readonly imageModel?: string; // Default: sdxl
  readonly imageWidth?: number;
  readonly imageHeight?: number;
  readonly shotsPerScene?: number;
}

export interface AutoStoryboardResult {
  readonly scenes: SceneShot[];
  readonly frames: StoryboardFrame[];
  readonly totalDuration: number;
  readonly generationTime: number;
  readonly successCount: number;
}

export class AutoStoryboardService {
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
   * Generate auto storyboard from script
   */
  async generateStoryboard(
    request: AutoStoryboardRequest,
  ): Promise<AutoStoryboardResult> {
    const startTime = performance.now();

    // Step 1: Parse script into shots
    const scenes = await this.parseScriptIntoShots(
      request.script,
      request.videoDuration || 300,
      request.shotsPerScene || 2,
    );

    // Step 2: Generate keyframe descriptions
    const frames = await this.generateKeyframes(scenes, request.videoTitle);

    // Step 3: Generate images for each keyframe
    await this.generateFrameImages(
      frames,
      request.imageModel || "sdxl",
      request.imageWidth || 1920,
      request.imageHeight || 1080,
    );

    const totalTime = performance.now() - startTime;
    const successCount = frames.filter((f) => f.imageUrl).length;
    const totalDuration = frames.length > 0 ? frames[frames.length - 1].timestamp : 0;

    return {
      scenes,
      frames,
      totalDuration,
      generationTime: totalTime,
      successCount,
    };
  }

  /**
   * Parse script into scene shots
   */
  private async parseScriptIntoShots(
    script: string,
    targetDuration: number,
    shotsPerScene: number,
  ): Promise<SceneShot[]> {
    const prompt = `You are a film director analyzing a script. Break this script into key scenes and shots.

For each scene, estimate:
1. Scene number
2. Number of shots
3. Shot descriptions
4. Estimated duration per shot
5. Camera directions (wide, close-up, tracking, etc.)
6. Lighting (natural, dramatic, soft, etc.)
7. Mood (tense, happy, mysterious, etc.)

Target total duration: ${targetDuration} seconds
Shots per scene: ${shotsPerScene}

Script:
${script}

Respond in JSON format:
[
  {
    "sceneNumber": 1,
    "shotNumber": 1,
    "description": "shot description",
    "duration": 5,
    "cameraDirection": "wide shot",
    "lighting": "natural daylight",
    "mood": "peaceful"
  },
  ...
]`;

    try {
      const response = await this.ollama.chat([
        { role: "user", content: prompt },
      ]);

      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("No JSON found");

      const shots = JSON.parse(jsonMatch[0]) as SceneShot[];
      return shots;
    } catch (err) {
      console.error("[AutoStoryboard] Shot parsing failed:", err);
      return [];
    }
  }

  /**
   * Generate detailed keyframe descriptions
   */
  private async generateKeyframes(
    scenes: SceneShot[],
    videoTitle?: string,
  ): Promise<StoryboardFrame[]> {
    const frames: StoryboardFrame[] = [];
    let currentTimestamp = 0;
    let frameNumber = 1;

    for (const scene of scenes) {
      const prompt = `You are a storyboard artist. Create a detailed visual description for this shot that would work as a keyframe image.

Scene: ${scene.description}
Duration: ${scene.duration}s
Camera: ${scene.cameraDirection || "standard"}
Lighting: ${scene.lighting || "standard"}
Mood: ${scene.mood || "neutral"}
${videoTitle ? `Project: ${videoTitle}` : ""}

Create a detailed visual description (3-4 sentences) that a cinematographer could use to set up this shot. Include composition, framing, props, colors, and atmosphere.

Respond in plain text - a detailed visual description only.`;

      try {
        const response = await this.ollama.chat([
          { role: "user", content: prompt },
        ]);

        frames.push({
          sceneNumber: scene.sceneNumber,
          shotNumber: scene.shotNumber,
          frameNumber,
          timestamp: currentTimestamp,
          description: scene.description,
          visualPrompt: response.content,
          cameraDirection: scene.cameraDirection,
          lighting: scene.lighting,
          mood: scene.mood,
        });

        currentTimestamp += scene.duration;
        frameNumber++;
      } catch (err) {
        console.error(
          `[AutoStoryboard] Keyframe generation failed for scene ${scene.sceneNumber}:`,
          err,
        );
      }
    }

    return frames;
  }

  /**
   * Generate images for keyframes
   */
  private async generateFrameImages(
    frames: StoryboardFrame[],
    model: string,
    width: number,
    height: number,
  ): Promise<void> {
    for (const frame of frames) {
      try {
        const imageRequest: ImageGenerationRequest = {
          model,
          prompt: frame.visualPrompt,
          width,
          height,
          steps: 25,
          cfg: 7.0,
        };

        const result = await this.comfyui.generateImage(imageRequest);
        const imageUrl = this.extractImageUrl(result.outputs);

        // Update frame with image URL
        (frame as { imageUrl?: string }).imageUrl = imageUrl;
      } catch (err) {
        console.error(
          `[AutoStoryboard] Image generation failed for frame ${frame.frameNumber}:`,
          err,
        );
      }
    }
  }

  /**
   * Extract image URL from ComfyUI outputs
   */
  private extractImageUrl(outputs: Record<string, unknown>): string | undefined {
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

  /**
   * Generate storyboard as PDF/SVG (metadata only, actual rendering done in UI)
   */
  generateStoryboardMetadata(
    result: AutoStoryboardResult,
  ): Array<{
    frameNumber: number;
    timestamp: string;
    description: string;
    imageUrl?: string;
  }> {
    return result.frames.map((frame) => ({
      frameNumber: frame.frameNumber,
      timestamp: `${Math.floor(frame.timestamp / 60)}:${String(Math.floor(frame.timestamp % 60)).padStart(2, "0")}`,
      description: frame.description,
      imageUrl: frame.imageUrl,
    }));
  }
}
