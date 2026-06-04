/**
 * Composition Services — smart features combining multiple AI providers
 *
 * These services orchestrate Ollama, WhisperX, and ComfyUI to create
 * high-level video production workflows.
 */

export { SmartBrollService } from "./smart-broll-service";
export type { BrollSegment, SmartBrollRequest, SmartBrollResult } from "./smart-broll-service";

export { AutoStoryboardService } from "./auto-storyboard-service";
export type {
  SceneShot,
  StoryboardFrame,
  AutoStoryboardRequest,
  AutoStoryboardResult,
} from "./auto-storyboard-service";

export { AIClipAnalyzerService } from "./ai-clip-analyzer-service";
export type {
  ClipAnalysisRequest,
  ClipFrameAnalysis,
  ClipAnalysisResult,
} from "./ai-clip-analyzer-service";

export { AutoSocialShortsService } from "./auto-social-shorts-service";
export type {
  ShortsSegment,
  ShortsTimeline,
  AutoShortsRequest,
  AutoShortsResult,
} from "./auto-social-shorts-service";
