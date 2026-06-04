/**
 * AI Clip Analyzer Service (OR-FEATURE-003)
 *
 * Pipeline:
 * 1. Extract keyframes from video clip
 * 2. Analyze frames with Ollama Vision
 * 3. Generate suggestions for editing/enhancement
 * 4. Classify clip quality and usage
 */

import { OllamaVisionProvider } from "../ai/providers/ollama/OllamaVisionProvider";

export interface ClipAnalysisRequest {
  readonly clipUrl: string; // Video URL or base64
  readonly keyframeCount?: number; // How many frames to analyze
}

export interface ClipFrameAnalysis {
  readonly frameNumber: number;
  readonly timestamp: number;
  readonly objects: string[];
  readonly scene: string;
  readonly lighting: string;
  readonly composition: string;
  readonly quality: "excellent" | "good" | "fair" | "poor";
  readonly usability: "ready" | "needs_edit" | "needs_enhancement" | "unusable";
  readonly suggestions: string[];
}

export interface ClipAnalysisResult {
  readonly clipUrl: string;
  readonly duration: number;
  readonly frameAnalyses: ClipFrameAnalysis[];
  readonly overallQuality: "excellent" | "good" | "fair" | "poor";
  readonly recommendedUsage: string;
  readonly editingSuggestions: string[];
  readonly enhancementNeeded: string[];
  readonly analysisTime: number;
}

export class AIClipAnalyzerService {
  private visionProvider: OllamaVisionProvider;

  constructor(host?: string, visionModel?: string) {
    this.visionProvider = new OllamaVisionProvider(host, visionModel);
  }

  /**
   * Analyze video clip
   */
  async analyzeClip(request: ClipAnalysisRequest): Promise<ClipAnalysisResult> {
    const startTime = performance.now();
    const keyframeCount = request.keyframeCount || 5;

    // Step 1: Extract keyframes from video
    // Note: In real implementation, this would extract actual frames from video
    // For now, we'll work with a single frame/thumbnail
    const keyframes = await this.extractKeyframes(
      request.clipUrl,
      keyframeCount,
    );

    // Step 2: Analyze each keyframe
    const frameAnalyses: ClipFrameAnalysis[] = [];
    for (let i = 0; i < keyframes.length; i++) {
      const analysis = await this.analyzeFrame(
        keyframes[i],
        i,
      );
      frameAnalyses.push(analysis);
    }

    // Step 3: Generate overall recommendations
    const overallQuality = this.calculateOverallQuality(frameAnalyses);
    const { recommendedUsage, editingSuggestions, enhancementNeeded } =
      this.generateRecommendations(frameAnalyses);

    const analysisTime = performance.now() - startTime;

    return {
      clipUrl: request.clipUrl,
      duration: frameAnalyses.length * 2, // Approximate duration
      frameAnalyses,
      overallQuality,
      recommendedUsage,
      editingSuggestions,
      enhancementNeeded,
      analysisTime,
    };
  }

  /**
   * Extract keyframes from video
   */
  private async extractKeyframes(
    clipUrl: string,
    count: number,
  ): Promise<string[]> {
    // In a real implementation, this would:
    // 1. Load video
    // 2. Extract frames at regular intervals
    // 3. Convert to base64/URL
    //
    // For now, return the URL as-is (will be analyzed as single frame)
    return Array(Math.min(count, 1)).fill(clipUrl);
  }

  /**
   * Analyze a single frame
   */
  private async analyzeFrame(
    frameSource: string,
    frameNumber: number,
  ): Promise<ClipFrameAnalysis> {
    const analysisPrompt = `Analyze this video frame and provide detailed feedback for video editing professionals.

Provide your analysis in JSON format with these exact fields:
{
  "objects": ["list of visible objects/people"],
  "scene": "description of the scene/setting",
  "lighting": "quality and type of lighting",
  "composition": "assessment of frame composition/framing",
  "quality": "excellent|good|fair|poor",
  "usability": "ready|needs_edit|needs_enhancement|unusable",
  "suggestions": ["specific editing suggestions", "enhancement recommendations", ...]
}`;

    try {
      const response = await this.visionProvider.analyzeImage(
        frameSource,
        analysisPrompt,
      );

      // Parse JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");

      const analysis = JSON.parse(jsonMatch[0]) as {
        objects: string[];
        scene: string;
        lighting: string;
        composition: string;
        quality: "excellent" | "good" | "fair" | "poor";
        usability: "ready" | "needs_edit" | "needs_enhancement" | "unusable";
        suggestions: string[];
      };

      return {
        frameNumber,
        timestamp: frameNumber * 2, // Approximate 2s per frame
        objects: analysis.objects,
        scene: analysis.scene,
        lighting: analysis.lighting,
        composition: analysis.composition,
        quality: analysis.quality,
        usability: analysis.usability,
        suggestions: analysis.suggestions,
      };
    } catch (err) {
      console.error(`[ClipAnalyzer] Frame analysis failed:`, err);

      // Fallback analysis
      return {
        frameNumber,
        timestamp: frameNumber * 2,
        objects: [],
        scene: "Unable to analyze",
        lighting: "Unknown",
        composition: "Unknown",
        quality: "poor",
        usability: "unusable",
        suggestions: ["Re-analyze this frame manually"],
      };
    }
  }

  /**
   * Calculate overall quality from frame analyses
   */
  private calculateOverallQuality(
    frameAnalyses: ClipFrameAnalysis[],
  ): "excellent" | "good" | "fair" | "poor" {
    if (frameAnalyses.length === 0) return "poor";

    const qualityScores = {
      excellent: 4,
      good: 3,
      fair: 2,
      poor: 1,
    };

    const avgScore =
      frameAnalyses.reduce((sum, f) => sum + qualityScores[f.quality], 0) /
      frameAnalyses.length;

    if (avgScore >= 3.5) return "excellent";
    if (avgScore >= 2.5) return "good";
    if (avgScore >= 1.5) return "fair";
    return "poor";
  }

  /**
   * Generate recommendations based on analyses
   */
  private generateRecommendations(frameAnalyses: ClipFrameAnalysis[]): {
    recommendedUsage: string;
    editingSuggestions: string[];
    enhancementNeeded: string[];
  } {
    const editingSuggestions = new Set<string>();
    const enhancementNeeded = new Set<string>();

    for (const frame of frameAnalyses) {
      frame.suggestions.forEach((sugg) => {
        if (sugg.toLowerCase().includes("enhance") ||
            sugg.toLowerCase().includes("improve") ||
            sugg.toLowerCase().includes("brightness") ||
            sugg.toLowerCase().includes("contrast")) {
          enhancementNeeded.add(sugg);
        } else {
          editingSuggestions.add(sugg);
        }
      });
    }

    // Determine recommended usage
    const usabilityCount = frameAnalyses.reduce(
      (acc, f) => {
        acc[f.usability] = (acc[f.usability] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    let recommendedUsage = "General B-roll";
    if (usabilityCount["ready"] && usabilityCount["ready"] > frameAnalyses.length * 0.7) {
      recommendedUsage = "Ready for primary cut";
    } else if (usabilityCount["needs_edit"] && usabilityCount["needs_edit"] > frameAnalyses.length * 0.5) {
      recommendedUsage = "Good for B-roll with minor edits";
    } else if (usabilityCount["needs_enhancement"] && usabilityCount["needs_enhancement"] > frameAnalyses.length * 0.5) {
      recommendedUsage = "Requires enhancement before use";
    } else {
      recommendedUsage = "Limited usability - manual review recommended";
    }

    return {
      recommendedUsage,
      editingSuggestions: Array.from(editingSuggestions),
      enhancementNeeded: Array.from(enhancementNeeded),
    };
  }

  /**
   * Get detailed report for editing UI
   */
  getEditingReport(result: ClipAnalysisResult): {
    summary: string;
    timeline: Array<{ timestamp: string; status: string; notes: string }>;
    actions: string[];
  } {
    const timeline = result.frameAnalyses.map((f) => ({
      timestamp: `${Math.floor(f.timestamp / 60)}:${String(Math.floor(f.timestamp % 60)).padStart(2, "0")}`,
      status: f.usability,
      notes: f.suggestions.join("; "),
    }));

    const actions = [
      ...result.editingSuggestions.slice(0, 3),
      ...result.enhancementNeeded.slice(0, 3),
    ];

    return {
      summary: `${result.overallQuality} quality - ${result.recommendedUsage}`,
      timeline,
      actions,
    };
  }
}
